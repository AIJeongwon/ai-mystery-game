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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spot = (id) => DEF.spots.find((s) => s.id === id);
const bae = DEF.npcs.find((n) => n.id === "bae");

// 살펴볼 수 있을 때만 살펴본다 (화면에서 표시가 떠 있을 때와 같다)
function look(st, id) {
  const s = spot(id);
  assert.notEqual(spotStatus(s, st), "hidden", `${id}가 아직 보이면 안 된다`);
  const fresh = useSpot(st, s);
  for (const tr of DEF.triggers || []) {
    if (!st.flags[`trig_${tr.id}`] && lockOpen(tr.when, st)) {
      st.flags[`trig_${tr.id}`] = true;
      apply(st, tr.effect);
    }
  }
  runDeadlines(DEF, st);
  return fresh;
}
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
  const refs = [...DEF.start.evidence, ...DEF.questions.flatMap((q) => q.cards)];
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
  assert.deepEqual(Object.keys(st.evidence), ["P7", "P8"]);
  assert.equal(currentQuestion(DEF, st).id, "q_seat");
  assert.equal(spotStatus(spot("ceiling24"), st), "hidden", "위를 볼 까닭이 생기기 전에는 천장에 표시가 없다");
  assert.equal(spotStatus(spot("ladder"), st), "hidden");
  assert.equal(nodeVisible(DEF, st, "ladder_folded"), false);

  assert.deepEqual(look(st, "desk24").evidence, ["C1"]);
  assert.ok(!st.flags.look_up, "가루만으로는 아직 올려다보지 않는다");
  look(st, "floor_ladder");
  assert.ok(st.flags.look_up, "가루와 사다리 자국이 모이면 시선이 올라간다");
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
  assert.equal(currentQuestion(DEF, st).id, "q_next");
  look(st, "ladder_down");
  assert.ok(!st.flags.on_ladder);
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
