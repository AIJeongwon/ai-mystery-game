// 취재와 발행 — 취재 → 발행 → 조회수·수익, 증언의 규칙, 이동, 저장 왕복
import test from "node:test";
import assert from "node:assert/strict";
import { setG, G } from "../public/js/core/store.js";
import { advance } from "../public/js/sim/clock.js";
import { initDirector } from "../public/js/sim/director.js";
import { deskResearch, fieldWork, publish, notes, travelInfo, travelTo, tierCheck } from "../public/js/sim/press.js";
import { knownEvents, spawnScripted } from "../public/js/sim/world.js";
import { fresh } from "./_helpers.mjs";

test("취재 → 발행 → 조회수·수익이 들어온다", async () => {
  const g = fresh(11);
  advance(1440);
  const ev = knownEvents().find((e) => e.country === "410" && e.stage < 4) || knownEvents()[0];
  assert.ok(ev, "취재할 사건이 있어야 한다");
  deskResearch(ev);
  if (ev.country === "410") fieldWork(ev);
  const nb = notes(ev.id);
  const facts = ev.facts.filter((f) => nb[f.id]?.st === "confirmed");
  assert.ok(facts.length >= 1, "확인된 사실이 있어야 한다");
  const cash0 = g.outlet.cash;
  const art = await publish({ ev, headline: ev.title, body: facts.map((f) => f.text).join(" ") });
  assert.ok(art && art.plan > 0, "기사가 발행되고 예상 조회수가 있어야 한다");
  assert.ok(art.scores.Q > 0 && art.scores.Q <= 10);
  advance(600);
  assert.ok(g.outlet.articles[0].done > 0, "조회수가 풀려야 한다");
  assert.ok(g.outlet.cash !== cash0, "수익이 장부에 반영돼야 한다");
});

test("각본 사건: 증언(talk)은 현장 취재로 얻어지지 않는다", () => {
  fresh(23);
  const ev = spawnScripted({
    id: "t_ev", type: "housing", country: "410", city: "서울", lon: 127, lat: 37.5, sig: 1, start: 1, fixed: { hold: true },
    nar: {
      title: "시험 사건", summary: "시험", truth: "시험",
      facts: [{ id: "a", depth: 0, text: "공개된 사실이다." }, { id: "b", depth: 1, text: "현장에서 보이는 사실이다." }, { id: "c", depth: 2, cond: "물으면 말한다", ev: "e4", text: "사람에게 들어야 하는 증언이다." }],
      sources: [{ id: "s", name: "증인", role: "증인", stance: "friendly", persona: "", knows: ["c"] }],
    },
  });
  for (let i = 0; i < 6; i++) {
    deskResearch(ev);
    fieldWork(ev);
  }
  const nb = notes(ev.id);
  assert.ok(nb.a && nb.b, "공개·현장 사실은 얻는다");
  assert.equal(nb.c, undefined, "증언은 인터뷰로만 얻는다");
});

test("이동과 저장 왕복", () => {
  const g = fresh(29);
  g.outlet.cash = 50_000_000;
  const info = travelInfo("756");
  assert.ok(info.km > 8000 && info.mins > 600 && info.cost > 500_000);
  const t0 = g.time.min;
  assert.ok(travelTo("756"));
  assert.equal(g.player.loc, "756");
  assert.equal(g.time.min, t0 + info.mins);
  const copy = JSON.parse(JSON.stringify(G));
  setG(copy);
  initDirector();
  advance(1440);
  assert.equal(copy.player.loc, "756");
  assert.ok(tierCheck());
});
