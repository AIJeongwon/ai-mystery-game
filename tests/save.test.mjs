// 가져오기 실패 시 기존 저장을 지키고, 행동 완료 상태가 자동저장되는지 확인한다.
import test from "node:test";
import assert from "node:assert/strict";
import { setG, newGame, saveGame, loadGame, importSave, exportSave, peekSave } from "../public/js/core/store.js";
import { advance } from "../public/js/sim/clock.js";
import { travelTo, travelInfo, publish } from "../public/js/sim/press.js";
import { fresh } from "./_helpers.mjs";

function useStorage(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  const writes = [];
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      values.set(key, String(value));
      writes.push(String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  });
  return { values, writes };
}

test("검증을 통과하지 못한 세이브는 기존 기록을 덮어쓰지 않는다", (t) => {
  const { values } = useStorage(t);
  const game = fresh(41);
  saveGame();
  const original = exportSave();
  const invalid = ["{", "null", "[]"];
  for (const key of ["time", "campaign", "rng", "casefile"]) {
    const copy = JSON.parse(original);
    delete copy[key];
    invalid.push(JSON.stringify(copy));
  }
  for (const patch of [
    { time: { ...game.time, min: "잘못된 시간" } },
    { outlet: { ...game.outlet, articles: null } },
    { outlet: { ...game.outlet, today: "잘못된 장부" } },
    { v: game.v + 1 },
  ]) invalid.push(JSON.stringify({ ...game, ...patch }));
  for (const text of invalid) {
    assert.throws(() => importSave(text), /세이브 형식/);
    assert.equal([...values.values()][0], original, "검증 실패 후에도 기존 저장을 보존한다");
    assert.equal(loadGame().meta.reporter, game.meta.reporter);
  }
});

test("이미 저장된 파일이 손상됐으면 이어하기와 미리보기에서 읽기를 거부한다", (t) => {
  const { values } = useStorage(t);
  setG(newGame({ reporter: "기자", outlet: "신문", seed: 1 }));
  saveGame();
  const key = [...values.keys()][0];
  for (const text of ["{", "null", JSON.stringify({ v: 1, world: {}, outlet: {} })]) {
    values.set(key, text);
    assert.equal(loadGame(), null);
    assert.equal(peekSave(), null);
    assert.equal(values.get(key), text);
  }
});

test("기타 수입 항목이 없는 기존 세이브와 플레이 중 추가된 필드를 보존한다", (t) => {
  useStorage(t);
  const game = fresh(43);
  delete game.outlet.today.otherIncome;
  game.time.speed = 3;
  game.campaign.vars.example = "기존 캠페인 기록";
  game.player.travel = { from: "410", to: "392", depart: 0, arrive: 200 };
  const imported = importSave(JSON.stringify(game));
  assert.equal(imported.outlet.today.otherIncome, 0);
  const loaded = loadGame();
  assert.equal(loaded.time.speed, 0);
  assert.equal(loaded.campaign.vars.example, "기존 캠페인 기록");
  assert.deepEqual(loaded.player.travel, game.player.travel);
});

test("저장 공간 오류로 파일 가져오기가 실패해도 기존 기록을 보존한다", (t) => {
  const { values } = useStorage(t);
  fresh(47);
  saveGame();
  const original = [...values.values()][0];
  t.mock.method(localStorage, "setItem", () => { throw new Error("저장 공간 부족"); });
  const replacement = newGame({ reporter: "다른 기자", outlet: "다른 신문", seed: 2 });
  assert.throws(() => importSave(JSON.stringify(replacement)), /저장 공간 부족/);
  assert.equal([...values.values()][0], original);
});

test("자정을 넘긴 출장은 도착 위치와 비용을 함께 한 번 자동저장한다", (t) => {
  const { writes } = useStorage(t);
  const game = fresh(53);
  game.outlet.cash = 50_000_000;
  advance(950);
  const info = travelInfo("032");
  const start = game.time.min;
  assert.ok(info.mins > 1440, "여러 자정을 넘는 출장을 검사한다");
  assert.equal(travelTo("032"), true);
  assert.equal(writes.length, 1, "이동 중간 상태를 저장하지 않는다");
  const saved = loadGame();
  assert.equal(saved.time.min, start + info.mins);
  assert.equal(saved.player.loc, "032");
  assert.equal(saved.player.travel, null);
  assert.equal(saved.outlet.cash, game.outlet.cash);
  assert.deepEqual(saved.outlet.today, game.outlet.today);
});

test("자정을 넘긴 발행은 기사와 경험치까지 반영한 뒤 자동저장한다", async (t) => {
  const { writes } = useStorage(t);
  const game = fresh(59);
  advance(950);
  const article = await publish({ ev: null, headline: "시험 기사 제목입니다", body: "기사 발행이 끝나면 결과를 온전히 저장합니다. ".repeat(5) });
  assert.ok(article);
  assert.equal(writes.length, 1);
  const saved = loadGame();
  assert.equal(saved.time.min, game.time.min);
  assert.equal(saved.outlet.articles.length, game.outlet.articles.length);
  assert.ok(saved.outlet.articles.some((entry) => entry.id === article.id));
  assert.equal(saved.outlet.totals.articles, game.outlet.totals.articles);
  assert.equal(saved.player.xp, game.player.xp);
});

test("일반 시간 진행은 자정마다 자동저장하고, 같은 날 행동은 저장을 추가하지 않는다", (t) => {
  const { writes } = useStorage(t);
  fresh(61);
  travelTo("392");
  assert.equal(writes.length, 0);
  advance(3 * 1440);
  assert.equal(writes.length, 3);
  assert.ok(writes.every((text) => JSON.parse(text).time.min % 1440 === 960));
});
