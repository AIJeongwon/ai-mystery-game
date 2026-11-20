// 약도 — 문을 나서면 펼쳐지는 손으로 그린 지도. 알게 된 곳만 그려져 있다.
// 고르면 그만큼 시간이 가고(state.travelTo), 그 장소의 현장을 새로 연다(engine.depart).
// 이 파일은 그림과 고르기만 한다. 갈 수 있는 곳과 걸리는 시간은 state.js가 정한다.
import { el } from "./hud.js";
import { placesOpen, lockOpen, fmtClock, nextDeadline } from "./state.js";
import { sfx } from "./sfx.js";

const NS = "http://www.w3.org/2000/svg";
const W = 900, H = 620;
function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
function rnd(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}
// 손으로 그은 선: 점들을 조금씩 떨리게 잇는다
function wobble(points, r, amp = 2.2) {
  const p = points.map(([x, y], i) => (i === 0 || i === points.length - 1 ? [x, y] : [x + (r() - 0.5) * amp * 2, y + (r() - 0.5) * amp * 2]));
  // 점과 점 사이는 부드럽게 굽는다 (Catmull-Rom)
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
const lerp = (a, b, t) => a + (b - a) * t;
// 손으로 친 동그라미
const ring = (rad, r, amp) => wobble(Array.from({ length: 9 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2 - 2.2) * rad, Math.sin((i / 8) * Math.PI * 2 - 2.2) * rad]), r, amp);
const along = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => [lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
const span = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`);

// 서울 서쪽의 뼈대: 한강이 비스듬히 흐르고, 다리 하나, 안양천이 강으로 든다.
// 실제 지명만 쓴다. 건물과 학교, 학원 이름은 지어낸 것이다.
function drawGround(g, r) {
  const north = [[-10, 266], [80, 276], [180, 274], [280, 260], [380, 244], [470, 238], [560, 246], [650, 238], [740, 222], [830, 208], [910, 200]];
  const south = north.map(([x, y], i) => [x, y + 64 + Math.sin(i * 1.7) * 7]).reverse();
  const nd = wobble(north, r, 2.4), sd = wobble(south, r, 2.4);
  g.append(svg("path", { d: `${nd} L${south[0][0]} ${south[0][1].toFixed(1)} ${sd.slice(sd.indexOf(" C"))} Z`, class: "tv-water" }));
  // 물결: 짧은 연필 줄 몇 개
  for (let i = 0; i < 22; i++) {
    const t = r(), x = lerp(20, 880, t), y = lerp(306, 236, t) + (r() - 0.5) * 34, w = 14 + r() * 22;
    g.append(svg("path", { d: `M${x.toFixed(0)} ${y.toFixed(0)} q${(w / 2).toFixed(0)} ${(-3 + r() * 2).toFixed(1)} ${w.toFixed(0)} ${(r() * 2).toFixed(1)}`, class: "tv-ripple" }));
  }
  g.append(svg("path", { d: nd, class: "tv-bank" }), svg("path", { d: sd, class: "tv-bank" }));
  // 안양천: 남쪽에서 올라와 강으로 든다
  g.append(svg("path", { d: wobble([[524, 630], [512, 566], [492, 500], [482, 430], [468, 366], [456, 312]], r, 3), class: "tv-stream" }));
  // 다리
  const b0 = [468, 222], b1 = [420, 330];
  g.append(svg("path", { d: wobble(along(b0, b1, 3), r, 1.2), class: "tv-bridge" }));
  for (let i = 1; i < 6; i++) {
    const x = lerp(b0[0], b1[0], i / 6), y = lerp(b0[1], b1[1], i / 6);
    g.append(svg("path", { d: `M${(x - 6).toFixed(1)} ${(y - 2.6).toFixed(1)} l12 5.2`, class: "tv-tie" }));
  }
  // 큰길: 연필로 흐리게
  for (const road of [
    [[60, 120], [240, 150], [470, 222]], [[470, 222], [640, 150], [860, 96]], [[560, 60], [566, 190], [540, 248]],
    [[420, 330], [380, 420], [330, 600]], [[90, 420], [240, 440], [400, 452], [478, 440]], [[150, 360], [190, 470], [220, 610]],
  ]) g.append(svg("path", { d: wobble(road.flatMap((p, i) => (i ? along(road[i - 1], p, 3).slice(1) : [p])), r, 2.4), class: "tv-road" }));
  // 지명
  g.append(svg("text", { x: 130, y: 316, class: "tv-name water", transform: "rotate(-3 130 316)" }, "한  강"));
  g.append(svg("text", { x: 340, y: 292, class: "tv-name small", transform: "rotate(-8 340 292)" }, "양화대교"));
  g.append(svg("text", { x: 526, y: 556, class: "tv-name small water" }, "안양천"));
  g.append(svg("text", { x: 690, y: 150, class: "tv-name area" }, "마포"));
  g.append(svg("text", { x: 110, y: 540, class: "tv-name area" }, "목동"));
  // 방위표
  const n = svg("g", { transform: "translate(826 548)", class: "tv-north" });
  n.append(svg("path", { d: "M0 22 L0 -20 M-7 -9 L0 -22 L7 -9" }), svg("text", { x: 0, y: -28 }, "N"));
  g.append(n);
}

// 지금 있는 곳에서 그곳까지: 강을 건너는 길은 다리를 지난다
function routePoints(a, b) {
  const crosses = (a[1] < 270) !== (b[1] < 270);
  if (!crosses) return along(a, b, 4);
  const top = [468, 222], bottom = [420, 330];
  const [n, s] = a[1] < 270 ? [a, b] : [b, a];
  const pts = [...along(n, top, 3), ...along(top, bottom, 2).slice(1), ...along(bottom, s, 3).slice(1)];
  return a[1] < 270 ? pts : pts.reverse();
}

export function openTravel({ root, def, st }) {
  const r = rnd(`${def.save || def.id}-map`);
  const places = placesOpen(def, st);
  const here = places.find((p) => p.here) || null;
  const deadline = nextDeadline?.(def, st) || null;
  let done = null, closed = false, going = false, hot = null;

  const art = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "tv-map", role: "img", "aria-label": "약도" });
  const ground = svg("g", { class: "tv-ground" });
  drawGround(ground, r);
  const routes = svg("g", { class: "tv-routes" });
  const pins = svg("g", { class: "tv-pins" });
  art.append(ground, routes, pins);

  const info = el("div.tv-info");
  const say = (p) => {
    if (!p) return info.replaceChildren(el("span.tv-dim", places.length > 1 ? "갈 곳을 고른다." : "아직 갈 곳을 모른다. 먼저 이곳에서 알아볼 것이 있다."));
    if (p.here) return info.replaceChildren(el("b", p.name), el("span", " · 지금 여기 있다."));
    const arrive = st.minute + p.minutes;
    const late = deadline && arrive >= deadline.at;
    info.replaceChildren(...[el("b", p.name), el("span", ` · ${p.sub || ""}`), el("span.tv-time", `${span(p.minutes)} 걸린다 → ${fmtClock(arrive)}`), late && el("span.tv-late", "늦는다")].filter(Boolean));
  };

  const entries = places.map((p, i) => {
    const [x, y] = p.at;
    const g = svg("g", { class: `tv-pin${p.here ? " here" : ""}${st.visits?.[p.site] ? " been" : ""}`, transform: `translate(${x} ${y})`, tabindex: p.here ? null : 0, "data-id": p.id });
    const left = x > W - 220; // 오른쪽 끝에서는 이름을 왼쪽에 쓴다
    g.append(svg("circle", { r: 26, class: "tv-hit" }));
    g.append(svg("path", { d: ring(9.5, rnd(p.id), 0.9), class: "tv-dot" }));
    if (p.here) g.append(svg("path", { d: ring(16, rnd(`${p.id}h`), 1.3), class: "tv-ring" }));
    const tx = left ? -20 : 20;
    g.append(svg("text", { x: tx, y: -2, class: "tv-label", "text-anchor": left ? "end" : "start" }, p.name));
    g.append(svg("text", { x: tx, y: 15, class: "tv-sub", "text-anchor": left ? "end" : "start" }, p.here ? "지금 여기" : `${p.sub || ""}`));
    // 그곳에 대해 적어 둔 것 (누가 몇 시에 온다)
    const notes = (p.notes || []).filter((n) => lockOpen(n.when, st));
    notes.forEach((n, k) => g.append(svg("text", { x: tx, y: 33 + k * 16, class: "tv-note", "text-anchor": left ? "end" : "start" }, `※ ${n.text}`)));
    if (!p.here) g.append(svg("text", { x: -1, y: 4.5, class: "tv-num", "text-anchor": "middle" }, String(i + 1)));
    pins.append(g);
    // 길: 지금 있는 곳에서 그곳까지
    let path = null, tag = null;
    if (here && !p.here) {
      const pts = routePoints(here.at, p.at);
      path = svg("path", { d: wobble(pts, rnd(`${here.id}>${p.id}`), 2.6), class: "tv-route", pathLength: 100 });
      const mid = pts[Math.floor(pts.length / 2)];
      tag = svg("g", { class: "tv-tag", transform: `translate(${mid[0].toFixed(0)} ${(mid[1] - 14).toFixed(0)}) rotate(${((r() - 0.5) * 6).toFixed(1)})` });
      const label = span(p.minutes);
      tag.append(svg("rect", { x: -(label.length * 7 + 9), y: -12, width: label.length * 14 + 18, height: 23, rx: 2 }), svg("text", { x: 0, y: 5, "text-anchor": "middle" }, label));
      routes.append(path, tag);
    }
    const on = () => {
      if (going) return;
      if (hot !== p.id && !p.here) sfx.pencil?.(0.18);
      hot = p.id;
      for (const e of entries) {
        e.g.classList.toggle("hot", e.p.id === p.id);
        e.path?.classList.toggle("on", e.p.id === p.id);
        e.tag?.classList.toggle("on", e.p.id === p.id);
      }
      say(p);
    };
    g.addEventListener("pointerenter", on);
    g.addEventListener("focus", on);
    g.addEventListener("click", () => go(p.id));
    return { p, g, path, tag, on };
  });

  const sheet = el("div.tv-sheet",
    el("div.tv-head", el("h2", "어디로 가나"), el("span.tv-clock", fmtClock(st.minute))),
    art,
    el("div.tv-foot", info,
      // 본 게임의 지도로 나간다 (세계지도 → 국가 지도 → 사건 → 현장의 거꾸로). 현장의 진행은 저장돼 있다.
      el("a.tv-out", { href: "/?resume", title: "취재를 잠시 멈추고 세계지도로 나간다. 지금까지 한 것은 저장돼 있다." }, "세계지도로 나간다"),
      el("button.tv-stay", { type: "button", onclick: () => close(null) }, here ? `${here.name}에 남는다` : "닫는다", el("kbd", "Esc"))),
  );
  const layer = el("div.tv-layer", { role: "dialog", "aria-label": "약도" }, sheet);

  function close(pick) {
    if (closed) return;
    closed = true;
    window.removeEventListener("keydown", onKey, true);
    layer.classList.add("out");
    setTimeout(() => {
      layer.remove();
      done(pick);
    }, pick ? 80 : 240);
  }
  // 고른다: 연필이 길을 따라 긋고, 그동안 화면이 어두워질 채비를 한다
  function go(id) {
    const e = entries.find((x) => x.p.id === id);
    if (!e || e.p.here || going || closed) return false;
    e.on();
    going = true;
    sheet.classList.add("going");
    e.path?.classList.add("drawn");
    e.g.classList.add("picked");
    sfx.pencil?.(0.7);
    setTimeout(() => close(id), 820);
    return true;
  }
  function onKey(e) {
    e.stopPropagation();
    if (e.code === "Escape") {
      e.preventDefault();
      if (!going) close(null);
      return;
    }
    const n = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
    if (n && entries[n - 1]) {
      e.preventDefault();
      if (hot === entries[n - 1].p.id) go(hot);
      else entries[n - 1].on(); // 한 번 누르면 짚고, 한 번 더 누르면 간다
    } else if (e.code === "Enter" && hot) {
      e.preventDefault();
      go(hot);
    }
  }
  window.addEventListener("keydown", onKey, true);
  say(null);
  root.append(layer);
  sfx.page();
  return Object.assign(new Promise((res) => (done = res)), { api: { go, close: () => close(null), el: layer, places: () => places.map((p) => ({ id: p.id, here: p.here, minutes: p.minutes })) } });
}
