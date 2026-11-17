// 실제 사건 종결과 저장·프롬프트에 미반영 효과가 연결되는지 확인한다. API는 호출하지 않는다.
import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./_helpers.mjs";
import { COUNTRIES } from "../public/js/data/countries.js";
import { EVENT_TYPES } from "../public/js/data/templates.js";
import { spawnScripted, closeEvent, cd, pressFreedom, makeSeed } from "../public/js/sim/world.js";
import { importSave, setG } from "../public/js/core/store.js";
import { directorRequest } from "../public/js/llm/prompts.js";

const scene = (type) => spawnScripted({
  id: "impact_test", type, country: "410", city: "서울", lon: 126.98, lat: 37.57,
  nar: { title: "영향 검증", summary: "영향 검증용 사건", facts: [], sources: [] },
});
const clamp = (n) => Math.max(0, Math.min(100, n));
for (const type of ["launch", "summit", "aid", "festival", "sports", "trend", "media_deal", "press_freedom"]) {
  for (const hi of [true, false]) {
    test(`${type}: ${hi ? "높은" : "낮은"} 결말에서 관심도와 언론 자유를 반영한다`, () => {
      fresh();
      const ev = scene(type), d = cd("410");
      const before = { attn: d.attn, press: pressFreedom("410") };
      closeEvent(ev, { hi });
      const factor = hi ? 1.25 : 0.45, impact = EVENT_TYPES[type].impact;
      assert.equal(d.attn, clamp(before.attn + (impact.attn || 0) * 7 * factor));
      assert.equal(pressFreedom("410"), clamp(before.press + (impact.press || 0) * 5 * factor));
      assert.equal(COUNTRIES["410"].press, before.press, "나라의 공통 초기값은 수정하지 않는다");
    });
  }
}

test("관심도는 상한을, 언론 자유는 하한을 넘지 않는다", () => {
  fresh();
  cd("410").attn = 99.9;
  closeEvent(scene("festival"), { hi: true });
  assert.equal(cd("410").attn, 100);
  cd("410").press = 0.1;
  closeEvent(scene("press_freedom"), { hi: true });
  assert.equal(pressFreedom("410"), 0);
});

test("언론 자유 변경은 저장 왕복 후 유지되고 기존 저장은 초기값으로 읽는다", (t) => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = { setItem() {} };
  t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
  const g = fresh(), initial = pressFreedom("410");
  closeEvent(scene("press_freedom"), { hi: true });
  const changed = pressFreedom("410");
  assert.notEqual(changed, initial);
  setG(importSave(JSON.stringify(g)));
  assert.equal(pressFreedom("410"), changed);
  delete g.world.c["410"].press;
  setG(importSave(JSON.stringify(g)));
  assert.equal(pressFreedom("410"), initial);
});

test("저장에 잘못된 언론 자유 값이 있으면 기존 기록을 덮어쓰지 않는다", (t) => {
  const previous = globalThis.localStorage;
  let writes = 0;
  globalThis.localStorage = { setItem() { writes++; } };
  t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
  const g = fresh();
  for (const value of ["80", null, -1, 101]) {
    g.world.c["410"].press = value;
    assert.throws(() => importSave(JSON.stringify(g)), /세이브 형식/);
  }
  assert.equal(writes, 0);
});

test("사건 연출 프롬프트와 발생 가중치는 변경된 언론 자유를 읽는다", () => {
  fresh();
  const before = EVENT_TYPES.press_freedom.w({ ...COUNTRIES["410"], ...cd("410") });
  closeEvent(scene("press_freedom"), { hi: true });
  const current = pressFreedom("410");
  const after = EVENT_TYPES.press_freedom.w({ ...COUNTRIES["410"], ...cd("410") });
  assert.ok(after > before);
  const req = directorRequest(makeSeed({ type: "press_freedom", country: "410" }));
  assert.ok(req.messages[0].content.includes(`언론 자유 ${Math.round(current)}/100`));
});
