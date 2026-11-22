// 기록을 읽는 화면의 틀 — 공개 정보, 장부, 돈의 흐름, 답안 대조가 함께 쓴다.
// 위쪽 띠(무엇을 찾는가, 시각, 덮기), 아래쪽 쪽지(틀린 까닭, 실마리), 카드가 되는 순간의 연출.
// 판정은 records.js가 한다. 화면은 그 결과를 보여 줄 뿐이다.
import { el } from "./hud.js";
import { fmtClock } from "./state.js";
import { sfx } from "./sfx.js";

export const DW = 1500, DH = 900;
const NS = "http://www.w3.org/2000/svg";
export function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
export const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
// 같은 이름에는 늘 같은 값 (손으로 그은 선의 흔들림)
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
// 붉은 색연필로 두른 동그라미 (가로로 긴 것). 한 획으로 그려지고 끝이 시작점을 조금 지나친다.
export function pencilRing(w, h, seed = "x") {
  const r = hash(seed), a = w / 2, b = h / 2, pts = [];
  for (let i = 0; i <= 26; i++) {
    const t = -Math.PI * 0.62 + (i / 24) * Math.PI * 2, wob = 1 + Math.sin(t * 3 + r * 6) * 0.035 + (i / 24) * 0.03;
    pts.push(`${(a + Math.cos(t) * a * wob).toFixed(1)} ${(b + Math.sin(t) * b * wob).toFixed(1)}`);
  }
  return svg("svg", { class: "p-ring", viewBox: `${-6} ${-6} ${w + 12} ${h + 12}`, width: w + 12, height: h + 12, preserveAspectRatio: "none" },
    svg("path", { d: `M${pts.join(" L")}`, pathLength: 1 }));
}

// { layer, body, side, slip, miss, hint, gain, clock, close, onEsc, onKey } — promise는 덮을 때 풀린다 ("board" | "book" | null)
export function makeFrame({ root, kind, title, sub, prompt, def, st, save = () => {}, spent = 0 }) {
  let done = null, shown = st.minute - spent, gained = 0;
  const frame = { onEsc: null, onKey: null };

  const clockEl = el("span.p-clock");
  const chipN = el("span.p-chip-n");
  const chip = el("button.p-chip", { title: "증거판으로 간다 (B)", onclick: () => close("board") }, el("i"), "증거판", chipN);
  const promptEl = el("div.p-prompt", el("em", "찾을 것"), el("b", prompt || ""));
  const bar = el("div.p-bar",
    el("div.p-title", el("b", title), el("span", sub || "")),
    promptEl,
    el("div.p-bar-right", clockEl, chip, el("button.p-close", { onclick: () => close() }, "덮는다", el("kbd", "Esc"))));
  const body = el("div.p-body");
  const slips = el("div.p-slips");
  const gains = el("div.p-gains");
  const stage = el(`div.p-stage.${kind}`, bar, body, slips, gains);
  const layer = el("div.p-layer", stage);
  root.append(layer);

  frame.layer = layer;
  frame.body = body;
  frame.setPrompt = (text) => (promptEl.lastChild.textContent = text || "");
  // 시계: 시간이 흘렀으면 얼마가 흘렀는지 잠깐 보인다
  frame.clock = () => {
    const spent = st.minute - shown;
    shown = st.minute;
    put(clockEl, fmtClock(st.minute), spent > 0 ? el("small.p-spent", `+${spent}분`) : null);
    if (spent > 0) setTimeout(() => clockEl.querySelector(".p-spent")?.remove(), 1800);
  };
  frame.slip = (text, kind2 = "plain", ms = 4200) => {
    const s = el(`div.p-slip.${kind2}`, text);
    s.addEventListener("pointerdown", () => s.remove());
    slips.append(s);
    while (slips.children.length > 3) slips.firstChild.remove();
    setTimeout(() => s.classList.add("out"), ms);
    setTimeout(() => s.remove(), ms + 400);
    return s;
  };
  frame.miss = (res) => {
    sfx.wrong();
    frame.slip(res.text, "miss", 5200);
    if (res.hint) setTimeout(() => frame.slip("수첩의 '물음'에 실마리가 하나 적혔다.", "hint", 4200), 700);
    save();
  };
  // 찾은 것이 카드가 되는 순간: 가운데에 한 장이 놓였다가 증거판 쪽으로 날아간다
  frame.gain = (res, more = null) => {
    const ids = res.fresh?.evidence || [];
    ids.forEach((id, i) => {
      const ev = def.evidence[id] || { title: id, kind: "" };
      const note = ev.kind === "추론";
      const card = el(`div.p-gain${note ? ".note" : ""}`, { style: { animationDelay: `${i * 180}ms` } },
        el("i.p-gain-pin"), el("em", id), el("b", ev.title), el("p", ev.text || ""), el("small", note ? "쪽지가 됐다 · 증거판에 붙였다" : "카드가 됐다 · 증거판에 꽂았다"));
      gains.append(card);
      setTimeout(() => card.classList.add("fly"), 2600 + i * 180);
      setTimeout(() => {
        card.remove();
        gained++;
        chipN.textContent = String(gained);
        chip.classList.add("has");
      }, 3250 + i * 180);
    });
    if (ids.length) {
      sfx.right();
      setTimeout(() => sfx.pin(), 240);
    }
    if (more) setTimeout(() => frame.slip(more, "note", 5600), 500);
    save();
  };

  const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  const onKey = (e) => {
    if (e.code === "Tab") e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.code === "Escape") {
      if (typing(e)) return void e.target.blur();
      if (!frame.onEsc?.()) close();
    } else if (typing(e)) return;
    else if (e.code === "Tab") close("book");
    else if (e.code === "KeyB") close("board");
    else frame.onKey?.(e);
  };
  function close(next) {
    if (!done) return;
    window.removeEventListener("keydown", onKey, true);
    ro.disconnect();
    layer.classList.add("out");
    sfx.paper();
    save();
    const d = done;
    done = null;
    setTimeout(() => {
      layer.remove();
      d(next || null);
    }, 240);
  }
  frame.close = close;
  // 1500 x 900으로 짜고, 화면에 맞춰 통째로 키우거나 줄인다
  const fit = () => {
    const k = Math.max(0.42, Math.min(1.7, (layer.clientWidth || DW) / DW, (layer.clientHeight || DH) / DH));
    stage.style.zoom = k.toFixed(3);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(layer);
  fit();
  window.addEventListener("keydown", onKey, true);
  frame.clock();
  sfx.paper();
  frame.promise = new Promise((r) => (done = r));
  return frame;
}

// 금액을 장부의 말로: 24000000 → "2,400만", 330000 → "33만", 96000 → "9만 6천"
export function won(n) {
  if (n >= 10000) {
    const man = Math.floor(n / 10000), rest = n % 10000;
    return `${man.toLocaleString("ko-KR")}만${rest >= 1000 ? ` ${Math.floor(rest / 1000)}천` : ""}`;
  }
  return n.toLocaleString("ko-KR");
}
const DAY = { "-2": "수", "-1": "목", 0: "금", 1: "토", 2: "일", 3: "월" };
export const dayOf = (minute) => DAY[Math.floor(minute / 1440)] ?? "";
export const hhmm = (minute) => {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const CIRCLED = ["", "①", "②", "③", "④", "⑤"];
