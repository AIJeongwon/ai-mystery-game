// LLM 작업 — 클라이언트의 작업 목록과 서버의 허용 목록이 맞는지, 요청과 스키마가 형식에 맞는지 확인한다.
// 실제 LLM은 부르지 않는다.
import test from "node:test";
import assert from "node:assert/strict";
import { advance } from "../public/js/sim/clock.js";
import { makeSeed, knownEvents } from "../public/js/sim/world.js";
import {
  TASK_LIMITS, WORLD_RULES_TEXT, directorRequest, chronicleRequest, npcRequest, npcUserTurn, judgeRequest, decreeRequest, decreeTargets, draftRequest,
} from "../public/js/llm/prompts.js";
import { TASK_CAPS } from "../server/tasks.js";
import { fresh } from "./_helpers.mjs";

test("작업 목록: 클라이언트와 서버가 같은 이름을 쓰고, 서버의 출력 상한이 모자라지 않다", () => {
  assert.deepEqual(Object.keys(TASK_LIMITS).sort(), Object.keys(TASK_CAPS).sort(), "llm/tasks/limits.js와 server/tasks.js의 작업 이름이 다르다");
  for (const [name, limit] of Object.entries(TASK_LIMITS)) assert.ok(TASK_CAPS[name] >= limit, `${name}: 서버 상한(${TASK_CAPS[name]})이 클라이언트 요청(${limit})보다 작다`);
});

// 구조화 출력의 스키마는 모든 객체가 닫혀 있어야 하고(additionalProperties: false), 속성이 모두 required여야 한다.
// 스키마가 너무 크면 거절되므로 속성 수에도 상한을 둔다.
function checkSchema(schema, at) {
  let props = 0;
  const visit = (s, where) => {
    if (s.type === "object") {
      assert.equal(s.additionalProperties, false, `${where}: additionalProperties가 false여야 한다`);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), `${where}: 모든 속성이 required여야 한다`);
      for (const [k, v] of Object.entries(s.properties)) {
        props++;
        visit(v, `${where}.${k}`);
      }
    } else if (s.type === "array") visit(s.items, `${where}[]`);
    else assert.ok(["string", "integer", "boolean", "number"].includes(s.type), `${where}: 모르는 타입 ${s.type}`);
  };
  visit(schema, at);
  assert.ok(props <= 40, `${at}: 스키마의 속성이 ${props}개다. 너무 크면 거절될 수 있다`);
}

test("요청: 작업마다 이름·출력 상한·스키마·세계 규칙이 들어 있다", () => {
  fresh(31);
  advance(2 * 1440);
  const ev = knownEvents().find((e) => e.sources.length) ?? knownEvents()[0];
  assert.ok(ev, "요청을 만들어 볼 사건이 있어야 한다");
  const src = ev.sources[0];
  const requests = [
    directorRequest(makeSeed()),
    chronicleRequest([ev]),
    npcRequest(ev, src, [], npcUserTurn({ trust: 40, onsite: true, opening: true })),
    judgeRequest({ ev, headline: "시험 제목", body: "시험 본문이다.", known: {} }),
    judgeRequest({ ev: null, headline: "칼럼", body: "칼럼 본문이다." }),
    decreeRequest({ sentence: "시험 문장이다.", ev, headline: "시험", targets: decreeTargets(ev) }),
    draftRequest({ ev, facts: [{ text: "확인한 사실이다.", st: "confirmed" }] }),
  ];
  const seen = new Set();
  for (const r of requests) {
    seen.add(r.task);
    assert.ok(r.task in TASK_LIMITS, `모르는 작업 이름 ${r.task}`);
    assert.equal(r.maxTokens, TASK_LIMITS[r.task], `${r.task}: 출력 상한은 limits.js의 값을 써야 한다`);
    assert.ok(r.system.includes(WORLD_RULES_TEXT), `${r.task}: 시스템 프롬프트에 세계 규칙이 빠졌다`);
    assert.ok(r.messages.length && r.messages[0].role === "user" && r.messages.at(-1).role === "user", `${r.task}: 메시지는 user로 시작하고 끝나야 한다`);
    assert.ok(r.messages.every((m) => typeof m.content === "string" && m.content.trim()), `${r.task}: 빈 메시지가 있다`);
    assert.equal(typeof r.thinking, "boolean", `${r.task}: thinking은 참·거짓이어야 한다`);
    checkSchema(r.schema, r.task);
  }
  assert.deepEqual([...seen].sort(), Object.keys(TASK_LIMITS).sort(), "limits.js에 있는 작업 가운데 요청 조립이 없는 것이 있다");
});
