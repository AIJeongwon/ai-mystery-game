// 세계지도 — Canvas 2D. 국가 경로는 한 번만 투영해 Path2D로 보관하고, 이동·확대는 변환만 바꾼다.
import { G } from "../core/store.js";
import { emit, on } from "../core/bus.js";
import { clamp, hash01, fmtPct } from "../core/util.js";
import { COUNTRIES } from "../data/countries.js";
import { CATS, OUTLETS, RIVAL_IDS, HOME } from "../data/world.js";
import { STAGES } from "../data/templates.js";
import { cd, knownEvents, presence, audience } from "../sim/world.js";

const d3 = window.d3;
const topojson = window.topojson;
const W0 = 2000, H0 = 1020;
const TAU = Math.PI * 2;

export const MAP_MODES = [
  { key: "base", ko: "기본" },
  { key: "attn", ko: "관심도" },
  { key: "stab", ko: "정치 안정" },
  { key: "press", ko: "언론 자유" },
  { key: "share", ko: "언론 판도" },
  { key: "mine", ko: "내 독자" },
];

const M = {
  ready: false, base: null, fx: null, bctx: null, fctx: null, tip: null,
  w: 0, h: 0, dpr: 1, view: { k: 1, x: 0, y: 0 }, kMin: 0.4, kMax: 16,
  feats: [], byKey: new Map(), projection: null, sphere: null, grat: null,
  mode: "base", dirty: true, hoverKey: null, hoverEv: null, selCountry: null, selEvent: null,
  markers: [], drag: null, anim: null, ripples: [], travel: null, raf: 0, t0: performance.now(),
};
export const mapState = M;

const keyOf = (f) => f.id ?? `x:${f.properties.name}`;

export async function loadMap() {
  if (M.ready) return;
  const topo = await (await fetch("/vendor/world-50m.json")).json();
  const fc = topojson.feature(topo, topo.objects.countries);
  M.projection = d3.geoNaturalEarth1().fitExtent([[40, 30], [W0 - 40, H0 - 30]], { type: "Sphere" });
  const path = d3.geoPath(M.projection);
  M.sphere = new Path2D(path({ type: "Sphere" }));
  M.grat = new Path2D(path(d3.geoGraticule().step([20, 20])()));
  M.borders = new Path2D(path(topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b)));
  for (const f of fc.features) {
    const key = keyOf(f);
    const dstr = path(f);
    if (!dstr) continue;
    const c = COUNTRIES[key];
    const b = path.bounds(f);
    let cen = path.centroid(f);
    if (c && c.lon != null && !c.minor) {
      // 라벨은 가장 큰 폴리곤의 중심에 둔다 (해외 영토 때문에 중심이 바다로 나가는 것 방지)
      if (f.geometry.type === "MultiPolygon") {
        let best = null, bestA = -1;
        for (const coords of f.geometry.coordinates) {
          const poly = { type: "Polygon", coordinates: coords };
          const a = path.area(poly);
          if (a > bestA) {
            bestA = a;
            best = poly;
          }
        }
        cen = path.centroid(best);
        const bb = path.bounds(best);
        b[0] = bb[0];
        b[1] = bb[1];
      }
    }
    const feat = { key, f, p: new Path2D(dstr), cen, b, area: (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]), c, playable: Boolean(c && !c.minor) };
    if (M.byKey.has(key)) M.byKey.get(key).extra = (M.byKey.get(key).extra || []).concat(feat);
    else M.byKey.set(key, feat);
    M.feats.push(feat);
  }
  M.ready = true;
}

export function initMap() {
  M.base = document.getElementById("map-base");
  M.fx = document.getElementById("map-fx");
  M.tip = document.getElementById("map-tip");
  M.bctx = M.base.getContext("2d", { alpha: false });
  M.fctx = M.fx.getContext("2d");
  resize();
  if (!M.bound) {
    // 타이틀로 나갔다가 다시 시작해도 입력 처리기가 겹치지 않게 한 번만 건다
    M.bound = true;
    window.addEventListener("resize", resize);
    bindInput();
    on("hour", () => (M.dirty = true));
    on("bureau", () => (M.dirty = true));
    on("travel:end", () => (M.dirty = true));
  }
  cancelAnimationFrame(M.raf);
  const loop = (ts) => {
    M.raf = requestAnimationFrame(loop);
    if (!G || document.getElementById("screen-game").classList.contains("hidden")) return;
    stepAnim(ts);
    if (M.dirty) {
      drawBase();
      M.dirty = false;
    }
    drawFx(ts);
  };
  M.raf = requestAnimationFrame(loop);
}

function resize() {
  const el = document.getElementById("map");
  const r = el.getBoundingClientRect();
  if (!r.width) return;
  M.w = r.width;
  M.h = r.height;
  M.dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const c of [M.base, M.fx]) {
    c.width = Math.round(M.w * M.dpr);
    c.height = Math.round(M.h * M.dpr);
    c.style.width = `${M.w}px`;
    c.style.height = `${M.h}px`;
  }
  M.kMin = Math.min(M.w / W0, M.h / H0) * 0.92;
  if (!M.inited) {
    M.inited = true;
    fitWorld();
  } else clampView();
  M.dirty = true;
}
export function fitWorld() {
  const k = Math.max(M.kMin, Math.min(M.w / W0, M.h / H0) * 1.08);
  M.view = { k, x: (M.w - W0 * k) / 2, y: (M.h - H0 * k) / 2 + 14 };
  M.dirty = true;
}
function clampView() {
  const v = M.view;
  v.k = clamp(v.k, M.kMin, M.kMax);
  const mx = M.w * 0.5, my = M.h * 0.5;
  v.x = clamp(v.x, mx - W0 * v.k, mx);
  v.y = clamp(v.y, my - H0 * v.k, my);
}
const toScreen = (p) => [p[0] * M.view.k + M.view.x, p[1] * M.view.k + M.view.y];
const toWorld = (sx, sy) => [(sx - M.view.x) / M.view.k, (sy - M.view.y) / M.view.k];
export const project = (lon, lat) => M.projection([lon, lat]);

// ── 색 ──
const ramp = (stops) => {
  const s = d3.scaleLinear().domain(stops.map((x) => x[0])).range(stops.map((x) => x[1])).clamp(true).interpolate(d3.interpolateRgb);
  return (v) => s(v);
};
const RAMPS = {
  attn: ramp([[0, "#16202f"], [35, "#27425a"], [60, "#8a6a3a"], [85, "#d9783c"], [100, "#ff5a3c"]]),
  stab: ramp([[0, "#7a2a2a"], [35, "#8a5a34"], [60, "#3f5d57"], [100, "#2f7f77"]]),
  press: ramp([[0, "#3a2440"], [40, "#4a4468"], [70, "#3f6a86"], [100, "#56a9c2"]]),
  mine: ramp([[0, "#18202d"], [0.0005, "#3a2a2c"], [0.005, "#7a3328"], [0.03, "#c5402b"], [0.15, "#ff6a4a"]]),
};
const REGION_TONE = { EAS: "#1e2a3b", SEA: "#1d2c3a", SAS: "#212b3c", CAS: "#1f2838", MEA: "#232a39", AFR: "#1f2b37", EUR: "#202a3d", NAM: "#1d293a", LAT: "#1e2c39", OCE: "#1f2a3a" };
function countryFill(feat) {
  if (!feat.playable) return "#151c28";
  const d = cd(feat.key);
  const c = feat.c;
  if (!d) return "#151c28";
  switch (M.mode) {
    case "attn": return RAMPS.attn(d.attn);
    case "stab": return RAMPS.stab(d.stab);
    case "press": return RAMPS.press(c.press);
    case "mine": return RAMPS.mine(d.my);
    case "share": {
      let top = null, tv = 0.012;
      if (d.my > tv) {
        top = "player";
        tv = d.my;
      }
      for (const rid of RIVAL_IDS) {
        const s = d.share[rid] || 0;
        if (s > tv) {
          tv = s;
          top = rid;
        }
      }
      if (!top) return "#18202c";
      const col = d3.color(OUTLETS[top].color);
      return d3.interpolateRgb("#171f2b", col.formatHex())(clamp(0.25 + tv * 3.2, 0.25, 0.8));
    }
    default: {
      const base = REGION_TONE[c.region] || "#1e2939";
      const p = presence(feat.key);
      const lift = hash01(feat.key) * 0.1 + (p >= 2 ? 0.22 : p === 1 ? 0.12 : 0);
      return d3.interpolateRgb(base, p >= 2 ? "#3d4a5e" : "#2d3a4f")(lift * 2.2);
    }
  }
}

// ── 바닥 지도 ──
function drawBase() {
  const ctx = M.bctx;
  const { k, x, y } = M.view;
  ctx.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
  const g = ctx.createRadialGradient(M.w / 2, M.h / 2, 60, M.w / 2, M.h / 2, Math.max(M.w, M.h) * 0.75);
  g.addColorStop(0, "#0b111b");
  g.addColorStop(1, "#05080d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, M.w, M.h);
  ctx.setTransform(M.dpr * k, 0, 0, M.dpr * k, M.dpr * x, M.dpr * y);
  // 바다
  const og = ctx.createLinearGradient(0, 0, 0, H0);
  og.addColorStop(0, "#0d1626");
  og.addColorStop(0.5, "#0f1a2b");
  og.addColorStop(1, "#0b1320");
  ctx.fillStyle = og;
  ctx.fill(M.sphere);
  ctx.lineWidth = 0.6 / k;
  ctx.strokeStyle = "rgba(120,150,190,0.075)";
  ctx.stroke(M.grat);
  // 나라
  for (const feat of M.feats) {
    ctx.fillStyle = countryFill(M.byKey.get(feat.key) || feat);
    ctx.fill(feat.p);
  }
  ctx.lineWidth = Math.max(0.35, 0.8 / k);
  ctx.strokeStyle = M.mode === "base" ? "rgba(140,165,200,0.26)" : "rgba(10,14,20,0.6)";
  ctx.stroke(M.borders);
  // 해안선
  ctx.lineWidth = Math.max(0.3, 0.7 / k);
  ctx.strokeStyle = "rgba(150,180,215,0.22)";
  for (const feat of M.feats) ctx.stroke(feat.p);
  // 구 테두리
  ctx.lineWidth = 2 / k;
  ctx.strokeStyle = "rgba(110,150,200,0.28)";
  ctx.stroke(M.sphere);

  // 라벨 (화면 좌표)
  ctx.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const placed = [];
  const feats = [...M.byKey.values()].filter((f) => f.playable).sort((a, b) => b.area - a.area);
  for (const feat of feats) {
    const px = Math.sqrt(feat.area) * k;
    if (px < 26) continue;
    const [sx, sy] = toScreen(feat.cen);
    if (sx < -40 || sy < 40 || sx > M.w + 40 || sy > M.h + 20) continue;
    const size = clamp(9.5 + px / 40, 10, 15);
    const name = feat.c.short;
    const wHalf = name.length * size * 0.56;
    if (placed.some((r) => Math.abs(r[0] - sx) < r[2] + wHalf && Math.abs(r[1] - sy) < size * 1.15)) continue;
    placed.push([sx, sy, wHalf]);
    ctx.font = `600 ${size}px "Pretendard Variable", Pretendard, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(8,12,18,0.75)";
    ctx.strokeText(name, sx, sy);
    ctx.fillStyle = presence(feat.key) >= 2 ? "rgba(240,225,200,0.95)" : "rgba(190,203,222,0.72)";
    ctx.fillText(name, sx, sy);
  }
}

// ── 마커·효과 ──
function eventPos(ev, idx, n) {
  const p = M.projection([ev.lon, ev.lat]);
  let [sx, sy] = toScreen(p);
  if (n > 1) {
    const a = (idx / n) * TAU - Math.PI / 2;
    const r = 13 + n * 1.6;
    sx += Math.cos(a) * r;
    sy += Math.sin(a) * r;
  }
  return [sx, sy];
}
function drawFx(ts) {
  const ctx = M.fctx;
  const t = (ts - M.t0) / 1000;
  ctx.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
  ctx.clearRect(0, 0, M.w, M.h);
  const { k, x, y } = M.view;

  // 강조된 나라
  const hl = (key, stroke, width, fill) => {
    const feat = M.byKey.get(key);
    if (!feat) return;
    ctx.save();
    ctx.setTransform(M.dpr * k, 0, 0, M.dpr * k, M.dpr * x, M.dpr * y);
    for (const f of [feat, ...(feat.extra || [])]) {
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill(f.p);
      }
      ctx.lineWidth = width / k;
      ctx.strokeStyle = stroke;
      ctx.stroke(f.p);
    }
    ctx.restore();
  };
  if (M.selCountry) hl(M.selCountry, "rgba(226,69,47,0.95)", 1.8, "rgba(226,69,47,0.10)");
  if (M.hoverKey && M.hoverKey !== M.selCountry) hl(M.hoverKey, "rgba(235,225,200,0.75)", 1.2, "rgba(255,255,255,0.05)");

  // 번지는 붉은 파문 (기정)
  for (let i = M.ripples.length - 1; i >= 0; i--) {
    const r = M.ripples[i];
    const age = (ts - r.t) / 1000;
    if (age > r.dur) {
      M.ripples.splice(i, 1);
      continue;
    }
    const [sx, sy] = toScreen(M.projection([r.lon, r.lat]));
    for (let j = 0; j < 3; j++) {
      const a = age - j * 0.35;
      if (a < 0) continue;
      const rad = a * r.speed * k;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, TAU);
      ctx.strokeStyle = `rgba(226,69,47,${clamp(0.75 * (1 - a / r.dur), 0, 1)})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  // 경쟁사 본사
  if (k > M.kMin * 1.25 || M.mode === "share") {
    for (const rid of RIVAL_IDS) {
      const o = OUTLETS[rid];
      const c = COUNTRIES[o.hq];
      const city = hqCity(o);
      const [sx, sy] = toScreen(M.projection([city[0], city[1]]));
      if (sx < 0 || sy < 0 || sx > M.w || sy > M.h) continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#0b1018";
      ctx.fillRect(-5.5, -5.5, 11, 11);
      ctx.fillStyle = o.color;
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.restore();
      if (k > 2.2 || M.mode === "share") label(ctx, o.short, sx, sy - 12, o.color, 10.5);
      void c;
    }
  }

  // 지국
  for (const id of [HOME, ...G.outlet.bureaus]) {
    const c = COUNTRIES[id];
    const [sx, sy] = toScreen(M.projection([c.lon, c.lat]));
    ctx.fillStyle = "#0b1018";
    ctx.fillRect(sx - 6, sy - 6, 12, 12);
    ctx.fillStyle = "#e2452f";
    ctx.fillRect(sx - 4.5, sy - 4.5, 9, 9);
    ctx.fillStyle = "#fff3e6";
    ctx.font = `800 7.5px "Pretendard Variable", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(id === HOME ? "本" : "支", sx, sy + 0.5);
  }

  // 사건 마커
  M.markers.length = 0;
  const evs = knownEvents().filter((e) => e.stage < 4 || G.time.min - e.closedAt < 240);
  const groups = new Map();
  for (const ev of evs) {
    const key = `${ev.lon.toFixed(1)},${ev.lat.toFixed(1)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }
  for (const list of groups.values()) {
    list.forEach((ev, i) => {
      const [sx, sy] = eventPos(ev, i, list.length);
      if (sx < -30 || sy < -30 || sx > M.w + 30 || sy > M.h + 30) return;
      drawMarker(ctx, ev, sx, sy, t);
      M.markers.push({ ev, sx, sy });
    });
  }

  // 이동 궤적
  if (M.travel) {
    const tr = M.travel;
    const p = clamp((ts - tr.t) / tr.dur, 0, 1);
    const interp = d3.geoInterpolate(tr.from, tr.to);
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const u = (i / 48) * p;
      const [sx, sy] = toScreen(M.projection(interp(u)));
      const lift = Math.sin(u * Math.PI) * 26 * Math.min(1.6, k / M.kMin / 1.4);
      if (i === 0) ctx.moveTo(sx, sy - lift);
      else ctx.lineTo(sx, sy - lift);
    }
    ctx.strokeStyle = "rgba(210,169,90,0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    const [hx, hy] = toScreen(M.projection(interp(p)));
    const lift = Math.sin(p * Math.PI) * 26 * Math.min(1.6, k / M.kMin / 1.4);
    ctx.beginPath();
    ctx.arc(hx, hy - lift, 5, 0, TAU);
    ctx.fillStyle = "#f3d28c";
    ctx.fill();
  }

  // 플레이어 위치
  if (!M.travel) {
    const c = COUNTRIES[G.player.loc];
    const [sx, sy] = toScreen(M.projection([c.lon, c.lat]));
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    ctx.beginPath();
    ctx.arc(sx, sy - 16, 11 + pulse * 3, 0, TAU);
    ctx.strokeStyle = `rgba(210,169,90,${0.35 - pulse * 0.25})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx, sy - 2);
    ctx.bezierCurveTo(sx - 9, sy - 13, sx - 8, sy - 25, sx, sy - 25);
    ctx.bezierCurveTo(sx + 8, sy - 25, sx + 9, sy - 13, sx, sy - 2);
    ctx.fillStyle = "#d2a95a";
    ctx.strokeStyle = "#0b1018";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy - 16.5, 3, 0, TAU);
    ctx.fillStyle = "#0b1018";
    ctx.fill();
  }
}
function hqCity(o) {
  const HQ = { 런던: [-0.13, 51.51], 뉴욕: [-74.0, 40.71], 서울: [126.86, 37.5], 싱가포르: [103.82, 1.35], 파리: [2.35, 48.86], 로스앤젤레스: [-118.24, 34.05], 도쿄: [139.69, 35.69], 상파울루: [-46.63, -23.55], 나이로비: [36.92, -1.2] };
  return HQ[o.city] || [COUNTRIES[o.hq].lon, COUNTRIES[o.hq].lat];
}
function label(ctx, text, x, y, color, size = 11) {
  ctx.font = `700 ${size}px "Pretendard Variable", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(8,12,18,0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
function drawMarker(ctx, ev, sx, sy, t) {
  const cat = CATS[ev.cat];
  const sel = M.selEvent === ev.id;
  const hov = M.hoverEv === ev.id;
  const r = (7.5 + ev.sig * 1.1) * (sel ? 1.25 : hov ? 1.12 : 1);
  const closed = ev.stage >= 4;
  const alpha = closed ? 0.35 : 1;
  ctx.globalAlpha = alpha;
  // 발생 단계의 파동
  if (ev.stage === 1 || (ev.stage === 2 && ev.heat > 55)) {
    const ph = (t * 0.9 + hash01(ev.id)) % 1;
    ctx.beginPath();
    ctx.arc(sx, sy, r + ph * 16, 0, TAU);
    ctx.strokeStyle = ev.campaign ? `rgba(226,69,47,${0.6 * (1 - ph)})` : hexA(cat.color, 0.55 * (1 - ph));
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (sel) {
    ctx.beginPath();
    ctx.arc(sx, sy, r + 5, 0, TAU);
    ctx.strokeStyle = "rgba(255,244,225,0.9)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.beginPath();
  if (ev.campaign) {
    const s = r * 0.95;
    ctx.rect(sx - s, sy - s, s * 2, s * 2);
    ctx.fillStyle = "#b8321f";
  } else {
    ctx.arc(sx, sy, r, 0, TAU);
    ctx.fillStyle = ev.stage === 0 ? "#141b27" : cat.color;
  }
  ctx.fill();
  ctx.lineWidth = ev.stage === 0 ? 1.6 : 1.4;
  if (ev.stage === 0) ctx.setLineDash([3, 2.5]);
  ctx.strokeStyle = ev.stage === 0 ? cat.color : "#0a0f17";
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = ev.campaign ? "#fff1e2" : ev.stage === 0 ? cat.color : "#0a0f17";
  ctx.font = `800 ${Math.round(r * 1.05)}px "Pretendard Variable", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ev.campaign ? "定" : ev.stage === 0 ? "?" : cat.glyph, sx, sy + 0.5);
  // 미열람 표시
  if (!ev.seen && !closed) {
    ctx.beginPath();
    ctx.arc(sx + r * 0.78, sy - r * 0.78, 3.4, 0, TAU);
    ctx.fillStyle = "#ffd36b";
    ctx.strokeStyle = "#0a0f17";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (sel || hov) label(ctx, ev.title.length > 22 ? ev.title.slice(0, 21) + "…" : ev.title, sx, sy - r - 12, "#f2ead8", 11.5);
}
function hexA(hex, a) {
  const c = d3.color(hex);
  c.opacity = a;
  return c.formatRgb();
}

// ── 입력 ──
function pickCountry(sx, sy) {
  const ctx = M.bctx;
  const [wx, wy] = toWorld(sx, sy);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  let found = null;
  for (const feat of M.feats) {
    if (wx < feat.b[0][0] - 400 && feat.f.geometry.type !== "MultiPolygon") continue;
    if (ctx.isPointInPath(feat.p, wx, wy)) {
      found = feat;
      break;
    }
  }
  ctx.restore();
  return found;
}
function pickMarker(sx, sy) {
  let best = null, bd = 16 * 16;
  for (const m of M.markers) {
    const d = (m.sx - sx) ** 2 + (m.sy - sy) ** 2;
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best?.ev || null;
}
function bindInput() {
  const el = M.fx;
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
  }, { passive: false });
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    M.drag = { x: e.clientX, y: e.clientY, vx: M.view.x, vy: M.view.y, moved: false };
    M.anim = null;
  });
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (M.drag) {
      const dx = e.clientX - M.drag.x, dy = e.clientY - M.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) M.drag.moved = true;
      if (M.drag.moved) {
        M.view.x = M.drag.vx + dx;
        M.view.y = M.drag.vy + dy;
        clampView();
        M.dirty = true;
        el.style.cursor = "grabbing";
        hideTip();
      }
      return;
    }
    const ev = pickMarker(sx, sy);
    M.hoverEv = ev?.id ?? null;
    const feat = ev ? null : pickCountry(sx, sy);
    M.hoverKey = feat?.playable ? feat.key : null;
    el.style.cursor = ev || M.hoverKey ? "pointer" : "grab";
    if (ev) showTip(sx, sy, evTip(ev));
    else if (M.hoverKey) showTip(sx, sy, countryTip(feat));
    else hideTip();
  });
  const up = (e) => {
    if (!M.drag) return;
    const moved = M.drag.moved;
    M.drag = null;
    el.style.cursor = "grab";
    if (moved) return;
    const r = el.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const ev = pickMarker(sx, sy);
    if (ev) return emit("map:event", ev);
    const feat = pickCountry(sx, sy);
    if (feat?.playable) emit("map:country", feat.key);
    else emit("map:blank");
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", () => (M.drag = null));
  el.addEventListener("pointerleave", () => {
    M.hoverKey = null;
    M.hoverEv = null;
    hideTip();
  });
  el.addEventListener("dblclick", (e) => {
    const r = el.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, 1.8, true);
  });
}
export function zoomAt(sx, sy, factor, animate = false) {
  const v = M.view;
  const k2 = clamp(v.k * factor, M.kMin, M.kMax);
  const [wx, wy] = toWorld(sx, sy);
  const target = { k: k2, x: sx - wx * k2, y: sy - wy * k2 };
  if (animate) flyToView(target, 320);
  else {
    Object.assign(v, target);
    clampView();
    M.dirty = true;
  }
}
export const zoomBy = (factor) => zoomAt(M.w / 2, M.h / 2, factor, true);
function flyToView(target, dur = 700) {
  M.anim = { from: { ...M.view }, to: target, t: performance.now(), dur };
}
function stepAnim(ts) {
  if (!M.anim) return;
  const a = M.anim;
  const p = clamp((ts - a.t) / a.dur, 0, 1);
  const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  M.view.k = a.from.k + (a.to.k - a.from.k) * e;
  M.view.x = a.from.x + (a.to.x - a.from.x) * e;
  M.view.y = a.from.y + (a.to.y - a.from.y) * e;
  clampView();
  M.dirty = true;
  if (p >= 1) M.anim = null;
}
// 화면에서 패널이 가리지 않는 중심점으로 날아간다
export function flyTo(lon, lat, k, offsetX = 0) {
  const p = M.projection([lon, lat]);
  const kk = clamp(k ?? Math.max(M.view.k, M.kMin * 2.6), M.kMin, M.kMax);
  flyToView({ k: kk, x: M.w / 2 + offsetX - p[0] * kk, y: M.h / 2 - p[1] * kk }, 800);
}
export function focusCountry(id, zoom) {
  const c = COUNTRIES[id];
  const feat = M.byKey.get(id);
  if (!c || !feat) return;
  const span = Math.sqrt(feat.area);
  const k = zoom ?? clamp((Math.min(M.w, M.h) * 0.3) / Math.max(span, 30), M.kMin * 1.6, M.kMin * 7);
  flyTo(c.lon, c.lat, k, -40);
}
export function setMode(mode) {
  M.mode = mode;
  M.dirty = true;
  emit("map:mode", mode);
}
export function selectEvent(id) {
  M.selEvent = id;
}
export function selectCountry(id) {
  M.selCountry = id;
}
export function ripple(countryId, big = false) {
  const c = COUNTRIES[countryId] || COUNTRIES[HOME];
  M.ripples.push({ lon: c.lon, lat: c.lat, t: performance.now(), dur: big ? 4.2 : 2.6, speed: big ? 150 : 70 });
}
export function animateTravel(fromId, toId, dur = 1700) {
  const a = COUNTRIES[fromId], b = COUNTRIES[toId];
  M.travel = { from: [a.lon, a.lat], to: [b.lon, b.lat], t: performance.now(), dur };
  const mid = d3.geoInterpolate(M.travel.from, M.travel.to)(0.5);
  const dist = d3.geoDistance(M.travel.from, M.travel.to);
  flyTo(mid[0], mid[1], clamp(M.kMin * (2.4 - dist), M.kMin * 1.05, M.kMin * 2.6));
  return new Promise((res) => setTimeout(() => {
    M.travel = null;
    res();
  }, dur + 120));
}
export const markDirty = () => (M.dirty = true);

// ── 툴팁 ──
function showTip(sx, sy, html) {
  const tip = M.tip;
  tip.innerHTML = html;
  tip.classList.remove("hidden");
  const w = tip.offsetWidth, hgt = tip.offsetHeight;
  tip.style.left = `${clamp(sx + 16, 8, M.w - w - 8)}px`;
  tip.style.top = `${clamp(sy + 18, 56, M.h - hgt - 8)}px`;
}
function hideTip() {
  M.tip.classList.add("hidden");
}
function evTip(ev) {
  const c = COUNTRIES[ev.country];
  return `<b>${ev.title}</b><span>${c.short} ${ev.city} · ${CATS[ev.cat].ko} · <em style="color:${STAGES[ev.stage].color}">${STAGES[ev.stage].ko}</em></span>`;
}
function countryTip(feat) {
  const d = cd(feat.key);
  const c = feat.c;
  let extra = "";
  if (M.mode === "attn") extra = `세계의 관심 ${Math.round(d.attn)}`;
  else if (M.mode === "stab") extra = `정치 안정 ${Math.round(d.stab)} · 정부 지지 ${Math.round(d.appr)}`;
  else if (M.mode === "press") extra = `언론 자유 ${c.press}`;
  else if (M.mode === "mine") extra = `내 독자 ${fmtPct(d.my, 3)}`;
  else if (M.mode === "share") {
    const top = Object.entries({ player: d.my, ...d.share }).sort((a, b) => b[1] - a[1])[0];
    extra = top && top[1] > 0.005 ? `1위 ${top[0] === "player" ? G.meta.outlet : OUTLETS[top[0]].short} ${fmtPct(top[1])}` : "지역 매체 우세";
  } else extra = `인구 ${c.pop >= 1 ? Math.round(c.pop).toLocaleString() + "백만" : (c.pop * 100).toFixed(0) + "만"} · 뉴스 독자 ${Math.round(audience(feat.key) / 1e4).toLocaleString()}만`;
  const p = presence(feat.key);
  const tag = p >= 3 ? " · 현재 위치" : feat.key === HOME ? " · 본사" : p === 2 ? " · 지국" : "";
  return `<b>${c.ko}${tag}</b><span>${extra}</span>`;
}
