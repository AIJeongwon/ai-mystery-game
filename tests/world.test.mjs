// 세계 — 브라우저·LLM 없이 세계가 돌아가는지 확인한다.
import test from "node:test";
import assert from "node:assert/strict";
import { advance } from "../public/js/sim/clock.js";
import { activeEvents, knownEvents } from "../public/js/sim/world.js";
import { fresh } from "./_helpers.mjs";

test("세계가 사흘 동안 오류 없이 돌아가고 사건이 생긴다", () => {
  const g = fresh();
  advance(3 * 1440);
  assert.ok(Object.keys(g.world.events).length >= 8, "사건이 충분히 생겨야 한다");
  assert.ok(activeEvents().length >= 5);
  assert.ok(knownEvents().length >= 3, "플레이어가 포착한 사건이 있어야 한다");
  assert.ok(g.world.schedule.length >= 5, "일정표가 채워져야 한다");
  assert.ok(g.world.feed.length > 0);
  assert.equal(g.outlet.ledger.length, 3, "하루 정산이 세 번 있어야 한다");
  assert.ok(Object.values(g.world.events).some((e) => e.devs?.length), "국면이 넘어간 사건에는 경과가 붙어야 한다");
  for (const d of Object.values(g.world.c)) {
    assert.ok(d.stab >= 0 && d.stab <= 100 && Number.isFinite(d.attn));
  }
});
