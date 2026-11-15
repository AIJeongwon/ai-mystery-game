// 보상 수입과 기타 지출이 현금 및 일일 장부에 같은 방향으로 반영되는지 검사한다.
import test from "node:test";
import assert from "node:assert/strict";
import { earn, pay } from "../public/js/sim/press/money.js";
import { dailySettlement } from "../public/js/sim/press/settlement.js";
import { fresh } from "./_helpers.mjs";

test("기타 수입과 지출을 함께 처리해도 장부 순이익은 현금 변동과 같다", () => {
  const game = fresh(67);
  const initialCash = game.outlet.cash;
  earn(100_000);
  pay(30_000);
  const record = dailySettlement();
  assert.equal(record.otherIncome, 100_000);
  assert.equal(record.etc, 30_000);
  assert.equal(record.income, record.ad + record.sub + record.plat + 100_000);
  assert.equal(record.net, game.outlet.cash - initialCash);
  assert.equal(game.outlet.today.otherIncome, 0);
  assert.equal(game.outlet.today.etc, 0);
});

test("기타 수입 항목이 없는 기존 장부도 정산과 보상 지급을 계속할 수 있다", () => {
  const game = fresh(71);
  delete game.outlet.today.otherIncome;
  const cash = game.outlet.cash;
  const record = dailySettlement();
  assert.equal(record.net, game.outlet.cash - cash);
  delete game.outlet.today.otherIncome;
  earn(50_000, "etc");
  const previousCash = game.outlet.cash - 50_000;
  const nextRecord = dailySettlement();
  assert.equal(nextRecord.otherIncome, 50_000);
  assert.equal(nextRecord.net, game.outlet.cash - previousCash);
});
