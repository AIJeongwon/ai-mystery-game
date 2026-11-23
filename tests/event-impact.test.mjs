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
// 결말 문구와 수치의 의미가 어긋나지 않도록 기대하는 변화량을 명시한다.
const EXPECTED = {
  launch: { attn: [4.375, 1.575], press: [0, 0] },
  summit: { attn: [5.25, 1.89], press: [0, 0] },
  aid: { attn: [5.25, 1.89], press: [0, 0] },
  festival: { attn: [3.5, 1.26], press: [0, 0] },
  sports: { attn: [3.5, 1.26], press: [0, 0] },
  trend: { attn: [2.625, 0.945], press: [0, 0] },
  media_deal: { attn: [0, 0], press: [-1.875, 0] },
  press_freedom: { attn: [0, 0], press: [3.75, -1.35] },
};
for (const [type, expected] of Object.entries(EXPECTED)) {
  for (const hi of [true, false]) {
    test(`${type}: ${hi ? "높은" : "낮은"} 결말에서 관심도와 언론 자유를 반영한다`, () => {
      fresh();
      const ev = scene(type), d = cd("410");
      d.attn = 40;
      d.press = 70;
      const initialPress = COUNTRIES["410"].press;
      closeEvent(ev, { hi });
      const idx = hi ? 0 : 1;
      assert.ok(Math.abs(d.attn - (40 + expected.attn[idx])) < 1e-9);
      assert.ok(Math.abs(pressFreedom("410") - (70 + expected.press[idx])) < 1e-9);
      assert.equal(COUNTRIES["410"].press, initialPress, "나라의 공통 초기값은 수정하지 않는다");
    });
  }
}

test("기자 석방은 언론 자유를 회복시키고 기소보다 불리해지지 않는다", () => {
  const finish = (pressure) => {
    fresh();
    cd("410").press = 70;
    const before = cd("410").stab, ev = scene("press_freedom");
    ev.pressure = pressure;
    closeEvent(ev);
    return { text: ev.outcome.text, press: pressFreedom("410"), stab: cd("410").stab, before };
  };
  const released = finish(100), charged = finish(0);
  assert.equal(released.text, "기자가 석방됐다");
  assert.equal(charged.text, "기자는 기소됐다");
  assert.ok(released.press > 70 && charged.press < 70);
  assert.ok(released.press > charged.press);
  assert.equal(released.stab, released.before - 1, "결말별로 덮어쓰지 않은 공통 영향은 유지한다");
});

test("언론사 인수는 승인될 때 언론 자유를 낮추고, 좌초되면 그대로 유지한다", () => {
  for (const [pressure, text, expected] of [[100, "인수가 승인됐다", 68.125], [0, "인수는 기자들의 반발로 좌초됐다", 70]]) {
    fresh();
    cd("410").press = 70;
    const ev = scene("media_deal");
    ev.pressure = pressure;
    closeEvent(ev);
    assert.equal(ev.outcome.text, text);
    assert.equal(pressFreedom("410"), expected);
  }
});

test("관심도와 언론 자유는 0~100의 범위를 벗어나지 않는다", () => {
  fresh();
  cd("410").attn = 99.9;
  closeEvent(scene("festival"), { hi: true });
  assert.equal(cd("410").attn, 100);
  cd("410").press = 99.9;
  closeEvent(scene("press_freedom"), { hi: true });
  assert.equal(pressFreedom("410"), 100);
  cd("410").press = 0.1;
  closeEvent(scene("press_freedom"), { hi: false });
  assert.equal(pressFreedom("410"), 0);
});

function useStorage(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), values = new Map();
  let writes = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    get length() { return values.size; },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => { writes++; values.set(k, String(v)); },
    removeItem: (k) => values.delete(k),
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "localStorage", previous); else delete globalThis.localStorage; });
  return { writes: () => writes };
}

test("언론 자유 변경은 저장 왕복 후 유지되고 기존 저장은 초기값으로 읽는다", (t) => {
  useStorage(t);
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
  const store = useStorage(t);
  const g = fresh();
  for (const value of ["80", null, -1, 101]) {
    g.world.c["410"].press = value;
    assert.throws(() => importSave(JSON.stringify(g)), /세이브 형식/);
  }
  assert.equal(store.writes(), 0);
});

test("사건 연출 프롬프트와 발생 가중치는 변경된 언론 자유를 읽는다", () => {
  fresh();
  const before = EVENT_TYPES.press_freedom.w({ ...COUNTRIES["410"], ...cd("410") });
  closeEvent(scene("press_freedom"), { hi: true });
  const current = pressFreedom("410");
  const after = EVENT_TYPES.press_freedom.w({ ...COUNTRIES["410"], ...cd("410") });
  assert.ok(after < before, "언론 자유가 회복되면 침해 사건의 발생 가중치가 낮아진다");
  const req = directorRequest(makeSeed({ type: "press_freedom", country: "410" }));
  assert.ok(req.messages[0].content.includes(`언론 자유 ${Math.round(current)}/100`));
});
