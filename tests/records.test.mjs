// 기록을 읽는 방식(공개 정보 · 장부 · 돈의 흐름 · 답안 대조) — 화면 없이 규칙만 확인한다.
// 사건 데이터의 참조가 끊기지 않았는지, 틀린 짚기가 까닭을 돌려주는지, LLM 없이 책상의 끝까지 갈 수 있는지.
import test from "node:test";
import assert from "node:assert/strict";
import { SITES } from "../public/js/data/sites/index.js";
import { MOKWON_DESK as DEF } from "../public/js/data/sites/mokwon-desk.js";
import { newSiteState, lockOpen, apply, currentQuestion } from "../public/js/site/state.js";
import { tryLink, setSlot, checkDeduction, dedOpen, questionsPage, peoplePage } from "../public/js/site/reason.js";
import {
  recOf, probeOf, probeStatus, probeOpen, webCards, webSearch, webTerms, webPage, webVisit, webClip,
  ledgerView, ledgerFilter, ledgerCardFilter, ledgerSort, ledgerMark, ledgerSubmit,
  flowView, flowOpen, flowMark, flowSubmit, answersView, answersToggle, answersPick, answersChance,
} from "../public/js/site/records.js";

const W = DEF.records.web;
const fresh = () => newSiteState(DEF);
// 조건이 맞은 일을 일으킨다 (책상의 runTriggers와 같다)
function settle(st) {
  for (const tr of DEF.triggers || []) {
    if (!st.flags[`trig_${tr.id}`] && lockOpen(tr.when, st)) {
      st.flags[`trig_${tr.id}`] = true;
      apply(st, tr.effect || {});
    }
  }
}
const blocksOf = (p) => (p.snaps ? p.snaps.flatMap((s) => s.blocks) : p.blocks);
const status = (st, id) => probeStatus(DEF, st, probeOf(DEF, id));

test("책상 데이터: 카드·연결·추리·기록의 참조가 끊기지 않았다", () => {
  assert.equal(SITES[DEF.id], DEF);
  assert.equal(DEF.kind, "desk");
  const ev = DEF.evidence;
  for (const id of DEF.start.evidence) assert.ok(ev[id], `시작 카드 ${id}`);
  for (const q of DEF.questions) for (const c of q.cards || []) assert.ok(ev[c], `물음 ${q.id}의 카드 ${c}`);
  for (const [id, l] of Object.entries(DEF.links)) {
    assert.equal(ev[id]?.kind, "추론", `연결 ${id}는 쪽지다`);
    for (const pair of [l.from, ...(l.alt || []).map((a) => a.from)]) for (const c of pair) assert.ok(ev[c], `연결 ${id}의 카드 ${c}`);
  }
  for (const m of DEF.misses) for (const c of m.pair) assert.ok(ev[c], `틀린 잇기의 카드 ${c}`);
  for (const d of DEF.deductions) {
    for (const part of d.parts) if (part.slot) assert.ok(d.slots[part.slot], `추리 ${d.id}의 칸 ${part.slot}`);
    for (const s of Object.values(d.slots)) for (const c of [...Object.keys(s.accept), ...Object.keys(s.near || {})]) assert.ok(ev[c], `추리 ${d.id}의 카드 ${c}`);
  }
  // 책상 위의 것: 생김새와 자리가 있고, 가리키는 기록이 있다
  const R = DEF.records;
  for (const p of DEF.probes) {
    assert.ok(p.look && p.at?.length >= 2, `${p.id}의 생김새와 자리`);
    if (p.kind === "ledger") assert.ok(R.ledgers[p.ref]);
    if (p.kind === "flow") assert.ok(R.flows[p.ref]);
    if (p.kind === "answers") assert.ok(R.answers[p.ref]);
  }
  for (const t of DEF.things) assert.ok(t.look && t.at && t.lines.length, `${t.id}`);
  // 기록이 주는 카드
  for (const c of webCards(DEF)) assert.ok(ev[c], `공개 정보의 카드 ${c}`);
  assert.deepEqual(webCards(DEF).sort(), ["C25", "C26", "C27", "C28"]);
  for (const L of Object.values(R.ledgers)) {
    assert.ok(ev[L.find.gives]);
    const ids = new Set(L.rows.map((r) => r.id));
    assert.equal(ids.size, L.rows.length, "줄 이름이 겹치지 않는다");
    for (const id of [...L.find.need, ...(L.find.allow || []), ...Object.keys(L.find.near || {})]) assert.ok(ids.has(id), `장부의 줄 ${id}`);
    for (const k of L.keys || []) assert.ok(ev[k]?.at != null, `거르는 카드 ${k}에는 시각이 있다`);
  }
  for (const F of Object.values(R.flows)) {
    assert.ok(ev[F.find.gives]);
    const ids = new Set(F.tx.map((t) => t.id)), names = new Set([...F.accounts.map((a) => a.id), ...Object.keys(F.parties)]);
    for (const id of [...F.find.need, ...(F.find.allow || []), ...Object.keys(F.find.near || {})]) assert.ok(ids.has(id), `거래 ${id}`);
    for (const t of F.tx) assert.ok(names.has(t.from) && names.has(t.to) && t.amount > 0 && /^\d\d-\d\d$/.test(t.on), `거래 ${t.id}`);
    for (const a of F.accounts) assert.match(a.no, /\*/, "계좌번호는 가려져 있다");
  }
  for (const A of Object.values(R.answers)) {
    assert.ok(ev[A.find.gives] && ev[A.ratios.card]);
    for (const s of A.sheets) assert.ok(ev[s.card], `답안 ${s.id}의 카드`);
    for (const q of A.questions) assert.equal(A.ratios.by[q].reduce((a, b) => a + b, 0), 100, `${q}번 비율의 합`);
  }
  // 누리집: 이어지는 글과 겹쳐 볼 답안이 실제로 있다
  for (const [id, p] of Object.entries(W.pages)) {
    assert.ok(W.sites[p.site], `${id}의 누리집`);
    for (const b of blocksOf(p)) {
      if (b.t === "link") assert.ok(W.pages[b.to], `${id}에서 이어지는 글 ${b.to}`);
      if (b.t === "sheet") assert.ok(R.answers.math.sheets.some((s) => s.id === b.sheet), `${id}의 답안 ${b.sheet}`);
    }
  }
  // 조건이 맞을 때 일어나는 일은 이름이 겹치지 않는다
  assert.equal(new Set(DEF.triggers.map((t) => t.id)).size, DEF.triggers.length);
});

test("공개 정보: 낱말이 열쇠다. 숨은 글은 정확한 낱말로만 나온다", () => {
  const st = fresh();
  assert.ok(webSearch(DEF, st, "명").short, "한 글자로는 찾지 않는다");
  assert.deepEqual(webSearch(DEF, st, "명문설계").results.map((r) => r.id), ["ms_home"]);
  assert.deepEqual(webSearch(DEF, st, "ms 1114").results.map((r) => r.id), ["plaza_a", "plaza_b", "plaza_c"], "띄어쓰기와 대소문자는 가리지 않는다");
  assert.equal(webSearch(DEF, st, "MS").results.length, 0, "숨은 글은 낱말의 일부로는 나오지 않는다");
  assert.deepEqual(webSearch(DEF, st, "수학 14번").results.map((r) => r.id), ["nea_math", "plaza_easy", "gaon_ratio"]);
  assert.equal(webSearch(DEF, st, "아무 말").results.length, 0);
  assert.deepEqual(recOf(st).web.trail.slice(0, 2), ["아무 말", "수학 14번"], "찾아본 낱말이 남는다");
  // 찾아볼 낱말은 가진 카드에서 나온다. 지워진 광고를 얻어야 가게 이름이 생긴다.
  const terms = () => webTerms(DEF, st).map((t) => t.text);
  assert.deepEqual(terms(), ["기적의 재수", "수학 14번", "명문설계", "MS-1114"]);
  webVisit(DEF, st, "ms_home");
  assert.ok(!terms().includes("한결전자"), "지금의 페이지를 읽는 것만으로는 옛 주소를 알 수 없다");
  apply(st, { evidence: ["C25"] });
  assert.ok(terms().includes("한결전자"));
  assert.deepEqual(webSearch(DEF, st, "한결전자").results.map((r) => r.id), ["sewoon_dir"], "얻은 낱말은 막다른 길이 아니다");
});

test("공개 정보: 지난 모습에서 사라진 문구를 오려 둔다", () => {
  const st = fresh(), t0 = st.minute;
  assert.equal(webVisit(DEF, st, "ms_home").minutes, 2);
  assert.equal(webVisit(DEF, st, "ms_home").minutes, 0, "읽은 글은 다시 읽어도 시간이 들지 않는다");
  const now = webPage(DEF, st, "ms_home");
  assert.ok(now.current && now.snaps.length === 2 && !now.blocks.some((b) => b.clip), "지금의 페이지에는 오려 둘 것이 없다");
  assert.match(webClip(DEF, st, "ms_home", null, "ad").text, /흠잡을 데가 없다/);
  assert.equal(webVisit(DEF, st, "ms_home", "sep").minutes, 1, "처음 보는 옛 판은 1분");
  const old = webPage(DEF, st, "ms_home", "sep");
  assert.ok(!old.current && old.note);
  assert.match(webClip(DEF, st, "ms_home", "sep", "p1").text, /지금 페이지에도 그대로 있다/);
  const third = webClip(DEF, st, "ms_home", "sep", "f");
  assert.match(third.text, /주소가 지금과 다르다/);
  assert.ok(third.hint, "같은 글에서 세 번 헛짚으면 실마리가 열린다");
  assert.equal(st.hints[currentQuestion(DEF, st).id], 1);
  const res = webClip(DEF, st, "ms_home", "sep", "ad");
  assert.ok(res.ok && res.fresh.evidence.includes("C25"));
  assert.equal(webClip(DEF, st, "ms_home", "sep", "ad").kind, "dup");
  assert.ok(webPage(DEF, st, "ms_home", "sep").blocks.find((b) => b.id === "ad").clipped);
  assert.equal(st.minute - t0, 3, "틀리게 오려도 시간은 들지 않는다");
});

test("공개 정보: 글 셋을 모아야 한 장이 되고, 표는 한 줄을 오린다", () => {
  const st = fresh();
  const sheetOf = (id) => W.pages[id].blocks.find((b) => b.clip?.card === "C26").id;
  const a = webClip(DEF, st, "plaza_a", null, sheetOf("plaza_a"));
  assert.ok(a.ok && a.partial && a.have === 1 && a.total === 3);
  assert.equal(webClip(DEF, st, "plaza_a", null, sheetOf("plaza_a")).kind, "dup");
  assert.ok(!("C26" in st.evidence));
  assert.equal(status(st, "math"), "locked", "견줄 답안이 모이기 전에는 라이트 박스를 켤 수 없다");
  webClip(DEF, st, "plaza_b", null, sheetOf("plaza_b"));
  const c = webClip(DEF, st, "plaza_c", null, sheetOf("plaza_c"));
  assert.ok(c.ok && !c.partial && "C26" in st.evidence);
  assert.equal(status(st, "math"), "open");
  // 선택 비율: 14번 줄만 카드가 된다
  const table = W.pages.gaon_ratio.blocks.find((b) => b.clipRow).id;
  assert.equal(webClip(DEF, st, "gaon_ratio", null, `${table}:13`).ok, false);
  assert.ok(webClip(DEF, st, "gaon_ratio", null, `${table}:14`).ok && "C27" in st.evidence);
  assert.deepEqual(webPage(DEF, st, "gaon_ratio").blocks.find((b) => b.id === table).clippedRows, ["14"]);
  const fig = W.pages.nea_math.blocks.find((b) => b.clip?.card === "C28").id;
  assert.ok(webClip(DEF, st, "nea_math", null, fig).ok);
  assert.equal(status(st, "web"), "open", "지워진 광고가 남아 있다");
});

test("장부(출입 기록): 카드의 시각으로 거르고, 두 줄을 함께 짚는다", () => {
  const st = fresh(), t0 = st.minute;
  assert.deepEqual(probeOpen(DEF, st, "gate"), { ok: true, first: true, minutes: 3 });
  assert.equal(probeOpen(DEF, st, "gate").minutes, 0, "처음 펼 때만 시간이 든다");
  const ids = () => ledgerView(DEF, st, "gate").rows.map((r) => r.row.id);
  assert.equal(ids().length, 17);
  assert.deepEqual(ledgerView(DEF, st, "gate").keys.map((k) => k.card), ["C29", "C9", "C10"]);
  assert.ok(ledgerCardFilter(DEF, st, "gate", "C10"));
  assert.deepEqual(ids(), ["t1"], "전원이 켜진 05:40 앞뒤로 문을 지난 사람은 하나다");
  ledgerCardFilter(DEF, st, "gate", "C10"); // 같은 조건을 다시 넣으면 빠진다
  ledgerCardFilter(DEF, st, "gate", "C9");
  assert.deepEqual(ids(), ["w10", "w11"]);
  assert.equal(ledgerCardFilter(DEF, st, "gate", "C7"), false, "시각이 없는 카드로는 거를 수 없다");
  ledgerFilter(DEF, st, "gate", { col: "name", op: "is", value: "오기철" });
  assert.deepEqual(ids(), ["w10"]);
  ledgerFilter(DEF, st, "gate", null);
  ledgerFilter(DEF, st, "gate", { op: "band", label: "새벽", from: 0, to: 360 });
  assert.deepEqual(ids(), ["t1"]);
  ledgerFilter(DEF, st, "gate", null);
  ledgerSort(st, "gate", "name");
  assert.equal(ledgerView(DEF, st, "gate").rows[0].row.name, "길성택");
  ledgerSort(st, "gate", "name");
  ledgerSort(st, "gate", "name");
  assert.equal(ledgerView(DEF, st, "gate").sort, null, "세 번째에는 원래 차례로 돌아온다");
  // 짚기: 엉뚱한 줄, 한 줄만, 그리고 둘
  assert.equal(ledgerSubmit(DEF, st, "gate").kind, "empty");
  ledgerMark(DEF, st, "gate", "w11");
  const stray = ledgerSubmit(DEF, st, "gate");
  assert.equal(stray.kind, "stray");
  assert.match(stray.text, /야식 배달/);
  assert.deepEqual(stray.rows, ["w11"]);
  ledgerMark(DEF, st, "gate", "w11");
  ledgerMark(DEF, st, "gate", "t1");
  const part = ledgerSubmit(DEF, st, "gate");
  assert.equal(part.kind, "partial");
  ledgerMark(DEF, st, "gate", "w10");
  assert.equal(st.hints.q_oh || 0, 0);
  const ok = ledgerSubmit(DEF, st, "gate");
  assert.ok(ok.ok && ok.fresh.evidence.includes("C13"));
  assert.equal(status(st, "gate"), "done");
  assert.equal(ledgerMark(DEF, st, "gate", "w1"), false, "카드가 된 뒤에는 짚지 않는다");
  assert.equal(st.minute - t0, 3, "틀려도 시간은 들지 않는다");
});

test("장부(매입): 같은 수로 산 것을 둘 이상 짚는다", () => {
  const st = fresh();
  assert.equal(status(st, "parts"), "hidden", "봉투가 오기 전에는 책상에 없다");
  apply(st, { flags: ["envelope"] });
  assert.equal(status(st, "parts"), "open");
  ledgerSort(st, "parts", "qty");
  const qty = ledgerView(DEF, st, "parts").rows.map((r) => r.row.qty);
  assert.deepEqual(qty, [...qty].sort((a, b) => a - b));
  ledgerMark(DEF, st, "parts", "p04");
  assert.equal(ledgerSubmit(DEF, st, "parts").kind, "partial", "한 줄만으로는 우연일 수 있다");
  ledgerMark(DEF, st, "parts", "p03");
  assert.match(ledgerSubmit(DEF, st, "parts").text, /서른 자루/);
  const third = (ledgerMark(DEF, st, "parts", "p03"), ledgerMark(DEF, st, "parts", "p10"), ledgerSubmit(DEF, st, "parts"));
  assert.match(third.text, /예비 하나/);
  assert.ok(third.hint, "세 번째 헛짚기에 실마리가 열린다");
  ledgerMark(DEF, st, "parts", "p10");
  ledgerMark(DEF, st, "parts", "p06");
  ledgerMark(DEF, st, "parts", "p07"); // 여덟은 넷의 곱절: 함께 짚어도 된다
  assert.ok(ledgerSubmit(DEF, st, "parts").ok && "C20" in st.evidence);
});

test("돈의 흐름: 사본이 있는 마디를 펼쳐 끝까지 따라간다", () => {
  const st = fresh();
  apply(st, { flags: ["envelope"] });
  let v = flowView(DEF, st, "money");
  assert.deepEqual(v.lanes.map((a) => a.id), ["ms"]);
  assert.deepEqual(v.stubs.map((a) => a.id), ["hg"]);
  assert.equal(v.tx.length, 14, "펼친 계좌의 거래만 보인다");
  assert.equal(v.name("han"), "한○○", "이름은 가려져 있다");
  assert.equal(flowMark(DEF, st, "money", "f22"), false, "보이지 않는 거래는 짚을 수 없다");
  for (const id of ["f02", "f03", "f05"]) flowMark(DEF, st, "money", id);
  assert.match(flowSubmit(DEF, st, "money").text, /같은 금액이 더/);
  flowMark(DEF, st, "money", "f06");
  assert.match(flowSubmit(DEF, st, "money").text, /어디로 나갔는지/);
  flowMark(DEF, st, "money", "f07");
  assert.match(flowSubmit(DEF, st, "money").text, /마디를 펼쳐/);
  const t0 = st.minute;
  assert.deepEqual(flowOpen(DEF, st, "money", "hg"), { ok: true, minutes: 3 });
  assert.equal(st.minute - t0, 3);
  assert.equal(flowOpen(DEF, st, "money", "hg").ok, false);
  v = flowView(DEF, st, "money");
  assert.equal(v.tx.length, 20);
  assert.equal(v.stubs.length, 0);
  flowMark(DEF, st, "money", "f21");
  const stray = flowSubmit(DEF, st, "money");
  assert.equal(stray.kind, "stray");
  assert.match(stray.text, /부품값/);
  flowMark(DEF, st, "money", "f21");
  flowMark(DEF, st, "money", "f22");
  const ok = flowSubmit(DEF, st, "money");
  assert.ok(ok.ok && ok.fresh.evidence.includes("C22"));
  // 네 사람이 넣은 돈과 한 덩이로 나간 돈
  const F = DEF.records.flows.money, sum = (ids) => ids.reduce((n, id) => n + F.tx.find((t) => t.id === id).amount, 0);
  assert.equal(sum(["f02", "f03", "f05", "f06"]), 96000000);
  assert.equal(sum(["f07"]), 72000000);
});

test("답안 대조: 넷을 겹치고, 숫자를 가져와야 우연이 아니라고 말할 수 있다", () => {
  const st = fresh();
  assert.match(answersPick(DEF, st, "math", 14, 3).text, /다 모이지 않았다/);
  assert.equal(answersToggle(DEF, st, "math", "a"), false, "가지지 않은 답안은 올릴 수 없다");
  apply(st, { evidence: ["C26"] });
  assert.ok(answersToggle(DEF, st, "math", "dohyeon") && answersToggle(DEF, st, "math", "a"));
  assert.match(answersPick(DEF, st, "math", 14, 3).text, /겹치지 않은 답안/);
  answersToggle(DEF, st, "math", "b");
  answersToggle(DEF, st, "math", "c");
  const v = answersView(DEF, st, "math");
  assert.ok(v.stacked && v.cols.every((c) => c.same), "넷은 모든 문항에서 같은 칸을 칠했다");
  assert.deepEqual(v.cols.filter((c) => c.off != null).map((c) => [c.q, c.off, c.key]), [[14, 3, 5]], "정답과 다른 곳은 하나다");
  assert.equal(v.ratios, null);
  assert.match(answersPick(DEF, st, "math", 14, 3).text, /선택 비율/);
  apply(st, { evidence: ["C27"] });
  assert.match(answersPick(DEF, st, "math", 7, 3).text, /모두 맞혔다/);
  assert.match(answersPick(DEF, st, "math", 14, 5).text, /정답이다/);
  const third = answersPick(DEF, st, "math", 14, 1);
  assert.match(third.text, /넷이 고른 답이 아니다/);
  assert.ok(third.hint);
  const ok = answersPick(DEF, st, "math", 14, 3);
  assert.ok(ok.ok && ok.fresh.evidence.includes("I11"));
  assert.deepEqual(ok.chance, { percent: 2, people: 4, oneIn: 6250000 });
  assert.deepEqual(answersChance(DEF, "math"), ok.chance);
  assert.match(DEF.evidence.I11.text, /625만 번에 한 번/, "카드의 숫자와 셈이 같다");
  assert.equal(answersPick(DEF, st, "math", 14, 3).kind, "dup");
});

test("책상: LLM 없이 규칙만으로 끝까지 간다", () => {
  const st = fresh(), t0 = st.minute;
  const q = () => currentQuestion(DEF, st).id;
  const link = (a, b, rel, gives) => {
    const res = tryLink(DEF, st, a, b, rel);
    assert.ok(res.ok, `${a}–${b} 잇기`);
    assert.ok(gives in st.evidence, `${gives} 쪽지`);
    settle(st);
  };
  const deduce = (id, slots) => {
    assert.ok(dedOpen(DEF, st).some((d) => d.id === id), `추리 ${id}가 열렸다`);
    for (const [slot, card] of Object.entries(slots)) assert.ok(setSlot(DEF, st, id, slot, card));
    assert.ok(checkDeduction(DEF, st, id).ok, `추리 ${id}`);
    settle(st);
  };
  settle(st);
  assert.equal(q(), "q_oh");
  assert.deepEqual(DEF.probes.map((p) => status(st, p.id)), ["open", "open", "hidden", "hidden", "locked"]);
  assert.ok(peoplePage(DEF, st).some((p) => p.name === "'오'"), "아직 이름이 없다");

  // ① 출입 기록 → 점검표와 잇는다 → '오'에게 이름이 생긴다
  probeOpen(DEF, st, "gate");
  ledgerMark(DEF, st, "gate", "w10");
  ledgerMark(DEF, st, "gate", "t1");
  assert.ok(ledgerSubmit(DEF, st, "gate").ok);
  assert.equal(tryLink(DEF, st, "C9", "C13", "contra").ok, false, "부호가 다르면 이어지지 않는다");
  link("C9", "C13", "same", "I8");
  assert.ok(st.flags.knows_oh);
  assert.ok(peoplePage(DEF, st).some((p) => p.name === "오기철") && !peoplePage(DEF, st).some((p) => p.name === "'오'"));
  assert.equal(q(), "q_firm");

  // ② 노트북: 명함의 이름 → 지난 모습 → 지워진 광고. 윤태경이 봉투를 보낸다(한 시간).
  probeOpen(DEF, st, "web");
  assert.equal(webSearch(DEF, st, "명문설계").results[0].id, "ms_home");
  webVisit(DEF, st, "ms_home");
  webVisit(DEF, st, "ms_home", "sep");
  const before = st.minute;
  assert.ok(webClip(DEF, st, "ms_home", "sep", "ad").ok);
  settle(st);
  assert.ok(st.flags.envelope);
  assert.equal(st.minute - before, 60);
  assert.equal(q(), "q_back");
  assert.deepEqual(["parts", "money"].map((id) => status(st, id)), ["open", "open"]);

  // ③ 봉투: 매입 장부와 통장
  probeOpen(DEF, st, "parts");
  for (const id of ["p04", "p06", "p08", "p13"]) ledgerMark(DEF, st, "parts", id);
  assert.ok(ledgerSubmit(DEF, st, "parts").ok);
  probeOpen(DEF, st, "money");
  flowOpen(DEF, st, "money", "hg");
  for (const id of ["f02", "f03", "f05", "f06", "f07", "f22"]) flowMark(DEF, st, "money", id);
  assert.ok(flowSubmit(DEF, st, "money").ok);
  assert.equal(q(), "q_ded5");

  // ④ 판: 두 간판을 잇고, 배후를 한 문장으로
  link("C25", "C22", "same", "I15");
  setSlot(DEF, st, "back", "hand", "C13");
  setSlot(DEF, st, "back", "n", "C20");
  setSlot(DEF, st, "back", "maker", "I15");
  const wrong = checkDeduction(DEF, st, "back");
  assert.ok(!wrong.ok && wrong.minutes === 30 && /점검표와 이어야/.test(wrong.slots.hand.text));
  deduce("back", { hand: "I8", n: "C20", maker: "I15" });
  assert.ok(st.flags.deduced_back);
  assert.equal(q(), "q_wrong");

  // ⑤ 추천 코드 → 가채점 글 셋, 문제지, 선택 비율 → 라이트 박스
  for (const id of ["plaza_a", "plaza_b", "plaza_c"]) {
    webVisit(DEF, st, id);
    webClip(DEF, st, id, null, W.pages[id].blocks.find((b) => b.clip).id);
  }
  webClip(DEF, st, "nea_math", null, W.pages.nea_math.blocks.find((b) => b.clip).id);
  webClip(DEF, st, "gaon_ratio", null, `${W.pages.gaon_ratio.blocks.find((b) => b.clipRow).id}:14`);
  assert.equal(status(st, "web"), "done");
  assert.equal(probeOpen(DEF, st, "math").minutes, 2);
  for (const s of DEF.records.answers.math.sheets) answersToggle(DEF, st, "math", s.id);
  assert.ok(answersPick(DEF, st, "math", 14, 3).ok);
  settle(st);
  assert.equal(q(), "q_ded6");

  // ⑥ 하나뿐인 오답
  deduce("miss", { q: "I11", rare: "C27", line: "C28" });
  assert.ok(st.flags.deduced_miss && st.flags.trig_end);
  assert.equal(q(), "q_end");
  assert.deepEqual(DEF.probes.map((p) => status(st, p.id)), ["done", "done", "done", "done", "done"]);
  assert.equal(questionsPage(DEF, st).deds.filter((d) => d.solved).length, 2);
  // 든 시간: 기록 펴기 3+3+3+2, 글 읽기 2+1+2+2+2, 통장 마디 3, 봉투 60, 틀린 추리 30
  assert.equal(st.minute - t0, 113);
});
