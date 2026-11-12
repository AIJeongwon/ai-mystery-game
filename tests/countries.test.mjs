import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as d3 from "d3";
import { feature } from "topojson-client";
import { COUNTRIES, REGIONS } from "../public/js/data/countries.js";

const topo = JSON.parse(fs.readFileSync(new URL("../node_modules/world-atlas/countries-50m.json", import.meta.url), "utf8"));
const fc = feature(topo, topo.objects.countries);
const keyOf = (f) => (f.id != null && f.id !== "" ? String(f.id) : "x:" + f.properties.name);

// 같은 키(036)는 먼저 나온 지형(호주)을 사용
const byKey = new Map();
for (const f of fc.features) if (!byKey.has(keyOf(f))) byKey.set(keyOf(f), f);

test("모든 지형이 데이터 항목으로 연결된다", () => {
  assert.equal(fc.features.length, 241);
  const missing = fc.features.filter((f) => !COUNTRIES[keyOf(f)]).map((f) => `${keyOf(f)} ${f.properties.name}`);
  assert.deepEqual(missing, []);
  const orphans = Object.keys(COUNTRIES).filter((k) => !byKey.has(k));
  assert.deepEqual(orphans, []);
});

test("모든 항목의 기본 필드와 일반 항목의 값 범위", () => {
  for (const [k, c] of Object.entries(COUNTRIES)) {
    assert.ok(c.ko && c.short, `${k} ko/short`);
    assert.ok(c.region in REGIONS, `${k} region`);
    assert.ok(typeof c.pop === "number" && c.pop >= 0, `${k} pop`);
    if (c.minor) continue;
    assert.ok(c.pop > 0, `${k} pop>0`);
    assert.ok(Number.isInteger(c.gdp) && c.gdp >= 1 && c.gdp <= 5, `${k} gdp`);
    assert.ok(c.stab >= 0 && c.stab <= 100, `${k} stab`);
    assert.ok(c.press >= 0 && c.press <= 100, `${k} press`);
    assert.ok(c.net >= 0 && c.net <= 1, `${k} net`);
    assert.ok(typeof c.cap === "string" && c.cap.length > 0, `${k} cap`);
    assert.ok(c.lon >= -180 && c.lon <= 180, `${k} lon`);
    assert.ok(c.lat >= -90 && c.lat <= 90, `${k} lat`);
  }
});

function minVertexDistKm(f, pt) {
  let best = Infinity;
  const walk = (a) => {
    if (typeof a[0] === "number") {
      const d = d3.geoDistance(a, pt);
      if (d < best) best = d;
    } else a.forEach(walk);
  };
  walk(f.geometry.coordinates);
  return best * 6371;
}

test("수도 좌표가 해당 국가 안에 있다 (해안 허용오차 포함)", () => {
  const tolerated = [];
  const failed = [];
  for (const [k, c] of Object.entries(COUNTRIES)) {
    if (c.minor) continue;
    const f = byKey.get(k);
    const pt = [c.lon, c.lat];
    if (d3.geoContains(f, pt)) continue;
    const cen = d3.geoCentroid(f);
    const cenKm = d3.geoDistance(cen, pt) * 6371;
    const vtxKm = minVertexDistKm(f, pt);
    if (cenKm < 2500 && vtxKm < 60) tolerated.push(`${c.ko}(${k}) 꼭짓점 ${vtxKm.toFixed(1)}km`);
    else failed.push(`${c.ko}(${k}) 중심 ${cenKm.toFixed(0)}km 꼭짓점 ${vtxKm.toFixed(1)}km`);
  }
  if (tolerated.length) console.log("허용오차로만 통과:", tolerated.join(", "));
  assert.deepEqual(failed, []);
});
