// 기록을 읽는 방식의 규칙 — 화면을 모른다.
//   공개 정보(검색, 지난 페이지 보관본, 오려 두기) · 장부(거르기, 줄 세우기, 짚기) · 돈의 흐름(마디 펼치기, 줄기 짚기) · 답안 대조(겹쳐 보기)
// 자료는 손으로 쓴 사건 데이터(def.records)다. 무엇을 찾았는지는 모두 여기서 판정한다. LLM을 부르지 않는다.
// 결과는 언제나 카드다: apply()로 증거가 되고, 증거판에서 같은 교정 부호로 잇는다.
import { apply, lockOpen } from "./state.js";
import { openHint } from "./reason.js";

const WRONG_FOR_HINT = 3;

export function recOf(st) {
  const r = (st.rec ||= {});
  r.opened ||= {}; //  방식 id → 처음 편 시각(분)
  r.web ||= {};
  r.web.seen ||= {}; //   "쪽" 또는 "쪽@판" → 처음 본 시각
  r.web.parts ||= {}; //  카드 id → 오려 둔 조각들 (여러 글을 모아야 한 장이 되는 카드)
  r.web.trail ||= []; //  찾아본 낱말
  r.ledger ||= {}; //  장부 id → { marks, filters, sort, done }
  r.flow ||= {}; //    흐름 id → { open, marks, done }
  r.answers ||= {}; // 대조 id → { on, done }
  r.wrong ||= {}; //   열쇠 → 틀린 횟수
  return r;
}

// 같은 자료에서 세 번 헛짚으면 지금 물음의 실마리가 하나 열린다 (증거판의 틀린 잇기와 같은 값)
function countWrong(def, st, key) {
  const r = recOf(st);
  r.wrong[key] = (r.wrong[key] || 0) + 1;
  if (r.wrong[key] % WRONG_FOR_HINT) return false;
  return openHint(def, st);
}

// ── 책상 위의 것들 ──
// def.probes: [{ id, kind:"web"|"ledger"|"flow"|"answers", ref, label, when, lockText, minutes }]
export const probeOf = (def, id) => (def.probes || []).find((p) => p.id === id) || null;
export function probeDone(def, st, probe) {
  const r = recOf(st), R = def.records;
  if (probe.kind === "web") return webCards(def).every((id) => id in st.evidence);
  if (probe.kind === "ledger") return Boolean(r.ledger[probe.ref]?.done) || R.ledgers[probe.ref].find.gives in st.evidence;
  if (probe.kind === "flow") return Boolean(r.flow[probe.ref]?.done) || R.flows[probe.ref].find.gives in st.evidence;
  if (probe.kind === "answers") return Boolean(r.answers[probe.ref]?.done) || R.answers[probe.ref].find.gives in st.evidence;
  return false;
}
// "hidden"(아직 책상에 없다) | "locked"(있지만 펼 수 없다) | "open" | "done"
export function probeStatus(def, st, probe) {
  if (probe.showIf && !lockOpen(probe.showIf, st)) return "hidden";
  if (!lockOpen(probe.when, st)) return "locked";
  return probeDone(def, st, probe) ? "done" : "open";
}
// 처음 펼 때만 시간이 든다
export function probeOpen(def, st, id) {
  const probe = probeOf(def, id), r = recOf(st);
  if (!probe || probeStatus(def, st, probe) === "hidden" || probeStatus(def, st, probe) === "locked") return { ok: false, text: probe?.lockText || "" };
  const first = !(id in r.opened);
  if (first) {
    r.opened[id] = st.minute;
    st.minute += probe.minutes || 0;
  }
  return { ok: true, first, minutes: first ? probe.minutes || 0 : 0 };
}

// ── 공개 정보 ──
// 검색은 자유 입력이지만 결과는 손으로 쓴 문서 묶음 안에서만 나온다. 다른 단서에서 얻은 낱말이 열쇠가 된다.
const norm = (s) => String(s || "").toLowerCase().replace(/[\s\-–·.,'"“”‘’「」『』()[\]:?!]/g, "");
const snapsOf = (page) => page.snaps || [{ id: "now", date: page.date, blocks: page.blocks || [] }];
const blockSig = (b) => JSON.stringify([b.t || "p", b.text ?? null, b.rows ?? null, b.items ?? null, b.fig ?? null]);

// 이 사건의 공개 정보에서 얻을 수 있는 카드들
export function webCards(def) {
  const out = new Set();
  for (const p of Object.values(def.records?.web?.pages || {})) for (const s of snapsOf(p)) for (const b of s.blocks) {
    if (b.clip) out.add(b.clip.card);
    for (const c of Object.values(b.clipRow || {})) out.add(c.card);
  }
  return [...out];
}

// → { query, short?, results:[{ id, site, siteName, title, snippet, seen }] }
export function webSearch(def, st, query) {
  const W = def.records.web, q = norm(query), r = recOf(st);
  if (q.length < 2) return { query, short: true, results: [] };
  const out = [];
  Object.entries(W.pages).forEach(([id, p], order) => {
    if (p.unlisted) return;
    const keys = (p.keys || []).map(norm).filter(Boolean);
    let score = 0;
    for (const k of keys) if (q.includes(k)) score = Math.max(score, 2 + k.length / 20);
    // 숨은 글은 열쇠를 정확히 넣어야만 나온다. 나머지는 제목이나 열쇠의 일부로도 걸린다.
    if (!score && !p.hidden && (keys.some((k) => k.includes(q)) || norm(p.title).includes(q))) score = 1;
    if (score) out.push({ id, site: p.site, siteName: W.sites[p.site]?.name || p.site, title: p.title, snippet: p.snippet || "", seen: id in r.web.seen, score, order });
  });
  out.sort((a, b) => b.score - a.score || a.order - b.order);
  const text = String(query).trim();
  r.web.trail = [text, ...r.web.trail.filter((t) => norm(t) !== q)].slice(0, 8);
  return { query: text, results: out.map(({ score, order, ...x }) => x) };
}

// 찾아볼 낱말: 가진 카드와 읽은 글에서 나온다 (수첩에서 찢어 낸 쪽지처럼 검색창 옆에 놓인다)
export function webTerms(def, st) {
  const W = def.records.web, r = recOf(st), out = [], had = new Set();
  const push = (text, from) => {
    const k = norm(text);
    if (!k || had.has(k)) return;
    had.add(k);
    out.push({ text, from });
  };
  for (const id of Object.keys(st.evidence)) for (const t of def.evidence[id]?.terms || []) push(t, def.evidence[id].title);
  for (const key of Object.keys(r.web.seen)) {
    const p = W.pages[key];
    for (const t of p?.terms || []) push(t, W.sites[p.site]?.name || p.title);
  }
  return out;
}

// 한 쪽을 편다. snapId가 없으면 지금의 모습.
export function webPage(def, st, pageId, snapId = null) {
  const W = def.records.web, p = W.pages[pageId];
  if (!p) return null;
  const snaps = snapsOf(p), cur = snaps[snaps.length - 1];
  const snap = snaps.find((s) => s.id === snapId) || cur;
  const r = recOf(st);
  const clipped = (b) => Boolean(b.clip && (b.clip.card in st.evidence || (r.web.parts[b.clip.card] || []).includes(`${pageId}:${b.id}`)));
  return {
    id: pageId, site: p.site, siteName: W.sites[p.site]?.name || p.site, skin: W.sites[p.site]?.skin || "plain", address: p.address || "", title: p.title,
    snap: snap.id, date: snap.date, current: snap === cur, note: snap.note || null,
    snaps: snaps.map((s) => ({ id: s.id, date: s.date, label: s.label || s.date, current: s === cur, seen: s === cur ? pageId in r.web.seen : `${pageId}@${s.id}` in r.web.seen })),
    blocks: snap.blocks.map((b) => ({ ...b, clipped: clipped(b), clippedRows: Object.keys(b.clipRow || {}).filter((k) => b.clipRow[k].card in st.evidence) })),
  };
}
// 읽는 데 드는 시간: 처음 보는 쪽 2분, 처음 보는 옛 판 1분
export function webVisit(def, st, pageId, snapId = null) {
  const p = def.records.web.pages[pageId];
  if (!p) return { ok: false, minutes: 0 };
  const snaps = snapsOf(p), cur = snaps[snaps.length - 1], snap = snaps.find((s) => s.id === snapId) || cur;
  const r = recOf(st), key = snap === cur ? pageId : `${pageId}@${snap.id}`;
  if (key in r.web.seen) return { ok: true, first: false, minutes: 0 };
  const minutes = snap === cur ? p.minutes ?? 2 : 1;
  r.web.seen[key] = st.minute;
  if (snap !== cur && !(pageId in r.web.seen)) r.web.seen[pageId] = st.minute;
  st.minute += minutes;
  return { ok: true, first: true, minutes };
}
// 한 대목을 오려 둔다 → 카드. 여러 글을 모아야 하는 카드는 조각이 다 모였을 때 한 장이 된다.
export function webClip(def, st, pageId, snapId, blockId) {
  const W = def.records.web, p = W.pages[pageId];
  if (!p) return { ok: false, text: "" };
  const snaps = snapsOf(p), cur = snaps[snaps.length - 1], snap = snaps.find((s) => s.id === snapId) || cur;
  // 표의 한 줄은 "블록:줄"로 짚는다
  const [bid, rowId] = String(blockId).split(":");
  const b = snap.blocks.find((x) => x.id === bid);
  if (!b) return { ok: false, text: "" };
  const r = recOf(st);
  const clip = rowId != null ? b.clipRow?.[rowId] : b.clip;
  if (!clip) {
    const kept = snap !== cur && cur.blocks.some((x) => blockSig(x) === blockSig(b));
    const text = b.miss || (kept ? "이 대목은 지금 페이지에도 그대로 있다. 사라진 것을 찾는다." : p.miss || "오려 둘 만한 대목이 아니다.");
    return { ok: false, kind: "miss", text, hint: countWrong(def, st, `web:${pageId}`) };
  }
  const { card, part } = clip;
  if (card in st.evidence) return { ok: false, kind: "dup", text: "이미 오려 둔 것이다." };
  if (part) {
    const parts = (r.web.parts[card] ||= []), key = `${pageId}:${b.id}`, total = W.parts?.[card] || 1;
    if (parts.includes(key)) return { ok: false, kind: "dup", text: "이미 오려 둔 것이다." };
    parts.push(key);
    if (parts.length < total) return { ok: true, partial: true, card, have: parts.length, total };
  }
  return { ok: true, card, fresh: apply(st, { ...(clip.effect || {}), evidence: [card] }) };
}

// ── 짚은 줄의 판정 (장부와 돈의 흐름이 함께 쓴다) ──
// find: { gives, need:[..], min?, allow:[..], near:{ 줄: 까닭 }, partial: 글 | [{ lacks:[..], text }], miss, effect }
function judgeMarks(def, st, find, marks, key) {
  if (find.gives in st.evidence) return { ok: false, kind: "dup", text: "이미 카드로 만든 것이다." };
  if (!marks.length) return { ok: false, kind: "empty", text: "짚은 줄이 없다." };
  const need = new Set(find.need), allow = new Set(find.allow || []);
  const stray = marks.filter((m) => !need.has(m) && !allow.has(m));
  if (stray.length) return { ok: false, kind: "stray", rows: stray, text: find.near?.[stray[0]] || find.miss || "이 줄은 답이 아니다.", hint: countWrong(def, st, key) };
  const hit = marks.filter((m) => need.has(m)).length;
  if (hit < (find.min ?? need.size)) {
    const P = find.partial;
    const text = typeof P === "string" ? P : (P || []).find((x) => x.lacks.some((id) => !marks.includes(id)))?.text || "아직 모자라다.";
    return { ok: false, kind: "partial", text, hint: countWrong(def, st, key) };
  }
  return { ok: true, card: find.gives, fresh: apply(st, { ...(find.effect || {}), evidence: [find.gives] }) };
}

// ── 장부 ──
// 거르는 조건: { col, op:"is", value } | { op:"around", at, slack, card? } (그 시각 앞뒤로 문을 지난 줄) | { op:"band", from, to, label } (하루 가운데 시간대)
export function ledgerOf(st, id) {
  return (recOf(st).ledger[id] ||= { marks: [], filters: [], sort: null, done: false });
}
const timesOf = (L, row) => (L.time ? [row[L.time.from], row[L.time.to]].filter((t) => t != null) : []);
const dayMinute = (t) => ((t % 1440) + 1440) % 1440;
function passes(L, row, f) {
  if (f.op === "is") return row[f.col] === f.value;
  if (f.op === "around") return timesOf(L, row).some((t) => Math.abs(t - f.at) <= f.slack);
  if (f.op === "band") return timesOf(L, row).slice(0, 1).some((t) => dayMinute(t) >= f.from && dayMinute(t) < f.to);
  return true;
}
const sameFilter = (a, b) => a.op === b.op && (a.op === "is" ? a.col === b.col && a.value === b.value : a.op === "around" ? a.at === b.at : a.from === b.from && a.to === b.to);

export function ledgerView(def, st, id) {
  const L = def.records.ledgers[id], me = ledgerOf(st, id);
  let rows = L.rows.filter((row) => me.filters.every((f) => passes(L, row, f)));
  if (me.sort) {
    const { col, dir } = me.sort;
    const v = (row) => row[col];
    rows = [...rows].sort((a, b) => (v(a) === v(b) ? 0 : (v(a) < v(b) ? -1 : 1) * dir));
  }
  // 거르는 열쇠가 되는 카드: 시각이 적힌 카드 가운데 이 장부가 받는 것
  const keys = (L.keys || []).filter((c) => c in st.evidence && def.evidence[c]?.at != null).map((c) => ({ card: c, title: def.evidence[c].title, at: def.evidence[c].at, on: me.filters.some((f) => f.op === "around" && f.card === c) }));
  return { ledger: L, columns: L.columns, rows: rows.map((row) => ({ row, marked: me.marks.includes(row.id) })), total: L.rows.length, shown: rows.length, filters: me.filters, sort: me.sort, keys, marks: me.marks, done: me.done || L.find.gives in st.evidence };
}
// 조건을 더한다. 같은 조건을 다시 넣으면 뺀다. null이면 모두 지운다.
export function ledgerFilter(def, st, id, f) {
  const me = ledgerOf(st, id);
  if (f == null) return void (me.filters = []);
  const at = me.filters.findIndex((x) => sameFilter(x, f));
  if (at >= 0) me.filters.splice(at, 1);
  else {
    // 한 열에는 값 하나, 시간대도 하나만
    me.filters = me.filters.filter((x) => !(x.op === "is" && f.op === "is" && x.col === f.col) && !(x.op === "band" && f.op === "band"));
    me.filters.push(f);
  }
}
// 카드의 시각으로 거른다: 그 시각 앞뒤로 문을 지난 줄만 남는다
export function ledgerCardFilter(def, st, id, card) {
  const L = def.records.ledgers[id], ev = def.evidence[card];
  if (!L.time || !(card in st.evidence) || ev?.at == null || !(L.keys || []).includes(card)) return false;
  ledgerFilter(def, st, id, { op: "around", at: ev.at, slack: L.time.slack ?? 30, card });
  return true;
}
export function ledgerSort(st, id, col) {
  const me = ledgerOf(st, id);
  me.sort = me.sort?.col !== col ? { col, dir: 1 } : me.sort.dir === 1 ? { col, dir: -1 } : null;
}
export function ledgerMark(def, st, id, rowId) {
  const L = def.records.ledgers[id], me = ledgerOf(st, id);
  if (me.done || !L.rows.some((x) => x.id === rowId)) return false;
  me.marks = me.marks.includes(rowId) ? me.marks.filter((x) => x !== rowId) : [...me.marks, rowId];
  return true;
}
export function ledgerSubmit(def, st, id) {
  const L = def.records.ledgers[id], me = ledgerOf(st, id);
  const res = judgeMarks(def, st, L.find, me.marks, `ledger:${id}`);
  if (res.ok) me.done = true;
  return res;
}

// ── 돈의 흐름 ──
// 통장 사본이 있는 계좌는 마디를 펼칠 수 있다. 펼친 계좌의 거래만 보인다.
export function flowOf(def, st, id) {
  const F = def.records.flows[id];
  return (recOf(st).flow[id] ||= { open: F.accounts.filter((a) => a.open).map((a) => a.id), marks: [], done: false });
}
export function flowView(def, st, id) {
  const F = def.records.flows[id], me = flowOf(def, st, id);
  const acc = (x) => F.accounts.find((a) => a.id === x) || null;
  const isOpen = (x) => me.open.includes(x);
  const tx = F.tx.filter((t) => isOpen(t.from) || isOpen(t.to)).map((t) => ({ ...t, marked: me.marks.includes(t.id) }));
  const lanes = F.accounts.filter((a) => isOpen(a.id));
  // 아직 펼치지 않았지만 사본이 있는 계좌 (거래 상대로 드러난 것만)
  const stubs = F.accounts.filter((a) => !isOpen(a.id) && a.copy && tx.some((t) => t.from === a.id || t.to === a.id));
  return { flow: F, from: F.from, to: F.to, lanes, stubs, tx, name: (x) => acc(x)?.name || F.parties?.[x] || x, isOpen, marks: me.marks, done: me.done || F.find.gives in st.evidence };
}
export function flowOpen(def, st, id, accId) {
  const F = def.records.flows[id], me = flowOf(def, st, id), a = F.accounts.find((x) => x.id === accId);
  if (!a || me.open.includes(accId)) return { ok: false, text: "" };
  if (!a.copy) return { ok: false, text: "이 계좌의 사본은 없다." };
  me.open.push(accId);
  st.minute += a.minutes ?? 3;
  return { ok: true, minutes: a.minutes ?? 3 };
}
export function flowMark(def, st, id, txId) {
  const me = flowOf(def, st, id), v = flowView(def, st, id);
  if (me.done || !v.tx.some((t) => t.id === txId)) return false;
  me.marks = me.marks.includes(txId) ? me.marks.filter((x) => x !== txId) : [...me.marks, txId];
  return true;
}
export function flowSubmit(def, st, id) {
  const F = def.records.flows[id], me = flowOf(def, st, id);
  const res = judgeMarks(def, st, F.find, me.marks, `flow:${id}`);
  if (res.ok) me.done = true;
  return res;
}

// ── 답안 대조 ──
// 답안지를 라이트 박스에 겹친다. 넷이 같은 칸을 칠했는데 정답과 다른 곳이 하나 있다.
export function answersOf(st, id) {
  return (recOf(st).answers[id] ||= { on: [], done: false });
}
export function answersView(def, st, id) {
  const A = def.records.answers[id], me = answersOf(st, id);
  const sheets = A.sheets.map((s) => ({ ...s, owned: s.card in st.evidence, on: me.on.includes(s.id) && s.card in st.evidence }));
  const on = sheets.filter((s) => s.on);
  const cols = A.questions.map((q) => {
    const picks = on.map((s) => s.answers[q]);
    const same = picks.length > 0 && picks.every((p) => p === picks[0]);
    return { q, key: A.key[q], picks, same, off: same && picks[0] !== A.key[q] ? picks[0] : null, mixed: picks.length > 1 && !same };
  });
  const ratios = A.ratios.card in st.evidence ? A.ratios.by : null;
  return { answers: A, sheets, on, cols, ratios, ready: sheets.every((s) => s.owned), stacked: sheets.every((s) => s.on), done: me.done || A.find.gives in st.evidence };
}
export function answersToggle(def, st, id, sheetId) {
  const A = def.records.answers[id], me = answersOf(st, id), s = A.sheets.find((x) => x.id === sheetId);
  if (!s || !(s.card in st.evidence)) return false;
  me.on = me.on.includes(sheetId) ? me.on.filter((x) => x !== sheetId) : [...me.on, sheetId];
  return true;
}
// 한 문항의 한 답을 짚는다: "이것이 우연일 수 있나"
export function answersPick(def, st, id, q, option) {
  const A = def.records.answers[id], me = answersOf(st, id), v = answersView(def, st, id), F = A.find;
  if (F.gives in st.evidence) return { ok: false, kind: "dup", text: "이미 카드로 만든 것이다." };
  if (!v.ready) return { ok: false, kind: "lack", text: "견줄 답안이 아직 다 모이지 않았다." };
  if (!v.stacked) return { ok: false, kind: "stack", text: "아직 겹치지 않은 답안이 있다. 모두 올려놓고 본다." };
  if (!v.ratios) return { ok: false, kind: "ratio", text: "이 답이 얼마나 드문지 말해 줄 숫자가 없다. 전국의 선택 비율을 찾는다." };
  const key = `answers:${id}`;
  if (q !== F.q) return { ok: false, kind: "miss", text: "이 문항은 모두 맞혔다. 맞은 답이 같은 것은 이상한 일이 아니다.", hint: countWrong(def, st, key) };
  if (option === A.key[q]) return { ok: false, kind: "miss", text: "그것은 정답이다. 넷이 고른 답은 다른 칸에 있다.", hint: countWrong(def, st, key) };
  if (option !== F.option) return { ok: false, kind: "miss", text: "넷이 고른 답이 아니다.", hint: countWrong(def, st, key) };
  me.done = true;
  return { ok: true, card: F.gives, fresh: apply(st, { ...(F.effect || {}), evidence: [F.gives] }), chance: answersChance(def, id) };
}
// 서로 모르는 사람들이 저마다 골라 이렇게 될 일은 몇 번에 한 번인가
export function answersChance(def, id) {
  const A = def.records.answers[id], p = A.ratios.by[A.find.q][A.find.option - 1] / 100, n = A.sheets.length;
  return { percent: A.ratios.by[A.find.q][A.find.option - 1], people: n, oneIn: Math.round(1 / p ** n) };
}
