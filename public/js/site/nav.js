// 걷기 — 충돌과 길 찾기. 좌표는 three.js의 바닥면(x, z)이고, 화면을 모른다.
// 충돌 면은 축에 나란한 상자(col_*)뿐이라고 본다. 블록아웃에서 그렇게 만든다.

const CELL = 0.2;

// boxes: [{ minX, maxX, minZ, maxZ }]
export function makeNav(boxes, radius = 0.24) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX);
    minZ = Math.min(minZ, b.minZ); maxZ = Math.max(maxZ, b.maxZ);
  }
  if (!boxes.length) { minX = minZ = -10; maxX = maxZ = 10; }
  const w = Math.ceil((maxX - minX) / CELL) + 1, h = Math.ceil((maxZ - minZ) / CELL) + 1;
  const nav = { boxes, radius, minX, minZ, w, h, grid: new Uint8Array(w * h), off: new Set() };
  rebuild(nav);
  return nav;
}
const active = (nav) => nav.boxes.filter((b) => !nav.off.has(b.name));
export function setBoxEnabled(nav, name, on) {
  const had = nav.off.has(name);
  if (on) nav.off.delete(name);
  else nav.off.add(name);
  if (had !== !on) rebuild(nav);
}
function rebuild(nav) {
  const { radius: r, grid, w, h } = nav;
  grid.fill(0);
  for (const b of active(nav)) {
    const x0 = Math.max(0, Math.floor((b.minX - r - nav.minX) / CELL)), x1 = Math.min(w - 1, Math.ceil((b.maxX + r - nav.minX) / CELL));
    const z0 = Math.max(0, Math.floor((b.minZ - r - nav.minZ) / CELL)), z1 = Math.min(h - 1, Math.ceil((b.maxZ + r - nav.minZ) / CELL));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const px = nav.minX + x * CELL, pz = nav.minZ + z * CELL;
      if (px > b.minX - r && px < b.maxX + r && pz > b.minZ - r && pz < b.maxZ + r) grid[z * w + x] = 1;
    }
  }
}

export function blocked(nav, x, z) {
  const r = nav.radius;
  for (const b of active(nav)) if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
  return false;
}

// 한 걸음: 막히면 축별로 미끄러진다. 돌려주는 값은 실제로 선 자리.
export function step(nav, x, z, dx, dz) {
  if (!blocked(nav, x + dx, z + dz)) return [x + dx, z + dz];
  if (dx && !blocked(nav, x + dx, z)) return [x + dx, z];
  if (dz && !blocked(nav, x, z + dz)) return [x, z + dz];
  return [x, z];
}

const cellOf = (nav, x, z) => [Math.round((x - nav.minX) / CELL), Math.round((z - nav.minZ) / CELL)];
const free = (nav, cx, cz) => cx >= 0 && cz >= 0 && cx < nav.w && cz < nav.h && !nav.grid[cz * nav.w + cx];

// 가장 가까운 빈 칸 (목표가 가구 안일 때)
function nearestFree(nav, cx, cz, limit = 12) {
  if (free(nav, cx, cz)) return [cx, cz];
  for (let d = 1; d <= limit; d++) {
    let best = null, bestD = Infinity;
    for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== d || !free(nav, cx + dx, cz + dz)) continue;
      const dd = dx * dx + dz * dz;
      if (dd < bestD) { bestD = dd; best = [cx + dx, cz + dz]; }
    }
    if (best) return best;
  }
  return null;
}

function lineFree(nav, ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL / 2));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (blocked(nav, ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

// A* (8방향). 돌려주는 값: [[x, z], ...] 또는 null
export function findPath(nav, sx, sz, tx, tz) {
  const s = nearestFree(nav, ...cellOf(nav, sx, sz)), t = nearestFree(nav, ...cellOf(nav, tx, tz));
  if (!s || !t) return null;
  const { w, h } = nav, N = w * h;
  const si = s[1] * w + s[0], ti = t[1] * w + t[0];
  const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const open = [si];
  const f = new Float32Array(N).fill(Infinity);
  const hx = (i) => Math.hypot((i % w) - t[0], Math.floor(i / w) - t[1]);
  g[si] = 0; f[si] = hx(si);
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === ti) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w, cz = Math.floor(cur / w);
    for (const [dx, dz, cost] of DIRS) {
      const nx = cx + dx, nz = cz + dz;
      if (!free(nav, nx, nz)) continue;
      if (dx && dz && (!free(nav, cx + dx, cz) || !free(nav, cx, cz + dz))) continue; // 모서리를 스치지 않는다
      const ni = nz * w + nx, ng = g[cur] + cost;
      if (ng < g[ni]) { g[ni] = ng; f[ni] = ng + hx(ni); from[ni] = cur; open.push(ni); }
    }
  }
  if (from[ti] < 0 && ti !== si) return null;
  const cells = [];
  for (let i = ti; i >= 0; i = from[i]) { cells.push(i); if (i === si) break; }
  cells.reverse();
  const pts = cells.map((i) => [nav.minX + (i % w) * CELL, nav.minZ + Math.floor(i / w) * CELL]);
  // 곧게 펴기: 보이는 데까지 건너뛴다
  const out = [[sx, sz]];
  let a = 0;
  while (a < pts.length - 1) {
    let b = pts.length - 1;
    while (b > a + 1 && !lineFree(nav, pts[a][0], pts[a][1], pts[b][0], pts[b][1])) b--;
    out.push(pts[b]);
    a = b;
  }
  return out;
}
