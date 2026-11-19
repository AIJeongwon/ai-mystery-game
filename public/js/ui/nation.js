// 국가 지도 — 세계지도에서 나라를 누르면 들어오는 시·도 단위 지도.
// 여기서 하는 일은 셋이다: 시·도를 둘러본다, 사건 핀을 눌러 개요를 읽는다, 현장으로 떠난다. 조사와 대화는 현장(3D)에서 한다.
// 경계 자료는 tools/build-admin1.mjs가 만든 /assets/geo/admin1-<나라 번호>.json 이다.
// 이 파일은 지도를 그리고 고르게 할 뿐이다. 어떤 사건이 어디에 있고 어디까지 했는지는 여는 쪽이 넘겨준다 (openNation의 opts).
import { h, mount, icon, modalOpen } from "./dom.js";
import { mapState } from "./map.js";
import { COUNTRIES } from "../data/countries.js";
import { NATION_MAPS, hasNationMap } from "../data/cases.js";
import { decodeRings } from "../core/geo.js";
import { sfx } from "../audio.js";

const d3 = window.d3;

const BASE = 1000; //   투영한 좌표의 크기. 화면에는 view(k, x, y)로 옮겨 그린다
const CARD_W = 404; // 사건 개요가 차지하는 너비 (css의 .nm-card와 같다)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const cache = new Map();
const N = {
  el: null, canvas: null, ctx: null, pinsEl: null, tip: null, card: null, veil: null, refs: {},
  open: false, busy: false, id: null, geo: null, opts: null,
  w: 0, h: 0, dpr: 1, view: { k: 1, x: 0, y: 0 }, kFit: 1, dirty: true, anim: null, drag: null, raf: 0,
  hover: null, sel: null, pins: [],
};

// ── 자료 ──
function hash01(s) {
  let v = 2166136261;
  for (let i = 0; i < s.length; i++) v = Math.imul(v ^ s.charCodeAt(i), 16777619);
  return ((v >>> 0) % 1000) / 1000;
}
function build(id, raw) {
  const conf = NATION_MAPS[id];
  const fitGeo = { type: "MultiPoint", coordinates: conf.fit };
  const proj = d3.geoMercator().fitSize([BASE, BASE], fitGeo);
  const [[x0, y0], [x1, y1]] = d3.geoPath(proj).bounds(fitGeo);
  const all = new Path2D();
  const regions = raw.regions.map((r) => {
    const path = new Path2D();
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    let big = 0;
    for (const ring of decodeRings(r.rings, raw.scale)) {
      let area = 0, px = 0, py = 0;
      ring.forEach((pt, i) => {
        const [x, y] = proj(pt);
        if (i) {
          path.lineTo(x, y);
          area += px * y - x * py;
        } else path.moveTo(x, y);
        px = x;
        py = y;
        if (x < box[0]) box[0] = x;
        if (y < box[1]) box[1] = y;
        if (x > box[2]) box[2] = x;
        if (y > box[3]) box[3] = y;
      });
      path.closePath();
      big = Math.max(big, Math.abs(area) / 2);
    }
    all.addPath(path);
    return { id: r.id, ko: r.ko, full: r.full, path, box, area: big, at: proj(r.at), tone: hash01(r.id) };
  });
  // 둘레의 다른 나라: 세계지도의 자료를 같은 투영으로 흐리게 깐다 (이 나라 자신은 뺀다: 해안선의 정밀도가 달라 어긋난다)
  const m = BASE * 1.6;
  const clip = d3.geoMercator().scale(proj.scale()).translate(proj.translate()).clipExtent([[x0 - m, y0 - m], [x1 + m, y1 + m]]);
  const gp = d3.geoPath(clip);
  let d = "";
  for (const f of mapState.feats) if (f.key !== id) d += gp(f.f) || "";
  const [[w, s], [e, n]] = conf.fit;
  const grat = d3.geoGraticule().extent([[Math.floor(w) - 14, Math.floor(s) - 10], [Math.ceil(e) + 14, Math.ceil(n) + 8]]).step([conf.grat, conf.grat])();
  return { id, proj, box: [x0, y0, x1, y1], regions, byId: new Map(regions.map((r) => [r.id, r])), all, land: new Path2D(d), grat: new Path2D(gp(grat) || "") };
}
async function load(id) {
  if (!cache.has(id)) {
    const res = await fetch(`/assets/geo/admin1-${id}.json`);
    if (!res.ok) throw new Error(`시·도 자료를 읽지 못했다 (${res.status})`);
    cache.set(id, build(id, await res.json()));
  }
  return cache.get(id);
}

// ── 화면 ──
function ensure() {
  if (N.el) return;
  const R = N.refs;
  N.canvas = h("canvas.nm-canvas");
  N.pinsEl = h("div.nm-pins");
  N.tip = h("div.map-tip.hidden");
  N.card = h("aside.nm-card");
  R.name = h("h2.nm-name");
  R.sub = h("div.nm-sub");
  R.empty = h("div.nm-empty.hidden", "이 나라에서 들어온 사건은 아직 없다.");
  R.place = h("div.nm-arrive-place");
  R.clock = h("div.nm-arrive-clock");
  N.veil = h("div.nm-veil", h("div.nm-arrive", h("div.nm-arrive-eyebrow", "현장"), R.place, h("i.nm-arrive-rule"), R.clock));
  N.el = h("div#nation.hidden",
    N.canvas, N.pinsEl, N.tip,
    h("div.nm-head",
      h("button.nm-back", { title: "세계지도로 (Esc)", onclick: () => closeNation() }, icon("back", 16), "세계지도"),
      h("div.nm-title", h("div.nm-eyebrow", "국가 지도"), R.name, R.sub)),
    h("div.nm-tools",
      h("div.seg",
        h("button", { title: "축소 (−)", onclick: () => zoomBy(1 / 1.6) }, icon("minus", 14)),
        h("button", { title: "나라 전체 보기", onclick: () => fly(fitView(Boolean(N.sel))) }, icon("home", 14)),
        h("button", { title: "확대 (+)", onclick: () => zoomBy(1.6) }, icon("plus", 14))),
      h("span.nm-hint", "끌어서 옮기고, 휠로 확대한다")),
    R.empty, N.card, N.veil);
  document.getElementById("screen-game").append(N.el);
  N.ctx = N.canvas.getContext("2d", { alpha: false });
  bindInput();
  window.addEventListener("resize", () => N.open && resize(true));
  document.addEventListener("keydown", onKey);
}
function resize(refit) {
  const r = N.el.getBoundingClientRect();
  if (!r.width) return;
  N.w = r.width;
  N.h = r.height;
  N.dpr = Math.min(2, window.devicePixelRatio || 1);
  N.canvas.width = Math.round(N.w * N.dpr);
  N.canvas.height = Math.round(N.h * N.dpr);
  N.kFit = fitView(false).k;
  if (refit) {
    N.anim = null;
    N.view = N.sel ? caseView(N.sel) : fitView(false);
  }
  N.dirty = true;
}
// 나라 전체가 들어오는 시야. 사건 개요가 열려 있으면 그만큼 왼쪽으로 비킨다.
function fitView(cardOpen) {
  const narrow = N.w < 860;
  const pad = { l: 40, t: 104, r: 40 + (cardOpen && !narrow ? CARD_W : 0), b: 70 };
  const [x0, y0, x1, y1] = N.geo.box;
  const fw = Math.max(120, N.w - pad.l - pad.r), fh = Math.max(120, N.h - pad.t - pad.b);
  const k = Math.min(fw / (x1 - x0), fh / (y1 - y0));
  return { k, x: pad.l + (fw - (x1 - x0) * k) / 2 - x0 * k, y: pad.t + (fh - (y1 - y0) * k) / 2 - y0 * k };
}
// 사건이 난 곳을 빈 자리의 가운데에 두는 시야
function caseView(c, zoom = 2.3) {
  const [bx, by] = N.geo.proj(c.at);
  const k = N.kFit * zoom;
  const narrow = N.w < 860;
  return { k, x: (narrow ? N.w : N.w - CARD_W) / 2 - bx * k, y: N.h * (narrow ? 0.25 : 0.54) - by * k };
}
const toScreen = ([bx, by]) => [bx * N.view.k + N.view.x, by * N.view.k + N.view.y];
function clampView(v = N.view) {
  v.k = clamp(v.k, N.kFit * 0.7, N.kFit * 20);
  const [x0, y0, x1, y1] = N.geo.box;
  v.x = clamp(v.x, N.w / 2 - x1 * v.k, N.w / 2 - x0 * v.k);
  v.y = clamp(v.y, N.h / 2 - y1 * v.k, N.h / 2 - y0 * v.k);
  return v;
}
function fly(to, dur = 620, ease = "inout") {
  if (calm()) dur = 0;
  N.anim = { from: { ...N.view }, to, t: performance.now(), dur, ease };
  N.dirty = true;
}
function zoomAt(sx, sy, f, smooth = false) {
  const v = N.anim?.to || N.view;
  const k = clamp(v.k * f, N.kFit * 0.7, N.kFit * 20);
  const to = clampView({ k, x: sx - ((sx - v.x) / v.k) * k, y: sy - ((sy - v.y) / v.k) * k });
  if (smooth) fly(to, 260);
  else {
    N.anim = null;
    N.view = to;
    N.dirty = true;
  }
}
const zoomBy = (f) => zoomAt((N.w - (N.sel && N.w >= 860 ? CARD_W : 0)) / 2, N.h / 2, f, true);
function step(ts) {
  const a = N.anim;
  if (!a) return;
  const p = a.dur ? clamp((ts - a.t) / a.dur, 0, 1) : 1;
  const e = a.ease === "in" ? p * p * p : p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  // 확대는 배율의 로그로 잇는다: 멀리서 가까이 갈 때 속도가 고르게 보인다
  const k = a.from.k * Math.pow(a.to.k / a.from.k, e);
  const u = a.to.k === a.from.k ? e : (k - a.from.k) / (a.to.k - a.from.k);
  N.view = { k, x: a.from.x + (a.to.x - a.from.x) * u, y: a.from.y + (a.to.y - a.from.y) * u };
  N.dirty = true;
  if (p >= 1) N.anim = null;
}

// ── 그리기 ──
const caseCount = (r) => N.opts.cases.filter((c) => c.region === r.id).length;
function fillOf(r) {
  const l = 15.5 + r.tone * 5 + (r === N.hover ? 7 : 0);
  return caseCount(r) ? `hsl(8 ${r === N.hover ? 42 : 36}% ${l + 4}%)` : `hsl(216 30% ${l}%)`;
}
function draw() {
  const { ctx, w, h: hgt, dpr, geo } = N;
  const { k, x, y } = N.view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = ctx.createRadialGradient(w / 2, hgt / 2, 60, w / 2, hgt / 2, Math.max(w, hgt) * 0.75);
  bg.addColorStop(0, "#0d1626");
  bg.addColorStop(1, "#070b12");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, hgt);
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
  ctx.lineWidth = 0.7 / k;
  ctx.strokeStyle = "rgba(120,150,190,0.085)";
  ctx.stroke(geo.grat);
  ctx.fillStyle = "#0f1723";
  ctx.fill(geo.land);
  ctx.lineWidth = 0.9 / k;
  ctx.strokeStyle = "rgba(150,180,215,0.15)";
  ctx.stroke(geo.land);
  // 나라의 테두리에 번지는 빛 (한 번에 칠한다)
  ctx.save();
  ctx.shadowColor = "rgba(96,146,214,0.42)";
  ctx.shadowBlur = 30 * dpr;
  ctx.fillStyle = "#182233";
  ctx.fill(geo.all);
  ctx.restore();
  for (const r of geo.regions) {
    ctx.fillStyle = fillOf(r);
    ctx.fill(r.path, "evenodd");
  }
  ctx.lineJoin = "round";
  ctx.lineWidth = 1 / k;
  ctx.strokeStyle = "rgba(168,190,222,0.36)";
  for (const r of geo.regions) ctx.stroke(r.path);
  const sel = N.sel && geo.byId.get(N.sel.region);
  if (N.hover && N.hover !== sel) {
    ctx.lineWidth = 1.6 / k;
    ctx.strokeStyle = "rgba(240,230,205,0.85)";
    ctx.stroke(N.hover.path);
  }
  if (sel) {
    ctx.lineWidth = 2 / k;
    ctx.strokeStyle = "rgba(240,96,74,0.95)";
    ctx.stroke(sel.path);
  }
  // 이름 (화면 좌표). 사건이 있는 곳을 먼저, 그다음은 넓은 곳부터 놓고 겹치면 뺀다.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const placed = [];
  const order = [...geo.regions].sort((a, b) => caseCount(b) - caseCount(a) || b.area - a.area);
  for (const r of order) {
    const hot = caseCount(r) > 0;
    const px = Math.sqrt(r.area) * k;
    const size = clamp(10.5 + px / 46, 11.5, 16);
    let [sx, sy] = toScreen(r.at);
    if (hot) [sx, sy] = [toScreen([(r.box[0] + r.box[2]) / 2, 0])[0], toScreen([0, r.box[3]])[1] + size * 0.95]; // 핀과 겹치지 않게 테두리 바로 아래에 적는다
    if (sx < -30 || sy < 60 || sx > w + 30 || sy > hgt + 10) continue;
    const wHalf = r.ko.length * size * 0.56 + 3;
    if (!hot && placed.some((b) => Math.abs(b[0] - sx) < b[2] + wHalf && Math.abs(b[1] - sy) < size * 1.2)) continue;
    placed.push([sx, sy, wHalf]);
    ctx.font = `${hot ? 800 : 600} ${size}px "Pretendard Variable", Pretendard, sans-serif`;
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = "rgba(8,12,18,0.8)";
    ctx.strokeText(r.ko, sx, sy);
    ctx.fillStyle = hot ? "#ffc9bd" : r === N.hover ? "rgba(240,244,250,0.98)" : "rgba(196,208,226,0.8)";
    ctx.fillText(r.ko, sx, sy);
  }
  for (const p of N.pins) {
    const [sx, sy] = toScreen(p.b);
    p.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
  }
}
function loop(ts) {
  if (!N.open) return;
  N.raf = requestAnimationFrame(loop);
  step(ts);
  if (N.dirty) {
    N.dirty = false;
    draw();
  }
}

// ── 고르기 ──
function pick(sx, sy) {
  const bx = (sx - N.view.x) / N.view.k, by = (sy - N.view.y) / N.view.k;
  const ctx = N.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  let found = null;
  for (const r of N.geo.regions) {
    if (bx < r.box[0] || by < r.box[1] || bx > r.box[2] || by > r.box[3]) continue;
    if (ctx.isPointInPath(r.path, bx, by, "evenodd")) {
      found = r;
      break;
    }
  }
  ctx.restore();
  return found;
}
function showTip(sx, sy, r) {
  const n = caseCount(r);
  mount(N.tip, h("b", r.full), h("span", n ? `사건 ${n}건 · 눌러서 개요를 읽는다` : "들어온 사건이 없다"));
  N.tip.classList.remove("hidden");
  N.tip.style.left = `${clamp(sx + 16, 8, N.w - N.tip.offsetWidth - 8)}px`;
  N.tip.style.top = `${clamp(sy + 18, 8, N.h - N.tip.offsetHeight - 8)}px`;
}
function setHover(r, sx, sy) {
  if (r !== N.hover) {
    N.hover = r;
    N.dirty = true;
  }
  N.canvas.style.cursor = N.drag?.moved ? "grabbing" : r && caseCount(r) ? "pointer" : "grab";
  if (r && !N.drag?.moved) showTip(sx, sy, r);
  else N.tip.classList.add("hidden");
}
function bindInput() {
  const el = N.canvas;
  const at = (e) => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (N.busy) return;
    const [sx, sy] = at(e);
    zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0016));
  }, { passive: false });
  el.addEventListener("pointerdown", (e) => {
    if (N.busy || e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    N.drag = { x: e.clientX, y: e.clientY, vx: N.view.x, vy: N.view.y, moved: false };
  });
  el.addEventListener("pointermove", (e) => {
    if (N.busy) return;
    const [sx, sy] = at(e);
    const d = N.drag;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
      if (d.moved) {
        N.anim = null;
        N.view.x = d.vx + dx;
        N.view.y = d.vy + dy;
        clampView();
        N.dirty = true;
        return setHover(null);
      }
    }
    setHover(pick(sx, sy), sx, sy);
  });
  el.addEventListener("pointerup", (e) => {
    const d = N.drag;
    N.drag = null;
    el.style.cursor = "grab";
    if (!d || d.moved || N.busy) return;
    const r = pick(...at(e));
    const c = r && N.opts.cases.find((x) => x.region === r.id);
    if (c) selectCase(c);
    else if (N.sel) selectCase(null);
  });
  el.addEventListener("pointercancel", () => (N.drag = null));
  el.addEventListener("pointerleave", () => setHover(null));
  el.addEventListener("dblclick", (e) => !N.busy && zoomAt(...at(e), 1.8, true));
}
function onKey(e) {
  if (!N.open || N.busy || modalOpen()) return;
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key === "Escape") {
    e.stopPropagation();
    if (N.sel) selectCase(null);
    else closeNation();
  } else if (e.key === "+" || e.key === "=") zoomBy(1.6);
  else if (e.key === "-") zoomBy(1 / 1.6);
}

// ── 핀 ──
function buildPins() {
  const { opts, geo } = N;
  N.pins = [];
  const kids = [];
  if (opts.me) {
    const el = h("div.nm-me", h("i"), h("span", "현재 위치"));
    N.pins.push({ el, b: geo.proj(opts.me.at) });
    kids.push(el);
  }
  for (const c of opts.cases) {
    const st = c.status || {};
    const el = h(`button.nm-pin${st.done ? ".done" : st.started ? ".going" : ""}`, { title: `${c.eyebrow} ${c.title}`, dataset: { id: c.id }, onclick: () => !N.busy && selectCase(c) },
      h("span.nm-pin-tag", h("em", st.done ? "취재 끝" : st.started ? "취재 중" : "새 사건"), c.title),
      h("span.nm-pin-head", icon("case", 15)), h("i.nm-pin-ring"), h("i.nm-pin-ring.late"));
    N.pins.push({ el, b: geo.proj(c.at), c });
    kids.push(el);
  }
  mount(N.pinsEl, kids);
}

// ── 사건 개요 ──
function renderCard(c) {
  const st = c.status || {};
  const [chipText, chipCls] = st.done ? ["취재를 마쳤다", "green"] : st.started ? ["취재 중", "gold"] : ["새 사건", "red"];
  const row = (k, v) => [h("dt", k), h("dd", v)];
  mount(N.card,
    h("div.nm-card-top", h("span.eyebrow", "사건 개요"), h(`span.chip.${chipCls}`, chipText), h("button.nm-x", { title: "닫기 (Esc)", onclick: () => selectCase(null) }, icon("close", 16))),
    h("div.nm-card-eyebrow", c.eyebrow),
    h("h3.nm-card-title", c.title),
    h("dl.nm-facts", row("곳", c.where), row("때", c.when), row("이동", c.travel)),
    h("div.nm-outline", h("div.nm-outline-head", "알려진 것"), c.outline.map((t) => h("p", t))),
    h("p.nm-note", "지도에서 알 수 있는 것은 여기까지다. 나머지는 현장에서 직접 보고 듣는다."),
    h("div.nm-now", h("label", st.started ? "지금" : "처음 갈 곳"), h("b", st.started ? st.place || c.first.place : c.first.place), h("span", st.started ? st.clock || "" : c.first.clock)),
    h("div.nm-actions",
      h("button.btn.primary.block.nm-go", { onclick: () => depart(c, false) }, icon("pin", 16), st.started ? "현장으로 돌아간다" : "현장으로 간다"),
      st.started ? h("button.btn.ghost.small.block", { onclick: () => depart(c, true) }, "처음부터 다시 취재한다") : null));
}
function selectCase(c) {
  if (N.sel === c) return;
  N.sel = c;
  N.el.classList.toggle("has-card", Boolean(c));
  for (const p of N.pins) p.el.classList.toggle("on", Boolean(c) && p.c === c);
  if (c) {
    renderCard(c);
    sfx("paper");
    fly(clampView(caseView(c)), 760);
    N.opts.onCase?.(c);
  } else {
    sfx("close");
    fly(fitView(false), 620);
    N.opts.onCase?.(null);
  }
  N.dirty = true;
}
// 현장으로 떠난다: 핀을 향해 파고들며 어두워지고, 닿은 곳과 시각이 뜬다. 그 뒤의 일(페이지를 옮긴다)은 여는 쪽이 한다.
async function depart(c, restart) {
  if (N.busy) return;
  const how = N.opts.beforeDepart ? await N.opts.beforeDepart(c, { restart }) : { restart };
  if (!how || N.busy || !N.open) return;
  restart = Boolean(how.restart);
  N.busy = true;
  N.tip.classList.add("hidden");
  const st = restart ? {} : how.status || c.status || {};
  N.refs.place.textContent = st.started ? st.place || c.first.place : c.first.place;
  N.refs.clock.textContent = st.started ? st.clock || "" : c.first.clock;
  N.el.classList.add("leaving");
  document.getElementById("screen-game").classList.add("nation-leaving");
  sfx("whoosh");
  const [bx, by] = N.geo.proj(c.at);
  const k = N.kFit * 20;
  fly({ k, x: N.w / 2 - bx * k, y: N.h / 2 - by * k }, 1500, "in");
  await wait(calm() ? 200 : 1250);
  N.el.classList.add("arrived");
  sfx("stamp");
  await wait(calm() ? 900 : 1900);
  N.opts.onDepart?.(c, { restart });
}

// ── 열고 닫기 ──
// opts: { cases: [사건 핀 + status{ started, done, clock, place }], me: { at } | null,
//         onCase(c | null: 개요를 닫았다), beforeDepart(c, { restart }) → Promise<false | { restart, status? }>, onDepart(c, { restart }), onClose(),
//         focus: 사건 id (열자마자 개요를 편다) }
export async function openNation(id, opts) {
  if (!hasNationMap(id) || N.busy) return false;
  ensure();
  const geo = await load(id);
  const c = COUNTRIES[id];
  Object.assign(N, { id, geo, opts, sel: null, hover: null, anim: null, drag: null, open: true });
  N.refs.name.textContent = c.ko;
  N.refs.sub.textContent = `시·도 ${geo.regions.length}곳 · ${opts.cases.length ? `들어온 사건 ${opts.cases.length}건` : "들어온 사건 없음"}`;
  N.refs.empty.classList.toggle("hidden", opts.cases.length > 0);
  N.card.replaceChildren();
  N.el.classList.remove("hidden", "has-card", "leaving", "arrived", "in");
  document.getElementById("screen-game").classList.remove("nation-leaving");
  document.getElementById("screen-game").classList.add("nation-open");
  buildPins();
  resize(true);
  // 조금 멀리서 다가오며 열린다
  const to = fitView(false);
  N.view = { k: to.k * 0.86, x: to.x + (N.w / 2 - to.x) * 0.14, y: to.y + (N.h / 2 - to.y) * 0.14 };
  fly(to, 700);
  cancelAnimationFrame(N.raf);
  N.raf = requestAnimationFrame(loop);
  requestAnimationFrame(() => N.el.classList.add("in"));
  sfx("open");
  const focus = opts.focus && opts.cases.find((x) => x.id === opts.focus);
  if (focus) setTimeout(() => N.open && !N.sel && selectCase(focus), 520);
  return true;
}
export function closeNation() {
  if (!N.open || N.busy) return;
  N.open = false;
  cancelAnimationFrame(N.raf);
  N.el.classList.remove("in");
  document.getElementById("screen-game").classList.remove("nation-open");
  sfx("close");
  const el = N.el, opts = N.opts;
  setTimeout(() => !N.open && el.classList.add("hidden"), 260);
  opts.onClose?.();
}
export const nationOpen = () => N.open;
export const nationState = N; // 시험·디버깅용
