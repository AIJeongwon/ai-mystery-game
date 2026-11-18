// 현장(3D 조사) — 화면 없이 규칙만 확인한다.
// 자리 이름이 블록아웃과 맞는지, 단서가 빠짐없이 이어지는지, LLM 없이 끝까지 갈 수 있는지.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOKWON_ROOM12 as DEF, SITES } from "../public/js/data/sites/mokwon.js";
import { newSiteState, lockOpen, spotStatus, useSpot, apply, nodeVisible, currentQuestion, questionProgress, runDeadlines, nextDeadline, fmtClock, daylight, sentences, sayable, acceptNpcReply, ruleNpcReply } from "../public/js/site/state.js";
import { makeNav, setBoxEnabled, blocked, step, findPath } from "../public/js/site/nav.js";
import { RELS, REL_ORDER, boardOf, ownedCards, tryLink, diffWords, compareView, pickCompare, stripAdd, stripRemove, stripView, stripX, dedOpen, dedSlots, dedState, setSlot, checkDeduction, dedSentence, questionsPage, factsPage, pullFact, peoplePage, moodOf, primeBook, bookUnseen, markBookSeen, bookKeys, boardUnseen, hintsLeft, ponder, PONDER_MINUTES } from "../public/js/site/reason.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spot = (id) => DEF.spots.find((s) => s.id === id);
const bae = DEF.npcs.find((n) => n.id === "bae");

// 살펴볼 수 있을 때만 살펴본다 (화면에서 표시가 떠 있을 때와 같다)
function look(st, id) {
  const s = spot(id);
  assert.notEqual(spotStatus(s, st), "hidden", `${id}가 아직 보이면 안 된다`);
  const fresh = useSpot(st, s);
  settle(st);
  return fresh;
}
// 조건이 맞은 일을 일으킨다 (엔진의 runTriggers와 같다)
function settle(st) {
  for (const tr of DEF.triggers || []) {
    if (!st.flags[`trig_${tr.id}`] && lockOpen(tr.when, st)) {
      st.flags[`trig_${tr.id}`] = true;
      apply(st, tr.effect);
    }
  }
  runDeadlines(DEF, st);
}
// 증거판에서 두 장을 잇는다
function link(st, a, b, rel) {
  const res = tryLink(DEF, st, a, b, rel);
  settle(st);
  return res;
}
const owning = (...ids) => {
  const st = newSiteState(DEF);
  apply(st, { evidence: ids });
  return st;
};
function examine(st, inspectId, detailId) {
  const d = DEF.inspects[inspectId].details.find((x) => x.id === detailId);
  assert.ok((d.needs || []).every((n) => st.seen[`${inspectId}.${n}`]), `${detailId}는 먼저 볼 것이 있다`);
  st.seen[`${inspectId}.${d.id}`] = 1;
  if (d.gives) apply(st, d.gives);
  return d;
}

test("현장 데이터: 자리 이름이 블록아웃 배치와 맞는다", () => {
  const layout = fs.readFileSync(path.join(ROOT, "tools", "3d", "room12_layout.py"), "utf8");
  const markers = new Set([...layout.matchAll(/\("((?:spot|spawn|npc|view|fx)_[a-z0-9_]+)"/g)].map((m) => m[1]));
  assert.ok(markers.size >= 15, "배치 파일에서 자리 이름을 읽어야 한다");
  const used = [DEF.start.spawn, ...DEF.spots.map((s) => s.node), ...DEF.npcs.map((n) => n.node), ...(DEF.triggers || []).map((t) => t.lookAt), ...DEF.spots.map((s) => s.climb).filter((c) => typeof c === "string")];
  assert.deepEqual(used.filter((n) => !markers.has(n)), []);
  assert.equal(SITES[DEF.id], DEF);
});

test("현장 데이터: 가리키는 증거·열람·물건이 모두 있다", () => {
  const ev = new Set(Object.keys(DEF.evidence));
  const refs = [...DEF.start.evidence, ...DEF.questions.flatMap((q) => q.cards), ...Object.keys(DEF.links), ...DEF.spots.map((s) => s.card).filter(Boolean)];
  const effects = [...DEF.spots.map((s) => s.gives), ...DEF.deadlines.map((d) => d.effect), ...DEF.triggers.map((t) => t.effect)];
  for (const ins of Object.values(DEF.inspects)) {
    for (const d of ins.details) {
      effects.push(d.gives);
      for (const o of d.choice?.options || []) effects.push(o.effect);
      for (const n of d.needs || []) assert.ok(ins.details.some((x) => x.id === n), `needs: ${n}`);
    }
    effects.push(ins.combine?.gives);
  }
  for (const e of effects) refs.push(...(e?.evidence || []));
  for (const n of DEF.npcs) for (const f of n.facts) if (f.gives) refs.push(f.gives);
  for (const it of Object.values(DEF.items)) if (it.evidence) refs.push(it.evidence);
  assert.deepEqual(refs.filter((id) => !ev.has(id)), []);
  for (const s of DEF.spots) if (s.inspect) assert.ok(DEF.inspects[s.inspect], `열람 ${s.inspect}`);
  for (const it of Object.values(DEF.items)) if (it.inspect) assert.ok(DEF.inspects[it.inspect], `열람 ${it.inspect}`);
  for (const id of DEF.start.items) assert.ok(DEF.items[id], `물건 ${id}`);
  // 모든 증거는 얻을 길이 있다
  const reachable = new Set(refs);
  assert.deepEqual([...ev].filter((id) => !reachable.has(id)), []);
  // 인물의 말: 규칙이 가리키는 증거, 대사, 발뺌
  for (const n of DEF.npcs) {
    assert.ok(n.deflect.length >= 2 && n.opening.length);
    for (const f of n.facts) {
      assert.ok(f.text && f.say, `${f.id}에는 사실과 규칙 모드 대사가 있어야 한다`);
      for (const r of f.rule) for (const id of [...(r.shown || []), ...(r.evidence || [])]) assert.ok(ev.has(id), `${f.id}: ${id}`);
    }
  }
});

test("현장: LLM 없이 교실 조사를 끝까지 따라갈 수 있다", () => {
  const st = newSiteState(DEF);
  assert.deepEqual(Object.keys(st.evidence), ["P2", "P1", "P4", "P5", "P7", "P8", "I1", "I4"], "프롤로그에서 얻은 것을 이어받는다");
  assert.equal(currentQuestion(DEF, st).id, "q_seat");
  assert.equal(spotStatus(spot("ceiling24"), st), "hidden", "위를 볼 까닭이 생기기 전에는 천장에 표시가 없다");
  assert.equal(spotStatus(spot("ladder"), st), "hidden");
  assert.equal(nodeVisible(DEF, st, "ladder_folded"), false);

  assert.deepEqual(look(st, "desk24").evidence, ["C1"]);
  assert.ok(!st.flags.look_up, "가루만으로는 아직 올려다보지 않는다");
  look(st, "floor_ladder");
  assert.ok(!st.flags.look_up, "두 장을 모은 것만으로는 올려다보지 않는다. 판에서 이어야 한다");
  assert.equal(currentQuestion(DEF, st).id, "q_link");
  assert.equal(link(st, "C1", "C2", "contra").kind, "rel", "이어지지만 그 부호가 아니다");
  const made = link(st, "C1", "C2", "same");
  assert.ok(made.ok && made.id === "I5" && made.close, "잇는 순간 판이 덮이고 눈길이 위로 간다");
  assert.ok(st.flags.look_up && "I5" in st.evidence);
  assert.equal(currentQuestion(DEF, st).id, "q_above");
  look(st, "floor_old");
  look(st, "desk24_under");
  assert.deepEqual(questionProgress(DEF.questions[0], st), [4, 4]);

  look(st, "ceiling24");
  assert.ok("C5" in st.evidence && st.flags.ceiling_found);
  assert.equal(spotStatus(spot("ceiling24"), st), "done", "한 번 찾은 구멍은 표시만 남는다");
  assert.equal(nodeVisible(DEF, st, "ladder_folded"), true, "배수정이 사다리를 빌려 온다");

  look(st, "ladder");
  assert.equal(st.holding, "ladder");
  assert.equal(spotStatus(spot("ladder"), st), "hidden");
  look(st, "ladder_place");
  assert.equal(st.holding, null);
  assert.ok(nodeVisible(DEF, st, "ladder_open") && nodeVisible(DEF, st, "col_ladder_open"));
  assert.equal(spotStatus(spot("tile24"), st), "hidden", "사다리에 올라야 텍스가 손에 닿는다");
  look(st, "ladder_climb");
  assert.equal(spotStatus(spot("tile24_push"), st), "hidden", "깨진 모서리를 먼저 본다");
  look(st, "tile24");
  look(st, "tile24_push");
  assert.ok(st.flags.tile_open);
  assert.equal(spotStatus(spot("plenum"), st), "open");
  assert.equal(spotStatus(spot("plenum_empty"), st), "hidden");

  look(st, "plenum");
  assert.throws(() => examine(st, "plenum", "ties"), /먼저 볼 것/);
  for (const d of ["device", "mic", "ties", "sticker", "power"]) examine(st, "plenum", d);
  for (const id of ["C7", "C8", "C9", "C10"]) assert.ok(id in st.evidence, id);
  assert.equal(currentQuestion(DEF, st).id, "q_card");
  const card = examine(st, "plenum", "card");
  const pull = card.choice.options.find((o) => o.id === "pull");
  apply(st, pull.effect);
  assert.ok("C11" in st.evidence && st.flags.card_pulled);
  assert.equal(currentQuestion(DEF, st).id, "q_night", "이제 그날 밤을 문장으로 맞춘다");
  look(st, "ladder_down");
  assert.ok(!st.flags.on_ladder);
  // 전날 밤 누가 들어올 수 있었는지 묻는다 (규칙 모드: 사다리 자국을 내민다)
  const said = ruleNpcReply(bae, { trust: 60, shown: ["C2"], text: "", evidence: st.evidence, said: ["b1"], turn: 1 });
  assert.deepEqual(said.revealed, ["b4"]);
  apply(st, { evidence: [bae.facts.find((f) => f.id === "b4").gives], minutes: 4 });
  assert.equal(link(st, "C9", "C29", "time").kind, "order", "앞뒤는 먼저 일어난 일에서 나중 일로 긋는다");
  assert.equal(link(st, "C29", "C9", "time").id, "I12");
  const ded = dedOpen(DEF, st)[0];
  assert.deepEqual(dedSlots(ded, st), ["where", "who", "up", "on"]);
  for (const [slot, card] of [["where", "I5"], ["who", "I12"], ["up", "C9"], ["on", "C10"]]) assert.ok(setSlot(DEF, st, "night", slot, card));
  const solved = checkDeduction(DEF, st, "night");
  assert.ok(solved.ok && st.flags.deduced_night);
  assert.equal(solved.sentence, "두뇌는 24번 자리 위 천장에 있었다. 봉인된 방에 시설 쪽의 '오'가 들어와 시험 전날 밤 9시 40분에 그것을 올리고, 시험 날 새벽 5시 40분에 켰다.");
  assert.equal(currentQuestion(DEF, st).id, "q_next");
  assert.ok(st.minute - DEF.start.minute <= 90, "첫 조사는 한 시간 반 안에 끝난다");
  assert.equal(nextDeadline(DEF, st), null, "텍스를 열었으면 새벽의 회수는 일어나지 않는다");
});

test("현장: 신고를 고르면 로그는 미뤄지고, 다시 보는 데에는 시간이 들지 않는다", () => {
  const st = newSiteState(DEF);
  const report = DEF.inspects.plenum.details.find((d) => d.id === "card").choice.options.find((o) => o.id === "report");
  apply(st, report.effect);
  assert.ok(st.flags.card_reported && st.flags.log_pending && !("C11" in st.evidence));
  const t0 = st.minute;
  useSpot(st, spot("blackboard"));
  assert.equal(st.minute - t0, spot("blackboard").minutes);
  useSpot(st, spot("blackboard"));
  assert.equal(st.minute - t0, spot("blackboard").minutes, "두 번째부터는 시간이 가지 않는다");
});

test("현장: 토요일 새벽 5시가 지나면 장치는 사라지고 흔적만 남는다", () => {
  const st = newSiteState(DEF);
  assert.equal(nextDeadline(DEF, st).id, "retrieval");
  st.minute = 1440 + 5 * 60 + 1;
  assert.equal(runDeadlines(DEF, st).length, 1);
  assert.ok(st.flags.device_gone);
  assert.equal(runDeadlines(DEF, st).length, 0, "한 번만 일어난다");
  apply(st, { flags: ["on_ladder", "tile_open"] });
  assert.equal(spotStatus(spot("plenum"), st), "hidden");
  assert.equal(spotStatus(spot("plenum_empty"), st), "open");
  examine(st, "plenum_empty", "ties");
  examine(st, "plenum_empty", "sticker");
  assert.ok("C8" in st.evidence && "C9" in st.evidence && !("C7" in st.evidence), "장치는 못 봐도 묶은 사람의 흔적은 남는다");
});

test("현장 대화: 말할 수 있는 것은 규칙이 정한다", () => {
  const ctx = (o = {}) => ({ trust: 60, shown: [], text: "", evidence: {}, said: [], turn: 0, ...o });
  assert.deepEqual(sayable(bae, ctx()).map((f) => f.id), ["b1"]);
  assert.ok(sayable(bae, ctx({ text: "전날 밤에는 누가 들어올 수 있었나요" })).some((f) => f.id === "b4"));
  assert.ok(sayable(bae, ctx({ shown: ["C3"] })).some((f) => f.id === "b3"));
  assert.ok(sayable(bae, ctx({ trust: 72 })).some((f) => f.id === "b2"), "믿음이 쌓이면 묻지 않아도 버릇 이야기를 한다");
  assert.ok(sayable(bae, ctx({ evidence: { C7: 1 } })).some((f) => f.id === "b5"));
  // 모델이 아직 말할 수 없는 것을 밝히면 그 답은 버린다
  assert.equal(acceptNpcReply(bae, ctx(), { speech: "책상이 옮겨졌어요.", revealed: ["b3"], trust_delta: 0, end: false }), null);
  const ok = acceptNpcReply(bae, ctx({ shown: ["C3"] }), { speech: "책상이 옮겨졌어요.", revealed: ["[b3]"], trust_delta: 5, end: false });
  assert.deepEqual(ok.revealed, ["b3"]);
  assert.equal(ok.trust_delta, 2);
  assert.equal(acceptNpcReply(bae, ctx(), { speech: 3 }), null);
  // 규칙 모드: 물음과 내민 증거에 맞는 말을 먼저 한다
  const r1 = ruleNpcReply(bae, ctx({ text: "책상 자리가 달라졌나요", shown: ["C3"] }));
  assert.deepEqual(r1.revealed, ["b3"]);
  assert.equal(bae.facts.find((f) => f.id === "b3").gives, "C17");
  const r2 = ruleNpcReply(bae, ctx({ text: "고맙습니다", said: ["b1"] }));
  assert.deepEqual(r2.revealed, []);
  assert.ok(bae.deflect.includes(r2.speech) && r2.trust_delta === 1);
});

test("현장 대화: 잠긴 사실은 프롬프트에 들어가지 않는다", async () => {
  globalThis.window ??= globalThis;
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  const { siteNpcRequest } = await import("../public/js/llm/tasks/site-npc.js");
  const st = newSiteState(DEF);
  st.npc.bae = { trust: 60, said: [], turns: 0, log: [], chat: [] };
  const facts = sayable(bae, { trust: 60, shown: [], text: "안녕하세요", evidence: st.evidence, said: [], turn: 0 });
  const req = siteNpcRequest(DEF, bae, facts, st, { trust: 60, text: "안녕하세요", shown: [] });
  assert.equal(req.task, "npc");
  assert.ok(req.system.includes("[b1]"));
  for (const id of ["b2", "b3", "b4", "b5"]) assert.ok(!req.system.includes(`[${id}]`), `${id}가 새어 나갔다`);
  assert.ok(!req.system.includes("오른눈을 찡그렸"), "잠긴 사실의 내용이 새어 나갔다");
});

test("현장의 빛: 조사하는 동안 해가 진다", () => {
  const at = (h, m) => daylight(h + m / 60, DEF.light.sunrise, DEF.light.sunset);
  const start = DEF.start.minute % 1440;
  assert.deepEqual(daylight(start / 60, DEF.light.sunrise, DEF.light.sunset), { sun: 1, sky: 1 }, "시작할 때는 해가 창으로 든다");
  assert.equal(at(17, 30).sun, 0);
  assert.ok(at(17, 30).sky > 0.3 && at(17, 30).sky < 0.7, "해가 진 직후에는 하늘빛이 남는다");
  assert.equal(at(18, 30).sky, 0.03);
  assert.equal(at(5, 20).sun, 0, "새벽 5시는 아직 어둡다");
  let prev = 2;
  for (let m = start; m <= start + 120; m += 5) {
    const v = daylight(m / 60, DEF.light.sunrise, DEF.light.sunset).sky;
    assert.ok(v <= prev);
    prev = v;
  }
  assert.equal(fmtClock(DEF.start.minute), "금요일 오후 4시 50분");
  assert.equal(fmtClock(1440 + 300), "토요일 오전 5시");
});

test("현장: 답을 문장으로 나눈다", () => {
  assert.deepEqual(sentences("전날 저녁 6시에 봉인했어요. 그 뒤로는… 당직뿐이에요! 정말요?"), ["전날 저녁 6시에 봉인했어요.", "그 뒤로는…", "당직뿐이에요!", "정말요?"]);
  assert.deepEqual(sentences("마침표 없는 말"), ["마침표 없는 말"]);
  assert.deepEqual(sentences(""), []);
});

test("현장 걷기: 가구를 돌아서 가고, 막힌 곳에는 들어가지 않는다", () => {
  const wall = (name, minX, maxX, minZ, maxZ) => ({ name, minX, maxX, minZ, maxZ });
  const boxes = [wall("col_w0", -4.2, -4, -3, 3), wall("col_w1", 4, 4.2, -3, 3), wall("col_w2", -4, 4, -3.2, -3), wall("col_w3", -4, 4, 3, 3.2), wall("col_desk", -1, 1, -0.4, 0.4), wall("col_ladder_open", 2, 2.6, 1, 1.8)];
  const nav = makeNav(boxes);
  assert.ok(blocked(nav, 0, 0) && !blocked(nav, 0, 1.5));
  const p = findPath(nav, 0, -2, 0, 2);
  assert.ok(p && p.length >= 3, "책상을 돌아가는 길이 있어야 한다");
  for (const [x, z] of p) assert.ok(!blocked(nav, x, z));
  const len = p.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
  assert.ok(len > 4.2 && len < 8, `돌아가는 길이 ${len.toFixed(1)}m`);
  // 벽으로 밀어도 벽 안으로 들어가지 않는다
  let x = 3, z = 0;
  for (let i = 0; i < 40; i++) [x, z] = step(nav, x, z, 0.1, 0);
  assert.ok(x < 4 - 0.2, `벽 앞에서 멈춘다 (x=${x.toFixed(2)})`);
  // 사다리를 세우면 그 자리가 막히고, 치우면 다시 열린다
  assert.ok(blocked(nav, 2.3, 1.4));
  setBoxEnabled(nav, "col_ladder_open", false);
  assert.ok(!blocked(nav, 2.3, 1.4));
  // 막힌 곳을 누르면 가장 가까운 빈 자리까지 간다
  const q = findPath(nav, 0, -2, 0, 0);
  assert.ok(q && !blocked(nav, ...q[q.length - 1]));
});

test("증거판 데이터: 잇기·추리·시간 띠가 가리키는 카드가 모두 있다", () => {
  const ev = DEF.evidence;
  for (const [id, l] of Object.entries(DEF.links)) {
    assert.equal(ev[id]?.kind, "추론", `${id}는 추론 쪽지여야 한다`);
    for (const f of [{ from: l.from, rel: l.rel }, ...(l.alt || [])]) {
      assert.ok(RELS[f.rel] && f.from.length === 2 && f.from.every((c) => ev[c]), `${id}: ${f.from}`);
      if (f.rel === "time") assert.ok(ev[f.from[0]].at < ev[f.from[1]].at, `${id}: 앞뒤는 이른 것이 먼저다`);
    }
    if (l.compare) assert.ok(l.from.every((c) => Array.isArray(ev[c].body)) && ev[l.from[0]].body.join(" ").includes(l.compare.target));
  }
  assert.deepEqual(REL_ORDER.map((r) => RELS[r].key), ["1", "2", "3", "4"]);
  for (const m of DEF.misses) assert.ok(m.pair.every((c) => ev[c]) && m.text);
  for (const [id, l] of Object.entries(DEF.start.links)) assert.ok(DEF.start.evidence.includes(id) && DEF.start.evidence.includes(l.a) && DEF.start.evidence.includes(l.b));
  for (const d of DEF.deductions) {
    for (const parts of [d.parts, ...(d.variants || []).map((v) => v.parts)]) for (const p of parts) if (p.slot) assert.ok(d.slots[p.slot], p.slot);
    for (const sl of Object.values(d.slots)) for (const c of [...Object.keys(sl.accept), ...Object.keys(sl.near || {})]) assert.ok(ev[c], c);
  }
  for (const b of DEF.timeline.bands) assert.ok(ev[b.card].at === b.from && b.from < b.to);
  for (const e of Object.values(ev)) if (e.refutedBy) assert.ok(ev[e.refutedBy]);
  for (const p of DEF.people) assert.ok(p.npc ? DEF.npcs.some((n) => n.id === p.npc) : p.name && p.role);
  for (const s of DEF.spots) if (s.card) assert.ok(s.note && ev[s.card], `${s.id}: 판으로 꺼낼 관찰에는 수첩에 적을 말이 있어야 한다`);
  for (const q of DEF.questions) for (const h of q.hints || []) assert.ok(typeof h === "string" && h.length > 8);
});

test("증거판: 틀린 잇기는 까닭만 알려 주고, 같은 쌍을 세 번 틀리면 실마리가 열린다", () => {
  const st = owning("C1", "C2", "C3", "C4");
  assert.equal(boardOf(st).links.I1.rel, "contra", "이어받은 선이 판에 그어져 있다");
  assert.equal(tryLink(DEF, st, "P4", "P5", "same").kind, "dup");
  assert.equal(tryLink(DEF, st, "C1", "C9", "same").kind, "none", "갖지 않은 카드는 이을 수 없다");
  const t0 = st.minute;
  const miss = tryLink(DEF, st, "C1", "C4", "same");
  assert.ok(!miss.ok && miss.kind === "none" && miss.text.includes("상판"), "까닭을 적어 둔 쌍은 그 까닭을 말한다");
  assert.equal(tryLink(DEF, st, "C3", "C4", "time").text, RELS.time.miss);
  assert.equal(st.minute, t0, "틀려도 시간은 가지 않는다");
  assert.equal(currentQuestion(DEF, st).id, "q_link");
  assert.equal(tryLink(DEF, st, "C2", "C3", "same").hint, false);
  assert.equal(tryLink(DEF, st, "C3", "C2", "contra").hint, false, "순서를 바꿔도 같은 쌍이다");
  assert.equal(tryLink(DEF, st, "C2", "C3", "time").hint, true);
  assert.deepEqual(questionsPage(DEF, st).list.find((x) => x.now).hints, [DEF.questions[1].hints[0]]);
  assert.ok(!("I5" in st.evidence));
});

test("증거판: 같은 쪽지에 닿는 다른 길도 받아 준다", () => {
  const st = owning("C3", "C17");
  look(st, "notice");
  assert.ok(pullFact(DEF, st, "N1").evidence.includes("N1"));
  assert.equal(pullFact(DEF, st, "N1"), null, "한 번만 꺼낸다");
  assert.equal(pullFact(DEF, st, "N2"), null, "보지 않은 것은 꺼낼 수 없다");
  const first = tryLink(DEF, st, "N1", "C3", "contra");
  assert.ok(first.ok && first.id === "I6" && !first.again);
  const second = tryLink(DEF, st, "C17", "C3", "same");
  assert.ok(second.ok && second.again && second.fresh.evidence.length === 0);
  assert.equal(boardOf(st).more.length, 1);
  assert.equal(tryLink(DEF, st, "C3", "C17", "same").kind, "dup");
});

test("판본 비교: 기사가 지운 문장을 짚어야 쪽지가 된다", () => {
  assert.deepEqual(diffWords(["가", "나", "다"], ["가", "라", "다", "마"]).map((o) => o.op), ["same", "del", "add", "same", "add"]);
  const st = newSiteState(DEF);
  const open = tryLink(DEF, st, "P1", "P2", "source");
  assert.deepEqual(open, { ok: true, compare: "I2" }, "원문으로 이으면 두 문서를 겹쳐 본다");
  assert.ok(!("I2" in st.evidence));
  const view = compareView(DEF, "I2");
  assert.deepEqual([view.a, view.b], ["P2", "P1"]);
  const text = (side) => view[side].filter((t) => !t.br).map((t) => t.text).join(" ");
  assert.equal(text("left"), DEF.evidence.P2.body.join(" "));
  assert.equal(text("right"), DEF.evidence.P1.body.join(" "));
  const target = view.runs.filter((r) => r.text.includes("시험 중 부정행위 여부는"));
  assert.equal(target.length, 1);
  assert.equal(target[0].side, "left", "지워진 문장은 원문 쪽에만 있다");
  const other = view.runs.find((r) => r !== target[0]);
  const miss = pickCompare(DEF, st, "I2", other.id);
  assert.ok(!miss.ok && miss.text === DEF.links.I2.compare.miss);
  const hit = pickCompare(DEF, st, "I2", target[0].id);
  assert.ok(hit.ok && hit.id === "I2" && "I2" in st.evidence);
  assert.deepEqual(boardOf(st).links.I2, { a: "P2", b: "P1", rel: "source" });
});

test("시간 띠: 봉인된 시간 안에 무언가 놓이면 한 번 알아챈다", () => {
  const st = owning("C9", "C10", "C29", "C1");
  assert.equal(stripAdd(DEF, st, "C1").ok, false, "시각이 없는 카드는 올릴 수 없다");
  assert.deepEqual(stripAdd(DEF, st, "C9"), { ok: true, insight: null });
  assert.equal(stripAdd(DEF, st, "C9").ok, false);
  assert.equal(stripView(DEF, st).bands.length, 0, "봉인 진술을 올리기 전에는 띠가 없다");
  assert.equal(stripAdd(DEF, st, "C29").insight, DEF.timeline.bands[0].note);
  assert.equal(stripAdd(DEF, st, "C10").insight, null, "두 번 말하지 않는다");
  const view = stripView(DEF, st);
  assert.deepEqual(view.items.map((i) => [i.id, i.inside]), [["C9", true], ["C29", false], ["C10", true]]);
  assert.ok(view.marks.length === 1 && view.blocks.length === 5);
  const x = (id) => stripX(view, DEF.evidence[id].at);
  assert.ok(0 < x("C29") && x("C29") < x("C9") && x("C9") < x("C10") && x("C10") < stripX(view, view.blocks[1].from) && stripX(view, view.now) < 1);
  stripRemove(st, "C29");
  assert.ok(stripView(DEF, st).items.every((i) => !i.inside));
});

test("빈칸 추리: 틀리면 까닭을 듣고 30분이 흐른다", () => {
  const st = owning("C1", "C2", "C5", "C7", "C9", "C10", "C29");
  assert.equal(dedOpen(DEF, st).length, 0, "텍스를 열기 전에는 원고지가 비어 있다");
  apply(st, { flags: ["tile_open", "card_pulled"] });
  tryLink(DEF, st, "C1", "C2", "same");
  tryLink(DEF, st, "C29", "C10", "time");
  assert.ok("I12" in st.evidence, "전원 기록으로도 봉인 뒤의 손에 닿는다");
  assert.equal(checkDeduction(DEF, st, "night").incomplete, true);
  assert.equal(setSlot(DEF, st, "night", "where", "C8"), false, "갖지 않은 카드는 끼울 수 없다");
  setSlot(DEF, st, "night", "where", "C5");
  setSlot(DEF, st, "night", "who", "C9");
  setSlot(DEF, st, "night", "up", "C10");
  setSlot(DEF, st, "night", "on", "C10");
  assert.equal(dedState(st, "night").slots.up, undefined, "한 카드는 한 칸에만 들어간다");
  setSlot(DEF, st, "night", "up", "C29");
  const t0 = st.minute;
  const wrong = checkDeduction(DEF, st, "night");
  assert.ok(!wrong.ok && wrong.minutes === 30 && st.minute === t0 + 30);
  assert.ok(wrong.slots.on.ok && !wrong.slots.where.ok && wrong.slots.who.text.includes("봉인") && wrong.slots.up.text.includes("잠근"));
  assert.ok(!st.flags.deduced_night);
  for (const [slot, card] of [["where", "I5"], ["who", "I12"], ["up", "C9"]]) setSlot(DEF, st, "night", slot, card);
  assert.ok(checkDeduction(DEF, st, "night").ok);
  assert.equal(setSlot(DEF, st, "night", "where", "C5"), false, "맞춘 문장은 고치지 않는다");
  assert.ok(checkDeduction(DEF, st, "night").already);
  // 장치를 놓친 길: 켠 시각의 칸이 없다
  const late = owning("C1", "C2", "C8", "C9", "C29");
  apply(late, { flags: ["tile_open", "device_gone"] });
  assert.equal(currentQuestion(DEF, late).id, "q_night");
  tryLink(DEF, late, "C2", "C1", "same");
  tryLink(DEF, late, "C29", "C9", "time");
  const ded = dedOpen(DEF, late)[0];
  assert.deepEqual(dedSlots(ded, late), ["where", "who", "up"]);
  for (const [slot, card] of [["where", "I5"], ["who", "I12"], ["up", "C9"]]) setSlot(DEF, late, "night", slot, card);
  assert.ok(checkDeduction(DEF, late, "night").ok);
  assert.ok(dedSentence(DEF, ded, late).endsWith("켠 시각은 아직 모른다."));
});

test("수첩: 물음·사실·인물 쪽에 적히는 것", () => {
  const st = newSiteState(DEF);
  st.npc.bae = { trust: 60, said: [], turns: 0, log: [], chat: [] };
  primeBook(DEF, st);
  assert.deepEqual(bookUnseen(DEF, st), { q: 1, facts: 0, people: 0, total: 1 }, "이어받은 것은 이미 적혀 있고, 첫 물음만 새것이다");
  assert.equal(boardUnseen(st), 0);
  markBookSeen(st, bookKeys(DEF, st).q);
  assert.equal(bookUnseen(DEF, st).total, 0);
  // 사실: 이어받은 것과 이 방에서 본 것을 가른다
  let facts = factsPage(DEF, st);
  assert.deepEqual(facts.map((g) => g.title), ["앞서 알아낸 것", "판에서 이은 것"]);
  const mark = (id) => facts.flatMap((g) => g.items).find((i) => i.id === id)?.mark;
  assert.deepEqual([mark("P4"), mark("P5"), mark("P7"), mark("I1")], ["false", "heard", "seen", "note"], "의혹 글은 이미 거짓으로 드러났다");
  look(st, "desk24");
  look(st, "speaker");
  facts = factsPage(DEF, st);
  const here = facts.find((g) => g.title === DEF.title).items;
  assert.deepEqual(here.map((i) => [i.id || i.spot, i.pull || null]), [["C1", null], ["speaker", "N2"]]);
  assert.deepEqual(bookUnseen(DEF, st), { q: 0, facts: 2, people: 0, total: 2 });
  assert.equal(boardUnseen(st), 1, "새 카드가 판에 꽂혔다");
  pullFact(DEF, st, "N2");
  assert.ok(factsPage(DEF, st).find((g) => g.title === DEF.title).items.find((i) => i.spot === "speaker").pulled);
  // 물음: 가진 카드만 이름이 보인다. 실마리는 시간을 들여 청한다
  const now = questionsPage(DEF, st).list.find((x) => x.now);
  assert.deepEqual(now.cards.map((c) => c.owned), [true, false, false, false]);
  assert.equal(hintsLeft(DEF, st), 1);
  const t0 = st.minute;
  assert.deepEqual(ponder(DEF, st), { ok: true, minutes: PONDER_MINUTES });
  assert.equal(st.minute, t0 + PONDER_MINUTES);
  assert.equal(ponder(DEF, st).ok, false, "실마리가 다 떨어지면 시간도 가지 않는다");
  assert.equal(st.minute, t0 + PONDER_MINUTES);
  // 인물: 서명의 주인은 점검표를 본 뒤에 생긴다. 믿음은 숫자가 아니라 몸짓으로 적는다
  assert.deepEqual(peoplePage(DEF, st).map((p) => p.id), ["bae", "dohyeon"]);
  apply(st, { evidence: ["C3", "C9"] });
  st.statements.push({ id: "bae.0.0", who: "배수정", text: "그 학생 안경은 제가 직접 봤어요.", minute: st.minute });
  const people = peoplePage(DEF, st);
  assert.ok(people.find((p) => p.id === "oh").unknown);
  const b = people.find((p) => p.id === "bae");
  assert.equal(b.mood, moodOf(60));
  assert.equal(b.said.length, 1);
  assert.ok(b.unasked.some((u) => u.includes("책상의 옛 자국")), "내밀어 보지 않은 증거를 일러 준다");
  assert.ok(!b.unasked.some((u) => u.includes("전날 밤")), "실마리가 될 증거를 얻기 전에는 일러 주지 않는다");
  assert.notEqual(moodOf(30), moodOf(80));
  assert.deepEqual(ownedCards(newSiteState(DEF)).slice(0, 3), ["I1", "I4", "P1"], "같은 때 얻은 것은 이름순이다");
});
