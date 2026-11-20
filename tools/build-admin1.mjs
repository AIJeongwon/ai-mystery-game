// 국가 지도(시·도 단위)의 경계 자료를 만든다.
//   node tools/build-admin1.mjs
// 원본: Natural Earth 10m admin-1 (퍼블릭 도메인). 저장소에 올리지 않는 tools/_raw/geo/ 에 둔다.
//   https://github.com/nvkelso/natural-earth-vector  →  geojson/ne_10m_admin_1_states_provinces.geojson
// 결과: public/assets/geo/admin1-<나라 번호>.json  (나라 번호는 세계지도와 같은 ISO 3166-1 숫자)
//   { country, scale, regions: [{ id, ko, full, at: [경도, 위도], rings: [[x0, y0, dx, dy, ...], ...] }] }
//   좌표는 scale을 곱한 정수이고, 고리마다 첫 점 뒤로는 앞 점과의 차이만 적는다. 구멍도 고리로 함께 들어 있다(짝홀 규칙으로 칠한다).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "tools", "_raw", "geo", "ne_10m_admin_1_states_provinces.geojson");
const OUT = path.join(ROOT, "public", "assets", "geo");
const SCALE = 1000;

// 나라마다: 세계지도의 번호, 그리고 지도에 적을 짧은 이름. 한국은 줄여 부르는 이름으로 적는다(행정구역의 정식 이름은 바뀌어도 줄임말은 그대로다).
const COUNTRIES = {
  KOR: {
    id: "410",
    short: {
      "KR-11": "서울", "KR-26": "부산", "KR-27": "대구", "KR-28": "인천", "KR-29": "광주", "KR-30": "대전", "KR-31": "울산", "KR-50": "세종",
      "KR-41": "경기", "KR-42": "강원", "KR-43": "충북", "KR-44": "충남", "KR-45": "전북", "KR-46": "전남", "KR-47": "경북", "KR-48": "경남", "KR-49": "제주",
    },
    // 원본에 옛 이름으로 적힌 곳 (강원 2023년, 전북 2024년에 이름이 바뀌었다)
    full: { "KR-42": "강원특별자치도", "KR-45": "전북특별자치도" },
  },
  // 일본은 '현'과 '부'를 떼고 적는다 (아오모리현 → 아오모리, 오사카부 → 오사카, 도쿄도 → 도쿄). 홋카이도는 그대로 둔다.
  JPN: { id: "392", short: {}, trim: /(?<=.)[현부]$|(?<=도쿄)도$/ },
};

// 다각형 하나는 [바깥 고리, 구멍, 구멍, ...] 이다
const areaOf = (ring) => Math.abs(ring.reduce((s, [x, y], i) => s + (i ? ring[i - 1][0] * y - x * ring[i - 1][1] : 0), 0)) / 2;
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPoly = (poly, x, y) => inRing(poly[0], x, y) && !poly.slice(1).some((hole) => inRing(hole, x, y));
// 다각형 안에서 테두리와 가장 먼 점을 격자로 찾는다 (오목하거나 구멍이 있어도 안쪽에 떨어진다)
function middleOf(poly) {
  const xs = poly[0].map((q) => q[0]), ys = poly[0].map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const squash = Math.cos(((y0 + y1) / 2) * (Math.PI / 180)); // 경도 1도는 위도 1도보다 짧다
  const N = 36;
  let best = [(x0 + x1) / 2, (y0 + y1) / 2], far = -1;
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const x = x0 + ((x1 - x0) * i) / N, y = y0 + ((y1 - y0) * j) / N;
      if (!inPoly(poly, x, y)) continue;
      let near = Infinity;
      for (const ring of poly) for (const [qx, qy] of ring) near = Math.min(near, ((qx - x) * squash) ** 2 + (qy - y) ** 2);
      if (near > far) {
        far = near;
        best = [x, y];
      }
    }
  }
  return best;
}

const fc = JSON.parse(fs.readFileSync(SRC, "utf8"));
fs.mkdirSync(OUT, { recursive: true });
for (const [a3, def] of Object.entries(COUNTRIES)) {
  const regions = [];
  for (const f of fc.features) {
    const p = f.properties;
    if (p.adm0_a3 !== a3) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const rings = [];
    for (const poly of polys) {
      for (const ring of poly) {
        const flat = [];
        let px = 0, py = 0;
        for (const [lon, lat] of ring) {
          const x = Math.round(lon * SCALE), y = Math.round(lat * SCALE);
          if (flat.length && x === px && y === py) continue; // 반올림으로 겹친 점
          flat.push(flat.length ? x - px : x, flat.length ? y - py : y);
          px = x;
          py = y;
        }
        if (flat.length >= 8) rings.push(flat); // 점 셋이 안 되는 부스러기 섬은 버린다
      }
    }
    const full = def.full?.[p.iso_3166_2] || p.name_ko || p.name;
    // 이름표의 자리: 원본이 준 점이 가장 큰 땅덩이 안에 있으면 그대로 쓰고, 아니면(먼 섬에 찍혀 있으면) 그 땅덩이의 한가운데를 찾는다
    const main = polys.reduce((a, b) => (areaOf(b[0]) > areaOf(a[0]) ? b : a));
    const at = inPoly(main, p.longitude, p.latitude) ? [p.longitude, p.latitude] : middleOf(main);
    regions.push({ id: p.iso_3166_2, ko: def.short[p.iso_3166_2] || (def.trim ? full.replace(def.trim, "") : full), full, at: at.map((v) => Math.round(v * 1000) / 1000), rings });
  }
  regions.sort((a, b) => a.id.localeCompare(b.id));
  const file = path.join(OUT, `admin1-${def.id}.json`);
  fs.writeFileSync(file, JSON.stringify({ source: "Natural Earth 10m admin-1 (public domain)", country: def.id, scale: SCALE, regions }));
  console.log(a3, regions.length, "regions,", regions.reduce((n, r) => n + r.rings.reduce((m, g) => m + g.length / 2, 0), 0), "points,", Math.round(fs.statSync(file).size / 1024), "KB");
}
