import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./_helpers.mjs";
import { raiseSkill } from "../public/js/sim/press.js";

test("감식안은 기존 단계를 보존하고 새 역량 점수를 소모하지 않는다", () => {
  const g = fresh();
  g.player.pts = 3;
  g.player.skills.sense = 2;
  assert.equal(raiseSkill("sense"), false);
  assert.equal(g.player.pts, 3);
  assert.equal(g.player.skills.sense, 2);
  assert.equal(raiseSkill("research"), true);
  assert.equal(g.player.pts, 2);
  assert.equal(g.player.skills.research, 1);
});
