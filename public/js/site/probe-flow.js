// 돈의 흐름 — 통장 사본을 시간 축 위에 펼친다. 계좌마다 한 줄, 거래마다 화살 하나.
// 들어온 돈은 위에서 내려오고 나간 돈은 아래로 떨어진다. 사본이 있는 상대 계좌는 마디를 펼쳐 더 따라갈 수 있다.
// 이 화면의 '아하': 같은 금액 넷이 한 주에 들어와, 이튿날 한 덩이로 나가고, 한 사람의 계좌에서 멈춘다.
import { el } from "./hud.js";
import { makeFrame, svg, put, hash, won } from "./probe.js";
import { flowView, flowOpen, flowMark, flowSubmit } from "./records.js";
import { sfx } from "./sfx.js";

const W = 1150, H = 740, PADX = 46, TOP = 232, LANE_GAP = 316, ROW = 84, GAP = 10;
const dayNo = (s) => {
  const [m, d] = s.split("-").map(Number);
  return Math.round((Date.UTC(2026, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000);
};
const label = (s) => {
  const [m, d] = s.split("-").map(Number);
  return `${m}/${d}`;
};
const textW = (t, size) => [...String(t)].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? size : size * 0.56), 0);
// 이름표를 한 줄에 겹치지 않게 벌려 놓는다. 차례는 날짜 그대로라서 화살이 서로 엇갈리지 않는다.
function spread(items, min, max) {
  const blocks = [];
  const fit = (b) => (b.c = Math.max(min + b.w / 2, Math.min(max - b.w / 2, b.c)));
  for (const it of items) {
    blocks.push({ items: [it], w: it.w, c: it.x });
    fit(blocks.at(-1));
    while (blocks.length > 1) {
      const p = blocks.at(-2), q = blocks.at(-1);
      if (p.c + p.w / 2 + GAP <= q.c - q.w / 2) break;
      const all = [...p.items, ...q.items], m = { items: all, w: p.w + GAP + q.w, c: all.reduce((n, x) => n + x.x, 0) / all.length };
      fit(m);
      blocks.splice(-2, 2, m);
    }
  }
  for (const b of blocks) {
    let x = b.c - b.w / 2;
    for (const it of b.items) {
      it.lx = x + it.w / 2;
      x += it.w + GAP;
    }
  }
}
// 화살: 선 하나와 끝의 촉
function arrow(x0, y0, x1, y1) {
  const a = Math.atan2(y1 - y0, x1 - x0), c = Math.cos(a), sn = Math.sin(a), bx = x1 - c * 10, by = y1 - sn * 10;
  return [svg("path", { d: `M${x0.toFixed(1)} ${y0.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}`, class: "f-arrow" }),
    svg("path", { d: `M${x1.toFixed(1)} ${y1.toFixed(1)} L${(bx - sn * 5).toFixed(1)} ${(by + c * 5).toFixed(1)} L${(bx + sn * 5).toFixed(1)} ${(by - c * 5).toFixed(1)} Z`, class: "f-head" })];
}

export function openFlow({ root, def, st, id, save = () => {}, spent = 0 }) {
  const FL = def.records.flows[id];
  const F = makeFrame({ root, kind: "flow", title: FL.title, sub: FL.source, prompt: FL.prompt, def, st, save, spent });
  let bad = [];
  const d0 = dayNo(FL.from), d1 = dayNo(FL.to);
  const X = (on) => PADX + ((dayNo(on) - d0) / (d1 - d0)) * (W - PADX * 2);

  const art = svg("svg", { class: "f-art", viewBox: `0 0 ${W} ${H}` });
  const noteEl = el("div.f-note");
  const foot = el("div.f-foot");
  F.body.append(el("div.f-wrap", el("div.f-main", el("div.f-paper", art), foot), el("div.f-side", noteEl)));

  function draw() {
    const v = flowView(def, st, id);
    const laneY = new Map(v.lanes.map((a, i) => [a.id, TOP + i * LANE_GAP]));
    const kids = [];
    // 날짜 눈금: 한 주마다
    for (let d = d0; d <= d1; d++) {
      const date = new Date(Date.UTC(2026, 0, 1) + d * 86400000), m = date.getUTCMonth() + 1, dd = date.getUTCDate();
      const x = PADX + ((d - d0) / (d1 - d0)) * (W - PADX * 2);
      if (dd === 1 || date.getUTCDay() === 1) kids.push(svg("line", { x1: x, x2: x, y1: 34, y2: H - 16, class: dd === 1 ? "f-grid month" : "f-grid" }), svg("text", { x: x + 4, y: 28, class: dd === 1 ? "f-date month" : "f-date" }, dd === 1 ? `${m}월 1일` : `${m}/${dd}`));
    }
    // 계좌의 줄
    for (const a of v.lanes) {
      const y = laneY.get(a.id);
      kids.push(svg("rect", { x: PADX - 26, y: y - 15, width: W - PADX * 2 + 52, height: 30, rx: 3, class: "f-lane" }),
        svg("text", { x: PADX - 14, y: y + 5, class: "f-lane-name" }, a.name), svg("text", { x: W - PADX + 14, y: y + 4, class: "f-lane-no", "text-anchor": "end" }, a.no));
    }
    // 거래: 계좌의 줄 위쪽에는 들어온 돈, 아래쪽에는 나간 돈. 이름표는 날짜 차례대로 한 줄로 벌려 놓는다.
    const sorted = [...v.tx].sort((a, b) => dayNo(a.on) - dayNo(b.on));
    const rows = new Map(); // "계좌:in|out" → 이름표들
    const items = sorted.map((t) => {
      const big = t.amount >= 10000000, mid = !big && t.amount >= 1000000;
      const out = laneY.has(t.from), lane = out ? t.from : t.to, amt = won(t.amount);
      const who = `${label(t.on)} · ${v.name(out ? t.to : t.from)}`;
      const bw = Math.max(44, textW(amt, big ? 15.5 : 13) + 18);
      const it = { t, big, mid, out, lane, amt, who, bw, x: X(t.on), w: Math.max(bw, textW(who, 11.5)) + 2, y: laneY.get(lane) + (out ? ROW : -ROW) };
      const key = `${lane}:${out ? "out" : "in"}`;
      (rows.get(key) || rows.set(key, []).get(key)).push(it);
      return it;
    });
    for (const list of rows.values()) spread(list, PADX - 20, W - PADX + 20);
    for (const it of items) {
      const { t, out, lane } = it, ly = laneY.get(lane), x = it.x, bx = it.lx, by = it.y;
      const cls = `f-tx${t.marked ? " mark" : ""}${bad.includes(t.id) ? " bad" : ""}${it.big ? " big" : it.mid ? " mid" : ""}`;
      const g = svg("g", { class: cls, "data-tx": t.id });
      g.append(svg("circle", { cx: x, cy: ly + (out ? 15 : -15), r: 2.6, class: "f-tick" }));
      if (out) g.append(...arrow(x, ly + 15, bx, by - 15), svg("text", { x: bx, y: by + 30, class: "f-who", "text-anchor": "middle" }, it.who));
      else g.append(...arrow(bx, by + 15, x, ly - 16), svg("text", { x: bx, y: by - 21, class: "f-who", "text-anchor": "middle" }, it.who));
      // 펼쳐 놓은 다른 계좌로 간 돈은 그 줄까지 이어진다
      const toY = out ? laneY.get(t.to) : null;
      if (toY != null) g.append(...arrow(bx, by + 40, x, toY - 16), svg("circle", { cx: x, cy: toY - 15, r: 2.6, class: "f-tick" }));
      g.append(svg("rect", { x: bx - it.bw / 2, y: by - 14, width: it.bw, height: 28, rx: 3, class: "f-amt-bg" }), svg("text", { x: bx, y: by + 5.5, class: "f-amt", "text-anchor": "middle" }, it.amt),
        svg("title", {}, `${label(t.on)} · ${v.name(t.from)} → ${v.name(t.to)} · ${t.amount.toLocaleString("ko-KR")}원 · ${t.memo}`),
        svg("text", { x: bx, y: by + (out ? 44 : -35), class: "f-memo", "text-anchor": "middle" }, toY != null ? "" : `‘${t.memo}’`));
      if (t.marked) {
        const r = hash(t.id), rx = it.bw / 2 + 9, ry = 20, pts = [];
        for (let i = 0; i <= 26; i++) {
          const a = -2 + (i / 24) * Math.PI * 2, k = 1 + Math.sin(a * 3 + r * 6) * 0.04 + (i / 24) * 0.04;
          pts.push(`${(bx + Math.cos(a) * rx * k).toFixed(1)} ${(by + Math.sin(a) * ry * k).toFixed(1)}`);
        }
        g.append(svg("path", { d: `M${pts.join(" L")}`, class: "f-ring", pathLength: 1 }));
      }
      g.addEventListener("click", () => mark(t.id));
      kids.push(g);
    }
    // 펼칠 수 있는 마디: 사본이 있는 상대 계좌. 그 계좌로 간 돈의 이름표 아래에 놓인다.
    for (const a of v.stubs) {
      const it = items.find((x) => x.t.to === a.id || x.t.from === a.id);
      const x = Math.max(PADX + 110, Math.min(W - PADX - 110, it.lx)), y = it.y + (it.out ? 104 : -104);
      const g = svg("g", { class: "f-stub", "data-acc": a.id },
        svg("path", { d: `M${it.lx} ${it.y + (it.out ? 40 : -40)} L${x} ${y + (it.out ? -30 : 30)}`, class: "f-stub-line" }),
        svg("rect", { x: x - 124, y: y - 30, width: 248, height: 60, rx: 4 }),
        svg("text", { x: x - 110, y: y - 7, class: "f-stub-name" }, a.name), svg("text", { x: x - 110, y: y + 14, class: "f-stub-sub" }, `${a.no} · 사본이 있다`),
        svg("text", { x: x + 110, y: y + 14, class: "f-stub-go", "text-anchor": "end" }, `펼친다 · ${a.minutes ?? 3}분`));
      g.addEventListener("click", () => open(a.id));
      kids.push(g);
    }
    put(art, kids);

    const marked = sorted.filter((t) => t.marked);
    put(foot,
      el("span", `거래 ${v.tx.length}건`, marked.length ? el("b", ` · 짚은 것 ${marked.length}`) : null),
      v.done ? el("span.l-done", "카드로 만들었다") : el("button.l-submit", { disabled: !marked.length || null, onclick: () => submit() }, "짚은 줄기를 오려 둔다"));
    put(noteEl,
      el("h5", "찾을 것"), el("p.l-ask", FL.prompt),
      el("h5", "짚은 줄기"),
      marked.length ? el("ol.f-chain", marked.map((t) => el("li", { onclick: () => mark(t.id), title: "누르면 지운다" }, el("time", label(t.on)), el("span", `${v.name(t.from)} → ${v.name(t.to)}`), el("b", won(t.amount)))))
        : el("p.l-dim", "화살의 금액을 누르면 붉은 색연필로 짚는다. 다시 누르면 지운다."),
      marked.length ? el("p.f-sum", "짚은 돈 ", el("b", won(marked.filter((t) => !v.isOpen(t.from)).reduce((s, t) => s + t.amount, 0))), " 이 들어왔다") : null,
      el("p.l-dim.l-rule", "위에서 내려오는 화살은 들어온 돈, 아래로 떨어지는 화살은 나간 돈이다. 이름과 계좌번호는 가려져 있다."));
    F.clock();
  }
  function mark(txId) {
    if (!flowMark(def, st, id, txId)) return;
    bad = [];
    sfx.pencil(0.22);
    save();
    draw();
  }
  function open(accId) {
    const res = flowOpen(def, st, id, accId);
    if (!res.ok) return void (res.text && F.slip(res.text, "plain"));
    sfx.page();
    save();
    draw();
  }
  function submit() {
    const res = flowSubmit(def, st, id);
    if (!res.ok) {
      bad = res.rows || [];
      F.miss(res);
      return draw();
    }
    F.gain(res);
    draw();
  }
  draw();
  return Object.assign(F.promise, { api: { mark, open, submit, close: F.close, view: () => flowView(def, st, id), el: F.layer } });
}
