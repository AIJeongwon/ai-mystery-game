// 툴팁의 실제 문자열 생성과 규칙 인터뷰를 검사한다. 화면 배치는 브라우저에서 별도로 확인한다.
import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./_helpers.mjs";
import { COUNTRIES } from "../public/js/data/countries.js";
import { spawnScripted } from "../public/js/sim/world.js";
import { BOX } from "../public/js/campaign/ch1/scenes.js";
globalThis.window ??= globalThis;
globalThis.addEventListener ??= () => {};
globalThis.localStorage ??= { getItem: () => null };
globalThis.d3 = await import("d3");
const { evTip, countryTip, mapState } = await import("../public/js/ui/map.js");
const { ruleReply } = await import("../public/js/ui/interview.js");

test("지도 제목·도시명에 든 태그와 특수문자를 HTML로 해석하지 않는다", () => {
  const html = evTip({ country: "410", cat: "med", stage: 2, title: '<b>검증 & "제목"</b>', city: "<img src=x onerror=alert(1)>" });
  assert.ok(html.startsWith("<b>&lt;b&gt;검증 &amp; &quot;제목&quot;&lt;/b&gt;</b>"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.equal(html.includes("<img"), false);
  assert.ok(html.includes("<em style="));
});

test("나라 툴팁에서도 사용자가 정한 매체명의 태그를 이스케이프한다", () => {
  const g = fresh();
  g.meta.outlet = "<img src=x>";
  g.world.c["410"].my = 0.9;
  mapState.mode = "share";
  const html = countryTip({ key: "410", c: COUNTRIES["410"] });
  assert.ok(html.includes("&lt;img src=x&gt;"));
  assert.equal(html.includes("<img"), false);
});

test("규칙 인터뷰는 관련 없는 근거로 핵심 증언을 공개하지 않는다", () => {
  fresh();
  const ev = spawnScripted(BOX), src = ev.sources[0];
  const sess = { trust: 0, said: new Set(["b4", "b0"]), shown: ["b4"], turn: 0 };
  assert.deepEqual(ruleReply(ev, src, sess, "오늘 날씨가 어떤가요?").revealed, []);
  assert.deepEqual(ruleReply(ev, src, sess, "모로 보고서가 언제 어떻게 조작으로 밝혀졌나요?").revealed, ["b3"]);
});
