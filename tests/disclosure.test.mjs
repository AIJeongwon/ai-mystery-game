// 실제 API 없이 공개 조건과 모델 응답 검증을 확인한다.
import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./_helpers.mjs";
import { spawnScripted } from "../public/js/sim/world.js";
import { canDisclose, acceptReply } from "../public/js/sim/press.js";
import { npcRequest } from "../public/js/llm/prompts.js";
import { BOX, GENEVA, LYON, NAIROBI, LONDON } from "../public/js/campaign/ch1/scenes.js";

const cases = [
  [BOX, "kwon", "b3", "모로 보고서가 언제 어떻게 조작으로 밝혀졌나요?"],
  [GENEVA, "bisson", "g3", "최종보고서를 언제 누구에게 받았나요? 입고 대장을 보여 주세요."],
  [LYON, "moreau", "l2", "보고서를 언제 어떤 방법으로 조작했나요?"],
  [LYON, "moreau", "l3", "실험 노트에 고친 흔적이 없네요.", ["e9"]],
  [NAIROBI, "otieno", "n2", "모로 박사를 만나 실험 노트를 봤습니다.", ["e9"]],
  [LONDON, "finch", "m2", "2019년 3월 17일 최종판 교정쇄를 보여 주세요."],
  [LONDON, "finch", "m3", "승인란의 E.C.는 누구 글씨인가요?", ["e19"]],
];

for (const [scene, source, id, question, evidence = []] of cases) {
  test(`증언 ${id}: 관련 없는 질문·근거는 보류하고 조건에 맞는 질문은 허용한다`, () => {
    const g = fresh();
    const ev = spawnScripted(scene);
    const src = ev.sources.find((s) => s.id === source);
    const fact = ev.facts.find((f) => f.id === id);
    const unrelated = { trust: 0, shown: [ev.facts[0].id], text: "오늘 날씨가 어떤가요?" };
    assert.equal(canDisclose(ev, src, fact, unrelated), false);
    for (const key of evidence) g.casefile.evidence[key] = { at: 0 };
    assert.equal(canDisclose(ev, src, fact, { trust: 0, text: question }), true);
    assert.equal(acceptReply(ev, src, unrelated, { speech: fact.text, revealed: [id] }), null);
    assert.deepEqual(acceptReply(ev, src, { trust: 0, text: question }, { speech: fact.text, revealed: [id] }).revealed, [id]);
  });
}

test("증거를 봤다는 주장만으로 증언 조건을 통과하지 않는다", () => {
  fresh();
  const ev = spawnScripted(LYON), src = ev.sources[0], fact = ev.facts.find((f) => f.id === "l3");
  assert.equal(canDisclose(ev, src, fact, { trust: 0, text: "실험 노트에 고친 흔적이 없습니다." }), false);
  assert.equal(canDisclose(ev, src, fact, { trust: 44, text: "" }), false);
  assert.equal(canDisclose(ev, src, fact, { trust: 45, text: "" }), true);
});

test("런던의 신뢰도 대안·알리바이 근거·공개 경력 조건을 지킨다", () => {
  const g = fresh(), ev = spawnScripted(LONDON), finch = ev.sources[0], lang = ev.sources[1];
  const final = ev.facts.find((f) => f.id === "m3"), career = ev.facts.find((f) => f.id === "m5");
  assert.equal(canDisclose(ev, finch, final, { trust: 59, text: "" }), false);
  assert.equal(canDisclose(ev, finch, final, { trust: 60, text: "" }), true);
  const ctx = { trust: 0, text: "크레인은 그날 밤 취리히에 있었습니다." };
  assert.equal(canDisclose(ev, finch, final, ctx), false);
  g.casefile.evidence.e21 = { at: 0 };
  assert.equal(canDisclose(ev, finch, final, ctx), true);
  assert.equal(canDisclose(ev, lang, career, { trust: 0, text: "당시 경력을 알려 주세요." }), true);
  assert.equal(canDisclose(ev, lang, final, { trust: 100, text: "" }), false);
});

test("잠긴 사실과 숨기는 사정은 현재 질문의 모델 입력에서 제외한다", () => {
  fresh();
  const ev = spawnScripted(BOX), src = ev.sources[0], hidden = ev.facts.find((f) => f.id === "b3");
  const blocked = npcRequest(ev, src, [], "오늘 날씨가 어떤가요?", { trust: 0, text: "오늘 날씨가 어떤가요?" });
  assert.equal(blocked.system.includes(hidden.text), false);
  assert.equal(blocked.system.includes(src.secret), false);
  assert.equal(blocked.system.includes(src.script), false);
  const allowed = npcRequest(ev, src, [], "모로 보고서가 언제 조작으로 밝혀졌나요?", { trust: 100, text: "모로 보고서가 언제 조작으로 밝혀졌나요?" });
  assert.ok(allowed.system.includes(hidden.text));
});

test("첫 인사·모르는 번호·현재 답의 신뢰도 상승으로 새 증언을 얻지 못한다", () => {
  fresh();
  const ev = spawnScripted(NAIROBI), src = ev.sources[0], fact = ev.facts.find((f) => f.id === "n2");
  assert.equal(canDisclose(ev, src, fact, { trust: 100, opening: true }), false);
  assert.equal(acceptReply(ev, src, { trust: 44, text: "" }, { speech: fact.text, revealed: ["n2"], trust_delta: 2 }), null);
  assert.equal(acceptReply(ev, src, { trust: 100 }, { speech: "새 증언", revealed: ["없는번호"] }), null);
  assert.equal(acceptReply(ev, src, {}, { speech: "잘못된 응답", revealed: {} }), null);
});

test("일반 증언도 아무 근거나 하나 내밀어서는 신뢰도 문턱을 넘지 않는다", () => {
  fresh();
  const ev = { id: "ordinary", facts: [{ id: "f", depth: 3, text: "내부 사실" }] };
  const src = { knows: ["f"], stance: "neutral" };
  assert.equal(canDisclose(ev, src, ev.facts[0], { trust: 0, shown: ["irrelevant"] }), false);
  assert.equal(canDisclose(ev, src, ev.facts[0], { trust: 70 }), true);
});

test("이전 저장에 공개 규칙이 없어도 각본의 현재 조건을 적용한다", () => {
  fresh();
  const ev = spawnScripted(BOX), src = ev.sources[0], fact = ev.facts.find((f) => f.id === "b3");
  const rules = { b3: fact.disclosure };
  delete fact.disclosure;
  assert.equal(canDisclose(ev, src, fact, { trust: 100, text: "날씨가 어떤가요?", rules }), false);
  assert.equal(canDisclose(ev, src, fact, { trust: 0, text: "모로 보고서 조작 발표를 언제 들었나요?", rules }), true);
});
