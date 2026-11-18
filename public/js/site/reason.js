// 수첩과 증거판의 규칙 — 화면을 모른다.
// 카드를 잇고(교정 부호), 판본을 견주고, 시간 띠에 올리고, 빈칸 문장을 맞춘다. 수첩에 적을 것을 고른다.
// 판정은 모두 여기서 한다. 손으로 쓴 사건 데이터(links, deductions, timeline)를 읽을 뿐, LLM을 부르지 않는다.
import { apply, lockOpen, currentQuestion } from "./state.js";

// 교정 부호 넷. 이 세계에서 도장은 교열하는 사람의 물건이다: 빨간 실 대신 교정 부호로 잇는다.
export const RELS = {
  contra: { label: "맞지 않는다", sub: "모순", key: "1", miss: "둘은 서로 어긋나지 않는다." },
  same: { label: "같다", sub: "일치", key: "2", miss: "둘이 같은 것을 가리킨다고 볼 근거가 없다." },
  time: { label: "앞뒤", sub: "시간", key: "3", miss: "둘 사이에 앞뒤를 따질 일이 없다." },
  source: { label: "원문", sub: "출처", key: "4", miss: "어느 쪽도 다른 쪽의 원문이 아니다." },
};
export const REL_ORDER = ["contra", "same", "time", "source"];
const WRONG_FOR_HINT = 3;

const pairKey = (a, b) => [a, b].sort().join("|");
const samePair = (from, a, b) => (from[0] === a && from[1] === b) || (from[0] === b && from[1] === a);
const forms = (link) => [{ from: link.from, rel: link.rel }, ...(link.alt || [])];

export function boardOf(st) {
  const b = (st.board ||= {});
  b.pos ||= {};
  b.links ||= {}; //  쪽지 id → { a, b, rel }
  b.more ||= []; //   같은 쪽지에 닿은 다른 길 { id, a, b, rel }
  b.wrong ||= {}; //  "A|B" → 틀린 횟수
  b.strip ||= []; //  시간 띠에 올린 카드
  b.ded ||= {}; //    추리 id → { slots, solved, tries }
  b.seen ||= []; //   판에서 한 번 본 카드 (새로 온 카드를 가려낸다)
  st.hints ||= {}; // 물음 id → 열린 실마리 수
  return b;
}

export const cardOf = (def, id) => def.evidence[id] || null;
export const isNote = (def, id) => def.evidence[id]?.kind === "추론";
export const ownedCards = (st) => Object.keys(st.evidence).sort((a, b) => st.evidence[a] - st.evidence[b] || (a < b ? -1 : 1));

// 이 쌍으로 만들 수 있는 쪽지들
function candidates(def, a, b) {
  const out = [];
  for (const [id, link] of Object.entries(def.links || {})) for (const form of forms(link)) if (samePair(form.from, a, b)) out.push({ id, link, form });
  return out;
}
const drawn = (board, a, b) => Object.values(board.links).some((l) => samePair([l.a, l.b], a, b)) || board.more.some((l) => samePair([l.a, l.b], a, b));

// 같은 쌍을 세 번 틀리면 지금 물음의 실마리가 하나 열린다
function countWrong(def, st, a, b) {
  const board = boardOf(st), key = pairKey(a, b);
  board.wrong[key] = (board.wrong[key] || 0) + 1;
  if (board.wrong[key] % WRONG_FOR_HINT) return false;
  return openHint(def, st);
}
export function openHint(def, st) {
  const q = currentQuestion(def, st);
  const have = st.hints[q?.id] || 0;
  if (!q?.hints || have >= q.hints.length) return false;
  st.hints[q.id] = have + 1;
  return true;
}

// 두 카드를 한 부호로 잇는다.
// → { ok:true, id, fresh, again?, close? } | { ok:true, compare:id } | { ok:false, kind, text, hint? }
export function tryLink(def, st, a, b, rel) {
  const board = boardOf(st);
  if (a === b || !(a in st.evidence) || !(b in st.evidence) || !RELS[rel]) return { ok: false, kind: "none", text: "이을 수 없다." };
  if (drawn(board, a, b)) return { ok: false, kind: "dup", text: "이미 이은 사이다." };
  const cands = candidates(def, a, b);
  if (!cands.length) {
    const authored = (def.misses || []).find((m) => samePair(m.pair, a, b));
    return { ok: false, kind: "none", text: authored?.text || RELS[rel].miss, hint: countWrong(def, st, a, b) };
  }
  const hit = cands.find((c) => c.form.rel === rel);
  if (!hit) return { ok: false, kind: "rel", text: "둘은 이어진다. 그런데 이 부호가 아니다.", hint: countWrong(def, st, a, b) };
  // 앞뒤는 먼저 일어난 일에서 나중 일로 긋는다
  if (rel === "time" && hit.form.from[0] !== a) return { ok: false, kind: "order", text: "앞뒤가 바뀌었다. 먼저 일어난 일에서 나중 일로 긋는다." };
  if (hit.link.compare && !(hit.id in st.evidence)) return { ok: true, compare: hit.id };
  return makeLink(def, st, hit.id, a, b, rel);
}
export function makeLink(def, st, id, a, b, rel) {
  const board = boardOf(st), link = def.links[id];
  if (id in board.links) {
    board.more.push({ id, a, b, rel });
    return { ok: true, id, again: true, fresh: { evidence: [], items: [] } };
  }
  board.links[id] = { a, b, rel };
  const fresh = apply(st, { ...(link.effect || {}), evidence: [id, ...(link.effect?.evidence || [])] });
  return { ok: true, id, fresh, close: Boolean(link.close) };
}

// ── 판본 비교: 원문과 기사를 낱말 단위로 견준다 ──
// 가장 긴 공통 부분열. 돌려주는 값: [{ op: "same"|"del"|"add", text }]
export function diffWords(a, b) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) out.push({ op: "same", text: a[i++] }), j++;
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: "del", text: a[i++] });
    else out.push({ op: "add", text: b[j++] });
  }
  while (i < n) out.push({ op: "del", text: a[i++] });
  while (j < m) out.push({ op: "add", text: b[j++] });
  return out;
}
// 두 문서를 나란히 놓을 수 있게 푼다. 바뀐 낱말은 이어진 것끼리 한 덩이(run)로 묶는다.
// → { left:[{ text, run|null, br }], right:[..], runs:[{ id, side:"left"|"right", text }] }
export function compareView(def, linkId) {
  const link = def.links[linkId];
  const [A, B] = link.from.map((id) => def.evidence[id]);
  const BR = "\u0001";
  const tok = (body) => body.flatMap((s, i) => [...s.split(/\s+/).filter(Boolean), ...(i < body.length - 1 ? [BR] : [])]);
  const ops = diffWords(tok(A.body), tok(B.body));
  const left = [], right = [], runs = [];
  let cur = null;
  for (const o of ops) {
    if (o.text === BR) {
      if (o.op !== "add") left.push({ br: true });
      if (o.op !== "del") right.push({ br: true });
      cur = null;
      continue;
    }
    if (o.op === "same") {
      left.push({ text: o.text, run: null });
      right.push({ text: o.text, run: null });
      cur = null;
      continue;
    }
    const side = o.op === "del" ? "left" : "right";
    if (!cur || cur.side !== side) runs.push((cur = { id: runs.length, side, text: "" }));
    cur.text += (cur.text ? " " : "") + o.text;
    (side === "left" ? left : right).push({ text: o.text, run: cur.id });
  }
  return { a: link.from[0], b: link.from[1], left, right, runs, prompt: link.compare.prompt };
}
// 차이 하나를 짚는다
export function pickCompare(def, st, linkId, runId) {
  const link = def.links[linkId], view = compareView(def, linkId);
  const run = view.runs.find((r) => r.id === runId);
  if (!run) return { ok: false, text: "" };
  if (!run.text.includes(link.compare.target)) return { ok: false, text: link.compare.miss, hint: countWrong(def, st, link.from[0], link.from[1]) };
  return makeLink(def, st, linkId, link.from[0], link.from[1], link.rel);
}

// ── 시간 띠 ──
export function stripAdd(def, st, id) {
  const board = boardOf(st), ev = def.evidence[id];
  if (!ev || !(id in st.evidence)) return { ok: false, text: "" };
  if (ev.at == null) return { ok: false, text: "시각이 적혀 있지 않은 카드다." };
  if (board.strip.includes(id)) return { ok: false, text: "이미 띠에 꽂혀 있다." };
  board.strip.push(id);
  // 봉인된 시간 안에 무언가가 놓이는 순간, 한 번만 알아챈다
  let insight = null;
  for (const band of def.timeline?.bands || []) {
    if (!board.strip.includes(band.card) || st.flags[`strip_${band.id}`]) continue;
    if (board.strip.some((x) => x !== band.card && def.evidence[x].at > band.from && def.evidence[x].at < band.to)) {
      st.flags[`strip_${band.id}`] = true;
      insight = band.note;
    }
  }
  return { ok: true, insight };
}
export function stripRemove(st, id) {
  const board = boardOf(st);
  board.strip = board.strip.filter((x) => x !== id);
}
export function stripView(def, st) {
  const board = boardOf(st), T = def.timeline;
  const bands = (T.bands || []).filter((b) => board.strip.includes(b.card));
  const inside = (at) => bands.some((b) => at > b.from && at < b.to);
  return {
    from: T.from, to: T.to, now: st.minute, blocks: T.blocks || [], bands,
    marks: (T.marks || []).filter((m) => lockOpen(m.when, st)),
    items: board.strip.map((id) => ({ id, at: def.evidence[id].at, title: def.evidence[id].title, inside: inside(def.evidence[id].at) && !bands.some((b) => b.card === id) })),
  };
}
export const stripX = (view, minute) => (minute - view.from) / (view.to - view.from);

// ── 빈칸 추리 ──
export const dedOpen = (def, st) => (def.deductions || []).filter((d) => lockOpen(d.when, st));
export function dedParts(ded, st) {
  return (ded.variants || []).find((v) => lockOpen(v.when, st))?.parts || ded.parts;
}
export const dedSlots = (ded, st) => dedParts(ded, st).filter((p) => p.slot).map((p) => p.slot);
export function dedState(st, id) {
  return (boardOf(st).ded[id] ||= { slots: {}, solved: false, tries: 0 });
}
export function setSlot(def, st, id, slot, card) {
  const ded = def.deductions.find((d) => d.id === id), me = dedState(st, id);
  if (me.solved || !dedSlots(ded, st).includes(slot)) return false;
  if (card == null) delete me.slots[slot];
  else if (!(card in st.evidence)) return false;
  else {
    for (const [k, v] of Object.entries(me.slots)) if (v === card) delete me.slots[k]; // 한 카드는 한 칸에만
    me.slots[slot] = card;
  }
  return true;
}
// 칸에 든 카드를 문장 속 말로 (맞는 카드면 그 칸에 맞춘 말, 아니면 카드 제목)
export const slotPhrase = (def, ded, slot, card) => ded.slots[slot].accept[card] || def.evidence[card]?.title || "";
// 맞춰 본다. 틀리면 게임 속 시간이 흐른다.
export function checkDeduction(def, st, id) {
  const ded = def.deductions.find((d) => d.id === id), me = dedState(st, id);
  const slots = dedSlots(ded, st);
  if (me.solved) return { ok: true, already: true };
  if (slots.some((s) => !me.slots[s])) return { ok: false, incomplete: true };
  const result = {};
  for (const s of slots) {
    const card = me.slots[s], S = ded.slots[s];
    result[s] = card in S.accept ? { ok: true } : { ok: false, text: S.near?.[card] || S.miss || "이 칸에 들어갈 카드가 아니다." };
  }
  me.tries++;
  if (Object.values(result).every((r) => r.ok)) {
    me.solved = true;
    const fresh = apply(st, ded.effect || {});
    return { ok: true, slots: result, sentence: dedSentence(def, ded, st), fresh };
  }
  st.minute += ded.wrongMinutes || 0;
  return { ok: false, slots: result, minutes: ded.wrongMinutes || 0, hint: me.tries % WRONG_FOR_HINT === 0 && openHint(def, st) };
}
export function dedSentence(def, ded, st) {
  const me = dedState(st, ded.id);
  return dedParts(ded, st).map((p) => (p.slot ? slotPhrase(def, ded, p.slot, me.slots[p.slot]) : p)).join("");
}

// ── 수첩에 적을 것 ──
// 물음: 지금의 물음, 지나온 물음, 열린 실마리, 시한
export function questionsPage(def, st) {
  boardOf(st);
  const cur = currentQuestion(def, st);
  const list = [];
  for (const q of def.questions || []) {
    if (!lockOpen(q.when, st)) continue;
    const cards = (q.cards || []).map((id) => ({ id, title: def.evidence[id]?.title || id, owned: id in st.evidence }));
    const have = cards.filter((c) => c.owned).length;
    const closed = Boolean(q.until && lockOpen(q.until, st)); // 곁가지 물음은 풀면 닫힌다
    list.push({ q, now: q === cur, done: closed || (q !== cur && have === cards.length), have, total: cards.length, cards, hints: (q.hints || []).slice(0, st.hints[q.id] || 0) });
  }
  const deds = dedOpen(def, st).map((d) => ({ ded: d, solved: dedState(st, d.id).solved, sentence: dedState(st, d.id).solved ? dedSentence(def, d, st) : null }));
  return { current: cur, list, deds };
}
// 사실: 본 것, 들은 것, 거짓으로 드러난 것. mark = "seen" | "heard" | "false" | "note"
export function factsPage(def, st) {
  const carried = [], here = [], notes = [];
  for (const id of ownedCards(st)) {
    const ev = def.evidence[id];
    if (!ev) continue;
    const refuted = ev.refutedBy && ev.refutedBy in st.evidence;
    const item = { id, title: ev.title, text: ev.text, kind: ev.kind, minute: st.evidence[id], mark: refuted ? "false" : ev.kind === "진술" || ev.kind === "글" ? "heard" : "seen" };
    if (ev.kind === "추론") notes.push({ ...item, mark: "note" });
    else (ev.carried ? carried : here).push(item);
  }
  // 증거가 되지 않은 관찰도 적는다. 그 가운데 몇은 증거판으로 꺼낼 수 있다.
  for (const s of def.allSpots || def.spots || []) {
    if (!s.note || !st.seen[s.id]) continue;
    here.push({ id: null, spot: s.id, title: s.label, text: s.note, kind: "관찰", minute: st.seenAt?.[s.id] ?? st.minute, mark: "seen", pull: s.card && !(s.card in st.evidence) ? s.card : null, pulled: Boolean(s.card && s.card in st.evidence) });
  }
  for (const [cid, pick] of Object.entries(st.choices || {})) {
    const note = def.choiceNotes?.[cid]?.[pick];
    if (note) here.push({ id: null, title: "고른 것", text: note, kind: "선택", minute: st.minute, mark: "seen" });
  }
  here.sort((a, b) => a.minute - b.minute);
  return [{ title: "앞서 알아낸 것", items: carried }, { title: def.caseTitle || def.title, items: here }, { title: "판에서 이은 것", items: notes }].filter((g) => g.items.length);
}
// 수첩의 관찰을 증거판의 카드로 꺼낸다
export function pullFact(def, st, cardId) {
  const s = (def.allSpots || def.spots || []).find((x) => x.card === cardId);
  if (!s || !st.seen[s.id] || cardId in st.evidence) return null;
  return apply(st, { evidence: [cardId] });
}
// 인물: 한 말(밑줄), 아직 묻지 않은 것. 믿음은 숫자 대신 몸짓으로 적는다.
export const moodOf = (trust) => (trust >= 78 ? "어깨가 내려왔다. 먼저 말을 꺼낸다." : trust >= 55 ? "차분하다. 묻는 말에는 답한다." : trust >= 35 ? "말을 고른다. 팔짱을 꼈다." : "몸을 돌리고 있다.");
export function unasked(def, st, npc) {
  const me = st.npc[npc.id] || { said: [] };
  const out = [];
  for (const f of npc.facts) {
    if (me.said.includes(f.id)) {
      if (f.gives && !(f.gives in st.evidence)) out.push("들은 말 가운데 받아 적지 않은 것이 있다. 그 문장에 밑줄을 긋는다.");
    } else if (f.hint && lockOpen(f.hintWhen, st)) out.push(f.hint);
  }
  return [...new Set(out)];
}
export function peoplePage(def, st) {
  const out = [];
  for (const p of def.people || []) {
    if (!lockOpen(p.when, st)) continue;
    const npc = p.npc ? (def.cast || def.npcs).find((n) => n.id === p.npc) : null; // 사건의 인물은 다른 장소에 있어도 수첩에 남는다
    const me = npc ? st.npc[npc.id] : null;
    out.push({
      id: p.id, npc: p.npc || null, name: npc?.name || p.name, role: npc?.role || p.role, photo: p.photo || null, unknown: Boolean(p.unknown), where: p.where || "",
      lines: (p.lines || []).filter((l) => typeof l === "string" || lockOpen(l.when, st)).map((l) => l.text || l),
      mood: npc ? moodOf(me?.trust ?? npc.trust ?? 50) : null, met: Boolean(me?.turns),
      said: npc ? st.statements.filter((s) => s.who === npc.name) : [],
      unasked: npc ? unasked(def, st, npc) : [],
    });
  }
  return out;
}

// ── 새로 적힌 것 ──
// 수첩의 줄마다 열쇠를 하나씩 준다. 이미 읽은 열쇠는 st.book.seen에 남는다.
const short = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
export const factKey = (it) => (it.id ? `f:${it.id}` : it.spot ? `f:s:${it.spot}` : `f:c:${short(it.text)}`);
export const lineKey = (personId, text) => `p:${personId}:${short(text)}`;
export function bookKeys(def, st) {
  const Q = questionsPage(def, st), keys = { q: [], facts: [], people: [] };
  for (const it of Q.list) {
    keys.q.push(`q:${it.q.id}`);
    it.hints.forEach((_, i) => keys.q.push(`h:${it.q.id}:${i}`));
  }
  for (const d of Q.deds) keys.q.push(d.solved ? `d:${d.ded.id}:ok` : `d:${d.ded.id}`);
  for (const g of factsPage(def, st)) for (const it of g.items) keys.facts.push(factKey(it));
  for (const p of peoplePage(def, st)) {
    keys.people.push(`p:${p.id}`);
    for (const l of p.lines) keys.people.push(lineKey(p.id, l));
    for (const s of p.said) keys.people.push(`p:${p.id}:s:${s.id}`);
    for (const u of p.unasked) keys.people.push(lineKey(p.id, `?${u}`));
  }
  return keys;
}
const bookOf = (st) => {
  st.book ||= {};
  st.book.seen ||= {};
  return st.book;
};
// 처음 현장에 들어설 때: 이어받은 것은 이미 적혀 있는 것으로 친다
export function primeBook(def, st) {
  const book = bookOf(st);
  if (book.init) return;
  book.init = true;
  for (const list of Object.values(bookKeys(def, st))) for (const k of list) if (!k.startsWith("q:")) book.seen[k] = 1;
  const board = boardOf(st);
  for (const id of ownedCards(st)) if (!board.seen.includes(id)) board.seen.push(id);
}
export const bookSeen = (st, key) => Boolean(bookOf(st).seen[key]);
export const markBookSeen = (st, keys) => {
  const seen = bookOf(st).seen;
  for (const k of keys) seen[k] = 1;
};
// 수첩과 판에 아직 보지 않은 것이 몇 개인가 (HUD의 표시)
export function bookUnseen(def, st) {
  const seen = bookOf(st).seen, keys = bookKeys(def, st);
  const n = Object.fromEntries(Object.entries(keys).map(([tab, list]) => [tab, list.filter((k) => !seen[k]).length]));
  return { ...n, total: n.q + n.facts + n.people };
}
export const boardUnseen = (st) => ownedCards(st).filter((id) => !boardOf(st).seen.includes(id)).length;

// 곰곰이 따져 본다: 게임 속 시간을 들여 지금 물음의 실마리를 하나 적는다
export const PONDER_MINUTES = 10;
export function hintsLeft(def, st) {
  boardOf(st);
  const q = currentQuestion(def, st);
  return Math.max(0, (q?.hints?.length || 0) - (st.hints[q?.id] || 0));
}
export function ponder(def, st) {
  if (!openHint(def, st)) return { ok: false };
  st.minute += PONDER_MINUTES;
  return { ok: true, minutes: PONDER_MINUTES };
}
