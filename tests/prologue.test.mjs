// 프롤로그 「시험 전」 — 네 장소가 한 사건의 상태를 함께 쓴다. 화면 없이 규칙만 확인한다.
// 자리 이름이 블록아웃과 맞는지, 카드가 빠짐없이 이어지는지, LLM 없이 끝까지 갈 수 있는지, 제1장으로 넘어가는지.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROLOGUE, PROLOGUE_SITES as S } from "../public/js/data/sites/prologue.js";
import { PROLOGUE_CARDS } from "../public/js/data/sites/suneung-cards.js";
import { MOKWON_ROOM12 as ROOM } from "../public/js/data/sites/mokwon.js";
import { SITES, CASES } from "../public/js/data/sites/index.js";
import { newSiteState, saveKeyOf, lockOpen, spotStatus, useSpot, apply, currentQuestion, questionOpen, runDeadlines, ruleNpcReply, sayable, placeOf, placesOpen, travelMinutes, travelTo, carryInto } from "../public/js/site/state.js";
import { tryLink, pickCompare, compareView, setSlot, checkDeduction, dedOpen, questionsPage, peoplePage, factsPage } from "../public/js/site/reason.js";
import { probeOpen, webTerms, webSearch, webVisit, webClip } from "../public/js/site/records.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CASE = PROLOGUE.def;
const FRI = 0, SAT = 1440, at = (d, h, m = 0) => d + h * 60 + m;
const sites = Object.values(S);
const spotOf = (id) => CASE.allSpots.find((s) => s.id === id);
const npcOf = (id) => CASE.cast.find((n) => n.id === id);
const here = (st) => S[st.at];

// 조건이 맞은 일을 일으킨다 (엔진의 runTriggers와 같다)
function settle(st) {
  for (const tr of CASE.triggers || []) {
    if (!st.flags[`trig_${tr.id}`] && lockOpen(tr.when, st)) {
      st.flags[`trig_${tr.id}`] = true;
      apply(st, tr.effect);
    }
  }
  runDeadlines(CASE, st);
}
// 지금 있는 장소의 조사점만 살펴볼 수 있다
function look(st, id) {
  const s = here(st).spots.find((x) => x.id === id);
  assert.ok(s, `${id}는 ${st.at}에 없다`);
  assert.equal(["open", "done"].includes(spotStatus(s, st)), true, `${id}를 아직 살펴볼 수 없다 (${spotStatus(s, st)})`);
  const fresh = useSpot(st, s);
  settle(st);
  return fresh;
}
function examine(st, inspectId, detailId) {
  const d = CASE.inspects[inspectId].details.find((x) => x.id === detailId);
  assert.ok(d, `${inspectId}.${detailId}`);
  st.seen[`${inspectId}.${d.id}`] = 1;
  if (d.gives) apply(st, d.gives);
  settle(st);
}
// 규칙 모드의 한마디 (talk.js와 같다: 밝힌 말의 effect가 일어나고, 밑줄을 그으면 카드가 된다)
function say(st, npcId, { text = "", shown = [] } = {}) {
  const npc = here(st).npcs.find((n) => n.id === npcId);
  assert.ok(npc, `${npcId}는 ${st.at}에 없다`);
  assert.ok(lockOpen(npc.when, st), `${npc.name}은 지금 자리에 없다`);
  const me = (st.npc[npc.id] ||= { trust: npc.trust, said: [], turns: 0, log: [] });
  const out = ruleNpcReply(npc, { trust: me.trust, shown, text, evidence: st.evidence, flags: st.flags, said: me.said, turn: me.turns });
  for (const id of out.revealed) {
    me.said.push(id);
    const f = npc.facts.find((x) => x.id === id);
    if (f.effect) apply(st, f.effect);
    if (f.gives) apply(st, { evidence: [f.gives] });
  }
  me.turns += 1;
  st.minute += 3;
  settle(st);
  return out.revealed;
}
function go(st, placeId) {
  const to = travelTo(CASE, st, placeId);
  assert.ok(to, `${placeId}로 갈 수 없다`);
  delete st.arrived;
  return to;
}
const link = (st, a, b, rel) => {
  const res = tryLink(CASE, st, a, b, rel);
  settle(st);
  return res;
};
function deduce(st, id, slots) {
  assert.ok(dedOpen(CASE, st).some((d) => d.id === id), `추리 ${id}가 아직 열리지 않았다`);
  for (const [slot, card] of Object.entries(slots)) assert.ok(setSlot(CASE, st, id, slot, card), `${id}.${slot} ← ${card}`);
  const res = checkDeduction(CASE, st, id);
  settle(st);
  return res;
}

test("프롤로그 데이터: 자리 이름이 블록아웃 배치와 맞는다", () => {
  const layout = fs.readFileSync(path.join(ROOT, "tools", "3d", "prologue_layout.py"), "utf8");
  const groups = Object.fromEntries([...layout.matchAll(/^([A-Z]+)_MARKERS = \[([\s\S]*?)^\]/gm)].map((m) => [m[1].toLowerCase(), new Set([...m[2].matchAll(/\("((?:spot|spawn|npc|view|fx)_[a-z0-9_]+)"/g)].map((x) => x[1]))]));
  assert.deepEqual(Object.keys(groups).sort(), ["academy", "apt", "gate", "rooftop"]);
  for (const site of sites) {
    const markers = groups[site.key];
    const used = [site.start.spawn, site.arrive, ...site.spots.map((s) => s.node), ...site.npcs.map((n) => n.node)].filter(Boolean);
    assert.deepEqual(used.filter((n) => !markers.has(n)), [], `${site.id}의 자리 이름`);
    assert.equal(site.blockout, `/assets/3d/sites/prologue_${site.key}_blockout.glb`);
  }
});

test("프롤로그 데이터: 장소, 카드, 인물이 빠짐없이 이어진다", () => {
  assert.equal(CASES.prologue, PROLOGUE);
  assert.deepEqual(PROLOGUE.sites, ["prologue_rooftop", "prologue_apt", "prologue_academy", "prologue_gate"]);
  for (const site of sites) {
    assert.equal(SITES[site.id], site);
    assert.equal(saveKeyOf(site), "prologue", "네 장소가 저장 하나를 쓴다");
    assert.ok(placeOf(CASE, site.id), `${site.id}가 약도에 있다`);
    assert.ok(site.spots.some((s) => s.travel), `${site.id}에서 나가는 문`);
    assert.ok(site.sketch?.length && site.light && site.map, `${site.id}의 스케치·빛·약도`);
  }
  const ids = CASE.places.map((p) => p.id);
  for (const key of Object.keys(CASE.routes)) assert.ok(key.split("|").every((id) => ids.includes(id)), key);
  for (const a of ids) for (const b of ids) if (a !== b) assert.ok(`${a}|${b}` in CASE.routes || `${b}|${a}` in CASE.routes, `${a}→${b} 걸리는 시간`);
  // 조사점 id는 사건 안에서 겹치지 않는다 (살펴본 기록을 함께 쓴다)
  const spotIds = CASE.allSpots.map((s) => s.id);
  assert.equal(new Set(spotIds).size, spotIds.length);
  // 카드: 가리키는 것은 모두 있고, 있는 것은 모두 얻을 길이 있다
  const ev = new Set(Object.keys(CASE.evidence));
  const got = new Set();
  const give = (g) => (g?.evidence || []).forEach((id) => got.add(id));
  CASE.allSpots.forEach((s) => give(s.gives));
  for (const ins of Object.values(CASE.inspects)) {
    ins.details.forEach((d) => give(d.gives));
    give(ins.combine?.gives);
  }
  for (const npc of CASE.cast) npc.facts.forEach((f) => f.gives && got.add(f.gives));
  for (const p of Object.values(CASE.records.web.pages)) p.blocks.forEach((b) => b.clip && got.add(b.clip.card));
  Object.keys(CASE.links).forEach((id) => got.add(id));
  assert.deepEqual([...got].filter((id) => !ev.has(id)), [], "없는 카드를 준다");
  assert.deepEqual([...ev].filter((id) => !got.has(id)).sort(), [], "얻을 길이 없는 카드");
  const refs = [...Object.values(CASE.links).flatMap((l) => [...l.from, ...(l.alt || []).flatMap((x) => x.from)]), ...CASE.misses.flatMap((m) => m.pair), ...CASE.questions.flatMap((q) => q.cards || []),
    ...CASE.deductions.flatMap((d) => Object.values(d.slots).flatMap((s) => [...Object.keys(s.accept), ...Object.keys(s.near || {})]))];
  assert.deepEqual([...new Set(refs)].filter((id) => !ev.has(id)), []);
  // 인물: 수첩의 인물이 가리키는 사람은 사건 어딘가에 있다
  for (const p of CASE.people) if (p.npc) assert.ok(npcOf(p.npc), p.id);
  for (const npc of CASE.cast) {
    assert.ok(sites.some((s) => s.npcs.includes(npc)), `${npc.id}가 있는 장소`);
    for (const f of npc.facts) assert.ok(f.rule?.length && f.text && f.say, `${npc.id}.${f.id}`);
  }
  // 제1장이 프롤로그의 카드를 모두 안다 (넘어가며 잃는 것이 없다)
  assert.deepEqual([...ev].filter((id) => !ROOM.evidence[id]), []);
  for (const id of Object.keys(PROLOGUE_CARDS)) assert.ok(ROOM.evidence[id].carried, id);
  for (const id of Object.keys(CASE.links)) assert.deepEqual(ROOM.links[id].from, CASE.links[id].from, `연결 ${id}`);
});

test("프롤로그: 처음에는 옥탑방뿐이고, 노트북의 글이 갈 곳을 연다", () => {
  const st = newSiteState(S.prologue_rooftop);
  assert.equal(st.site, "prologue");
  assert.equal(st.at, "prologue_rooftop");
  assert.equal(st.minute, at(FRI, 8));
  assert.deepEqual(Object.keys(st.evidence), []);
  assert.deepEqual(placesOpen(CASE, st).map((p) => p.id), ["rooftop"]);
  assert.equal(currentQuestion(CASE, st).id, "q_news");
  look(st, "rt_laptop");
  assert.ok(probeOpen(S.prologue_rooftop, st, "web").ok);
  assert.deepEqual(webTerms(CASE, st).map((t) => t.text), ["전부 검거", "기적의 재수"], "밤사이 들은 말 둘이 처음부터 손에 있다");
  assert.deepEqual(webSearch(CASE, st, "전부 검거").results.map((r) => r.id), ["sehan_article"]);
  assert.deepEqual(webSearch(CASE, st, "기적의 재수").results.map((r) => r.id), ["blog_miracle", "plaza_post"]);
  assert.ok(CASE.records.web.pages.sehan_article.blocks.some((b) => b.t === "link" && b.to === "nea_press"), "기사에서 보도자료로 넘어간다");
  webVisit(CASE, st, "blog_miracle");
  assert.ok(webClip(CASE, st, "blog_miracle", null, "p1").ok && "P3" in st.evidence);
  assert.deepEqual(placesOpen(CASE, st).map((p) => p.id), ["rooftop", "academy"], "학원 글을 오리면 학원이 약도에 생긴다");
  webVisit(CASE, st, "plaza_post");
  assert.equal(webClip(CASE, st, "plaza_post", null, "c6").ok, false, "댓글은 카드가 아니다");
  assert.ok(webClip(CASE, st, "plaza_post", null, "p1").ok && "P4" in st.evidence);
  assert.deepEqual(placesOpen(CASE, st).map((p) => p.id), ["rooftop", "academy", "apt", "gate"]);
  settle(st);
  assert.ok(st.flags.trig_leads);
  assert.equal(currentQuestion(CASE, st).id, "q_trace");
});

test("프롤로그: 이동은 시간을 쓰고, 강을 건너면 40분이다", () => {
  const st = newSiteState(S.prologue_rooftop);
  apply(st, { evidence: ["P3", "P4"] });
  assert.equal(travelMinutes(CASE, "rooftop", "apt"), 40);
  assert.equal(travelMinutes(CASE, "apt", "rooftop"), 40);
  assert.equal(travelMinutes(CASE, "academy", "apt"), 10);
  assert.equal(travelMinutes(CASE, "apt", "apt"), 0);
  assert.equal(travelTo(CASE, st, "rooftop"), null, "있는 곳으로는 가지 않는다");
  const to = travelTo(CASE, st, "apt");
  assert.equal(to.site, "prologue_apt");
  assert.equal(st.at, "prologue_apt");
  assert.equal(st.minute, at(FRI, 8, 40));
  assert.deepEqual(st.arrived, { from: "옥탑방", minutes: 40 });
  assert.equal(placesOpen(CASE, st).find((p) => p.here).id, "apt");
  assert.equal(placesOpen(CASE, st).find((p) => p.id === "academy").minutes, 10);
  const blank = newSiteState(S.prologue_rooftop);
  assert.equal(travelTo(CASE, blank, "gate"), null, "모르는 곳으로는 갈 수 없다");
});

test("프롤로그: 배수정은 금요일 오후 3시에 오고, 놓치면 토요일 아침에 다시 온다", () => {
  const bae = npcOf("bae"), st = newSiteState(S.prologue_gate);
  const wait = spotOf("gt_wait"), waitSat = spotOf("gt_wait_sat");
  assert.ok(!lockOpen(bae.when, st), "아침에는 없다");
  assert.equal(spotStatus(wait, st), "hidden", "언제 오는지 모르면 기다릴 수도 없다");
  apply(st, { flags: ["know_bae_time"] });
  assert.equal(spotStatus(wait, st), "open");
  useSpot(st, wait);
  assert.equal(st.minute, at(FRI, 15));
  assert.ok(lockOpen(bae.when, st));
  assert.equal(spotStatus(wait, st), "hidden");
  st.minute = at(FRI, 18);
  assert.ok(!lockOpen(bae.when, st), "여섯 시에 돌아간다");
  assert.equal(spotStatus(waitSat, st), "open");
  useSpot(st, waitSat);
  assert.equal(st.minute, at(SAT, 9));
  assert.ok(lockOpen(bae.when, st));
  // 기다리는 것은 시간을 뒤로 돌리지 않는다
  const late = newSiteState(S.prologue_gate);
  late.minute = at(FRI, 16);
  apply(late, { until: at(FRI, 15) });
  assert.equal(late.minute, at(FRI, 16));
});

test("프롤로그: 배수정은 추리 둘을 맞춘 뒤에만 문을 열어 주기로 한다", () => {
  const bae = npcOf("bae");
  const ctx = (o = {}) => ({ trust: 60, shown: [], text: "", evidence: {}, flags: {}, said: ["p1", "p2", "p3"], turn: 3, ...o });
  const can = (o) => sayable(bae, ctx(o)).map((f) => f.id);
  assert.ok(!can({ shown: ["I4"] }).includes("p5"));
  assert.ok(can({ shown: ["I4"] }).includes("p4"), "쪽지만 내밀면 한 문장으로 말해 보라고 한다");
  assert.ok(!can({ shown: ["I4"], flags: { deduced_decoy: true } }).includes("p5"), "하나만으로는 모자라다");
  assert.ok(!can({ flags: { deduced_decoy: true, deduced_brain: true } }).includes("p5"), "맞췄어도 내밀어야 한다");
  const both = { shown: ["I4"], flags: { deduced_decoy: true, deduced_brain: true } };
  assert.ok(can(both).includes("p5") && !can(both).includes("p4"));
  assert.deepEqual(ruleNpcReply(bae, ctx(both)).revealed, ["p5"]);
  assert.deepEqual(bae.facts.find((f) => f.id === "p5").effect, { flags: ["room_open"] });
});

test("프롤로그: LLM 없이 끝까지 간다 — 옥탑방에서 12시험실 문 앞까지", () => {
  const st = newSiteState(S.prologue_rooftop);
  // ── 옥탑방: 노트북에서 글 넷 ──
  look(st, "rt_laptop");
  for (const [pg, b] of [["sehan_article", "p1"], ["nea_press", "p1"], ["blog_miracle", "p1"], ["plaza_post", "p1"]]) {
    webVisit(CASE, st, pg);
    assert.ok(webClip(CASE, st, pg, null, b).ok, pg);
  }
  settle(st);
  assert.deepEqual(Object.keys(st.evidence).sort(), ["P1", "P2", "P3", "P4"]);
  // 판본 비교: 기사와 보도자료를 '원문'으로 잇고, 사라진 말을 짚는다
  assert.equal(currentQuestion(CASE, st).id, "q_trace");
  assert.ok(questionOpen(CASE.questions.find((q) => q.id === "q_gap"), st));
  const src = link(st, "P2", "P1", "source");
  assert.equal(src.compare, "I2", "원문으로 이으면 두 문서가 겹쳐진다");
  const run = compareView(CASE, "I2").runs.find((r) => r.text.includes(CASE.links.I2.compare.target));
  assert.ok(pickCompare(CASE, st, "I2", run.id).ok && "I2" in st.evidence);
  assert.ok(!questionOpen(CASE.questions.find((q) => q.id === "q_gap"), st), "풀고 나면 곁가지 물음은 닫힌다");
  assert.ok(deduce(st, "gap", { said: "P1", unsaid: "I2" }).ok && st.flags.deduced_gap);
  look(st, "rt_parcel");
  examine(st, "parcel", "memo");
  look(st, "rt_stairs");

  // ── 학원: 성적과 연습지 ──
  go(st, "academy");
  assert.equal(st.minute >= at(FRI, 8, 40), true);
  assert.deepEqual(say(st, "tutor"), ["t1"]);
  assert.ok("P9" in st.evidence);
  assert.equal(link(st, "P3", "P9", "time").kind, "order", "앞뒤는 먼저 일어난 일에서 나중 일로 긋는다");
  assert.equal(link(st, "P9", "P3", "time").id, "I0");
  look(st, "ac_rank");
  look(st, "ac_desk");
  examine(st, "practice", "margin");
  examine(st, "practice", "gloss");
  assert.ok("P10" in st.evidence);
  look(st, "ac_gap");
  assert.ok("P12" in st.evidence);

  // ── 아파트: 경비원과 필통 ──
  go(st, "apt");
  assert.equal(spotStatus(spotOf("apt_shelf"), st), "locked", "주운 사람의 말을 듣기 전에는 선반을 뒤지지 않는다");
  assert.deepEqual(say(st, "guard"), ["g1"]);
  assert.ok("P11" in st.evidence);
  look(st, "apt_shelf");
  for (const d of ["ticket", "glasses", "pen"]) examine(st, "pencilcase", d);
  assert.ok("P7" in st.evidence && st.items.includes("pen") && st.items.includes("glasses") && st.flags.know_seat);
  // 겹쳐 보기: 펜의 검은 네모를 왼쪽 알 너머로 본다
  const combine = CASE.inspects.pen.combine;
  assert.equal(combine.with, "glasses");
  assert.ok(!("P8" in st.evidence));
  apply(st, combine.gives);
  settle(st);
  assert.ok("P8" in st.evidence && st.flags.trig_decoded);
  assert.equal(link(st, "P8", "P2", "contra").id, "I4");
  look(st, "apt_door");
  assert.ok(st.flags.met_mother);
  assert.equal(currentQuestion(CASE, st).id, "q_school");

  // ── 목원고: 행정실, 그리고 오후 3시 ──
  go(st, "gate");
  look(st, "gt_board");
  assert.ok("P13" in st.evidence);
  assert.equal(spotStatus(spotOf("gt_stairs"), st), "locked");
  assert.deepEqual(say(st, "chief"), ["c1"]);
  assert.deepEqual(say(st, "chief"), ["c2"]);
  assert.ok(st.flags.know_bae_time);
  assert.ok(st.minute < at(FRI, 15), `오전 안에 세 곳을 돈다 (${st.minute})`);
  assert.throws(() => say(st, "bae"), /자리에 없다/);
  look(st, "gt_wait");
  assert.equal(st.minute, at(FRI, 15));
  assert.deepEqual(say(st, "bae"), ["p1"]);
  assert.ok("P5" in st.evidence);
  assert.deepEqual(say(st, "bae", { shown: ["P10"] }), ["p2"]);
  assert.ok("P6" in st.evidence);
  assert.equal(link(st, "P4", "P5", "contra").id, "I1");
  assert.equal(link(st, "P6", "P10", "same").id, "I3");
  // 추리를 맞추기 전에 쪽지를 내밀면 되묻는다
  assert.deepEqual(say(st, "bae", { shown: ["I4"] }), ["p4"]);
  assert.ok(!st.flags.room_open);
  assert.equal(deduce(st, "decoy", { what: "P7", who: "P11" }).ok, false, "경비원은 통과시킨 사람이 아니다");
  assert.ok(deduce(st, "decoy", { what: "P7", who: "I1" }).ok);
  const brain = deduce(st, "brain", { eye: "I3", where: "I4" });
  assert.ok(brain.ok && st.flags.deduced_decoy && st.flags.deduced_brain);
  assert.equal(brain.sentence, "도현은 펜으로 문제를 읽었고, 답은 펜 밖에서 왔다. 전파는 막혀 있었으니 그 두뇌는 빛이 닿는 곳, 시험실 안에 있다.");
  assert.equal(currentQuestion(CASE, st).id, "q_door");
  assert.deepEqual(say(st, "bae", { shown: ["I4"] }), ["p5"]);
  assert.ok(st.flags.room_open && st.flags.trig_agreed);
  assert.equal(currentQuestion(CASE, st).id, "q_enter");
  assert.equal(spotStatus(spotOf("gt_stairs"), st), "open");
  look(st, "gt_stairs");
  assert.ok(st.flags.prologue_done);
  assert.equal(spotOf("gt_stairs").goto.site, "mokwon_room12");
  assert.ok(st.minute < at(FRI, 18), "금요일 저녁 전에 끝난다");
  assert.equal(Object.keys(st.evidence).length, Object.keys(CASE.evidence).length, "카드를 모두 얻는 길이다");

  // 수첩: 다른 장소의 인물과 사실도 남아 있다
  assert.deepEqual(peoplePage(CASE, st).map((p) => p.id).sort(), ["bae", "chief", "dohyeon", "guard", "mother", "tutor"]);
  assert.ok(factsPage(here(st), st).flatMap((g) => g.items).length >= 8);
  assert.ok(questionsPage(CASE, st).list.find((x) => x.q.id === "q_leap").done);
  assert.equal(questionsPage(CASE, st).deds.filter((d) => d.solved).length, 3);

  // ── 제1장으로 넘어간다 ──
  const next = carryInto(ROOM, st);
  assert.equal(next.site, "mokwon_room12");
  assert.equal(next.minute, ROOM.start.minute, "수업이 끝나는 4시 50분에 올라간다");
  assert.deepEqual(Object.keys(next.evidence).sort(), Object.keys(st.evidence).sort());
  assert.deepEqual(Object.keys(next.board.links).sort(), ["I0", "I1", "I2", "I3", "I4"]);
  assert.ok(next.flags.deduced_decoy && next.flags.deduced_brain && next.flags.deduced_gap);
  assert.ok(!Object.keys(next.flags).some((f) => f.startsWith("trig_")), "제1장의 일은 제1장에서 일어난다");
  assert.deepEqual(next.items, ROOM.start.items);
  assert.equal(next.npc.bae.said.includes("p5"), true);
  assert.deepEqual(next.seen, {});
  assert.equal(currentQuestion(ROOM, next).id, ROOM.questions[0].id);
});

test("프롤로그: 금요일을 놓치면 토요일 아침에 올라가고, 그때는 재점검이 지나 있다", () => {
  const st = newSiteState(S.prologue_gate);
  apply(st, { evidence: Object.keys(CASE.evidence), flags: ["deduced_decoy", "deduced_brain", "room_open"] });
  st.minute = at(SAT, 9, 20);
  const next = carryInto(ROOM, st);
  assert.equal(next.minute, at(SAT, 9, 20), "시각은 뒤로 가지 않는다");
  runDeadlines(ROOM, next);
  assert.ok(next.flags.device_gone, "토요일 새벽 5시의 재점검이 먼저 지나갔다");
});
