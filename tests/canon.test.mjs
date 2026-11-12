// 記定 — 문장이 세계를 바꾸고, 거두면 되돌아가고, 범위를 넘으면 찍히지 않고, 기간이 지나면 바랜다
import test from "node:test";
import assert from "node:assert/strict";
import { advance } from "../public/js/sim/clock.js";
import { cd } from "../public/js/sim/world.js";
import { resolveDecree, enact, retract, canonHourly } from "../public/js/sim/canon.js";
import { commonSense } from "../public/js/sim/lore.js";
import { decreeTargets } from "../public/js/llm/prompts.js";
import { STAMP, INK_CAP } from "../public/js/data/progress.js";
import { fresh } from "./_helpers.mjs";

test("기정: 문장이 세계 수치를 바꾸고, 거두면 되돌아간다", () => {
  const g = fresh(13);
  g.canon.lv.scope = 2;
  g.canon.lv.power = 3;
  g.canon.ink = 60;
  const before = cd("410").appr;
  const targets = decreeTargets(null);
  const data = { belief: "대한민국 정부의 지지율이 크게 올랐다", valid: true, scope: "country", reaction: "모두가 그렇게 안다.", effects: [{ target: "country:410", attr: "appr", dir: "up", mag: 3 }] };
  const ap = resolveDecree("대한민국 정부의 지지율이 크게 올랐다.", data, targets, null);
  assert.ok(ap.ok, `감정이 통과해야 한다: ${ap.problems.join(" / ")}`);
  assert.equal(ap.scopeIdx, 1);
  const cn = enact(ap, { articleId: "x", ev: null, title: "시험" });
  assert.ok(cd("410").appr > before, "지지율이 올라야 한다");
  assert.ok(g.canon.ink < 60, "인주가 소모돼야 한다");
  assert.ok(commonSense("410", null).includes(cn.belief), "한국의 상식에 들어가야 한다");
  assert.ok(!commonSense("840", null).includes(cn.belief), "다른 나라의 상식에는 없어야 한다");
  retract(cn);
  assert.ok(Math.abs(cd("410").appr - before) < 0.001, "거두면 원래대로");
  assert.equal(cn.active, false);
});

test("기정: 각인 범위를 넘는 문장은 찍히지 않고, 유지 기간이 지나면 바랜다", () => {
  const g = fresh(17);
  g.canon.ink = 60;
  const targets = decreeTargets(null);
  const far = resolveDecree("세계가 뒤집혔다.", { belief: "x", valid: true, scope: "world", reaction: "", effects: [{ target: "country:840", attr: "stab", dir: "down", mag: 2 }] }, targets, null);
  assert.equal(far.ok, false, "범위 1단 도장으로 세계급 문장은 찍을 수 없다");
  const bad = resolveDecree("?", { belief: "?", valid: false, scope: "local", effects: [] }, targets, null);
  assert.equal(bad.ok, false);
  // 유지 기간
  g.canon.lv.scope = 2;
  const ap = resolveDecree("한국 경기가 살아났다.", { belief: "한국 경기가 살아났다", valid: true, scope: "country", reaction: "", effects: [{ target: "country:410", attr: "econ", dir: "up", mag: 1 }] }, targets, null);
  assert.ok(ap.ok, ap.problems.join(" / "));
  const cn = enact(ap, { articleId: "y", ev: null, title: "시험" });
  assert.ok(cn.expires > g.time.min);
  advance(cn.expires - g.time.min + 90);
  canonHourly();
  assert.equal(cn.active, false, "기간이 지나면 문장이 바랜다");
  assert.equal(cn.ended.how, "fade");
});

// 알려진 문제(docs/roadmap/known-issues.md의 A-1): 인주 상한이 낮아 각 각인의 마지막 단계를 살 수 없다.
// 고치면 todo 표시를 떼어 이 시험이 계속 지키게 한다.
test("각인: 인주 상한 안에서 모든 단계를 살 수 있다", { todo: "알려진 문제 A-1 — 인주 상한이 마지막 단계 값보다 낮다" }, () => {
  const lv = { scope: 1, power: 1, hold: 1, slots: 1, veil: 1 };
  for (;;) {
    const cap = INK_CAP(lv);
    const next = Object.keys(lv).filter((k) => lv[k] < STAMP[k].max && STAMP[k].cost[lv[k]] <= cap).sort((a, b) => STAMP[a].cost[lv[a]] - STAMP[b].cost[lv[b]])[0];
    if (!next) break;
    lv[next]++;
  }
  const stuck = Object.keys(lv).filter((k) => lv[k] < STAMP[k].max).map((k) => `${STAMP[k].name} ${lv[k]}→${lv[k] + 1}단 (인주 ${STAMP[k].cost[lv[k]]}, 상한 ${INK_CAP(lv)})`);
  assert.deepEqual(stuck, []);
});
