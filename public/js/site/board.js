// 증거판 — 코르크판 위에 카드를 꽂고, 붉은 색연필의 교정 부호로 잇는다.
// 옥탑방 벽의 판을 현장에서는 덮개로 펼친다. 펼친 동안 시계는 멈춘다(추리를 틀렸을 때만 흐른다).
//   카드: 사진(흔적·물건) / 문서 / 진술(수첩에서 찢은 줄) / 추론 쪽지
//   잇기: 두 장을 고르거나 연필 손잡이를 끌어 → 부호 넷 가운데 하나
//   아래쪽: 시간 띠(시각이 있는 카드를 올린다), 원고지(빈칸 추리)
// 판정은 reason.js가 한다. 이 파일은 그 결과를 그릴 뿐이다.
import { el } from "./hud.js";
import { RELS, REL_ORDER, boardOf, ownedCards, tryLink, compareView, pickCompare, stripAdd, stripRemove, stripView, stripX, dedOpen, dedParts, dedSlots, dedState, setSlot, slotPhrase, checkDeduction } from "./reason.js";
import { currentQuestion, fmtClock } from "./state.js";
import { sfx } from "./sfx.js";

const VW = 1600, BAR = 58, DOCK = 222, PAD = 20, MAIN_W = VW - PAD * 2;
const SIZE = { photo: [132, 156], doc: [174, 128], stmt: [200, 92], note: [180, 106] };
const STRIP_W = 1010, SHEET_W = MAIN_W - STRIP_W - 16;
const NS = "http://www.w3.org/2000/svg";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const put = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
// 같은 이름에는 늘 같은 값 (카드의 기울기, 선의 흔들림)
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
const DAY = { "-2": "수요일 · 예비소집", "-1": "목요일 · 수능", 0: "금요일", 1: "토요일", 2: "일요일" };
const hhmm = (m) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

// ── 교정 부호의 모양 ──
// p, q: 두 끝점. 돌려주는 값: path의 d 목록 (첫 줄이 몸통)
function markPaths(rel, p, q, seed, k = 1) {
  const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const bend = (seed - 0.5) * len * 0.07;
  const m = [(p[0] + q[0]) / 2 + nx * bend * 0.5, (p[1] + q[1]) / 2 + ny * bend * 0.5];
  const curve = (a, b, off = 0) => `M${(a[0] + nx * off).toFixed(1)} ${(a[1] + ny * off).toFixed(1)} Q${((a[0] + b[0]) / 2 + nx * (bend + off)).toFixed(1)} ${((a[1] + b[1]) / 2 + ny * (bend + off)).toFixed(1)} ${(b[0] + nx * off).toFixed(1)} ${(b[1] + ny * off).toFixed(1)}`;
  const stroke = (c, ax, ay, l) => `M${(c[0] - ax * l).toFixed(1)} ${(c[1] - ay * l).toFixed(1)} L${(c[0] + ax * l * 1.08).toFixed(1)} ${(c[1] + ay * l * 1.08).toFixed(1)}`;
  if (rel === "same") return { d: [curve(p, q, 3.4 * k), curve(p, q, -3.4 * k)], mid: m };
  if (rel === "contra") {
    const c = Math.SQRT1_2;
    return { d: [curve(p, q), stroke(m, ux * c + nx * c, uy * c + ny * c, 13 * k), stroke(m, ux * c - nx * c, uy * c - ny * c, 13 * k)], mid: m };
  }
  if (rel === "time") {
    const back = (a) => [q[0] - (ux * Math.cos(a) - uy * Math.sin(a)) * 16 * k, q[1] - (uy * Math.cos(a) + ux * Math.sin(a)) * 16 * k];
    const b1 = back(0.42), b2 = back(-0.42);
    return { d: [curve(p, q), `M${b1[0].toFixed(1)} ${b1[1].toFixed(1)} L${q[0].toFixed(1)} ${q[1].toFixed(1)} L${b2[0].toFixed(1)} ${b2[1].toFixed(1)}`, stroke(p, nx, ny, 6 * k)], mid: m };
  }
  // 원문: 가운데에서 한 번 고리를 짓는다
  const a = [m[0] - ux * 5 * k, m[1] - uy * 5 * k], b = [m[0] + ux * 5 * k, m[1] + uy * 5 * k], R = (12 * k).toFixed(1);
  return { d: [`M${p[0].toFixed(1)} ${p[1].toFixed(1)} L${a[0].toFixed(1)} ${a[1].toFixed(1)} A${R} ${R} 0 1 1 ${b[0].toFixed(1)} ${b[1].toFixed(1)} L${q[0].toFixed(1)} ${q[1].toFixed(1)}`], mid: m };
}
// 부호 고르개에 넣는 작은 그림
function relIcon(rel) {
  const { d } = markPaths(rel, [6, rel === "source" ? 21 : 16], [58, rel === "source" ? 21 : 16], 0.5, 0.6);
  return svg("svg", { viewBox: "0 0 64 32", class: "b-rel-icon" }, d.map((x) => svg("path", { d: x })));
}

export function openBoard({ root, def, st, photos = {}, save = () => {} }) {
  const board = boardOf(st);
  let VH = 900, k = 1, done = null;
  let sel = [], drag = null, cmp = null, locked = false;
  const cardEls = new Map();
  const freshLinks = new Set();

  const read = el("div.b-read");
  const qEl = el("div.b-q");
  const clockEl = el("span.b-clock");
  const bar = el("div.b-bar",
    el("div.b-title", el("b", "증거판"), el("span", "카드를 끌어 옮긴다 · 두 장을 누르거나 연필을 끌어 잇는다")),
    qEl,
    el("div.b-bar-right", clockEl, el("button.b-close", { onclick: () => close() }, "판을 덮는다", el("kbd", "B"))));
  const linksSvg = svg("svg", { class: "b-links" });
  const liveSvg = svg("svg", { class: "b-live" });
  const cardsEl = el("div.b-cards");
  const slips = el("div.b-slips");
  const picker = el("div.b-picker.off");
  const stamp = el("div.b-stamp", { title: "도장 자리" }, el("i"), el("span", "도장 자리"));
  const main = el("div.b-main", stamp, linksSvg, cardsEl, liveSvg, slips, picker, read);
  const stripEl = el("div.b-strip");
  const sheetEl = el("div.b-sheet");
  const dock = el("div.b-dock", stripEl, sheetEl);
  const stage = el("div.b-stage", bar, main, dock);
  const layer = el("div.b-layer", stage);
  root.append(layer);

  const mainH = () => VH - BAR - DOCK - PAD;
  const ev = (id) => def.evidence[id];
  const photoOf = (id) => photos[id] || ev(id).photo || null;
  const typeOf = (id) => (ev(id).kind === "진술" ? "stmt" : ev(id).kind === "추론" ? "note" : photoOf(id) && !ev(id).noPhoto ? "photo" : "doc");
  const sizeOf = (id) => SIZE[typeOf(id)];
  const center = (id) => [board.pos[id][0] + sizeOf(id)[0] / 2, board.pos[id][1] + sizeOf(id)[1] / 2];

  // ── 자리 ──
  function hitsAny(x, y, w, h, skip, gap = 10) {
    if (x + w > MAIN_W - 160 && y + h > mainH() - 160) return true; // 도장 자리
    for (const [id, p] of Object.entries(board.pos)) {
      if (id === skip || !(id in st.evidence)) continue;
      const [ow, oh] = sizeOf(id);
      if (x < p[0] + ow + gap && x + w + gap > p[0] && y < p[1] + oh + gap * 0.6 && y + h + gap * 0.6 > p[1]) return true;
    }
    return false;
  }
  // 빈 곳을 찾는다. near가 있으면 그 가까이, 없으면 이어받은 카드의 오른쪽부터 줄지어.
  function freeSpot(id, near) {
    const [w, h] = sizeOf(id), H = mainH();
    let best = null;
    for (let y = 18; y + h <= H - 10; y += 22) {
      for (let x = 18; x + w <= MAIN_W - 10; x += 26) {
        if (hitsAny(x, y, w, h, id, near ? 14 : 58)) continue;
        const d = near ? Math.hypot(x + w / 2 - near[0], y + h / 2 - near[1]) : (x < 880 ? 6000 : 0) + Math.floor(y / 172) * 1000 + x;
        if (!best || d < best.d) best = { x, y, d };
      }
    }
    return best ? [best.x, best.y] : [MAIN_W / 2 - w / 2 + (hash(id) - 0.5) * 240, H / 2 - h / 2 + (hash(id + "y") - 0.5) * 160];
  }
  function placeAll() {
    for (const id of ownedCards(st)) {
      if (board.pos[id] || !ev(id)) continue;
      const link = board.links[id];
      const near = link && board.pos[link.a] && board.pos[link.b] ? [(center(link.a)[0] + center(link.b)[0]) / 2 + 30, (center(link.a)[1] + center(link.b)[1]) / 2 + 50] : null;
      board.pos[id] = freeSpot(id, near);
    }
  }
  function clampAll() {
    const H = mainH();
    for (const id of Object.keys(board.pos)) {
      if (!(id in st.evidence) || !ev(id)) continue;
      const [w, h] = sizeOf(id);
      board.pos[id] = [clamp(board.pos[id][0], 4, MAIN_W - w - 4), clamp(board.pos[id][1], 4, H - h - 4)];
    }
  }

  // ── 카드 ──
  function makeCard(id) {
    const e = ev(id), type = typeOf(id);
    let body;
    if (type === "photo") {
      const img = el("img", { src: photoOf(id), alt: "", draggable: "false" });
      img.addEventListener("error", () => img.replaceWith(el("div.b-nophoto", e.kind)));
      body = [el("div.b-photo", img), el("div.b-cap", el("em", id), el("b", e.title))];
    } else if (type === "stmt") body = [el("p", e.text.replace(/^"|"$/g, "")), el("small", `— ${e.who || "진술"}`), el("em", id)];
    else if (type === "note") body = [el("em", id), el("b", e.title), el("p", e.text)];
    else body = [el("small", e.source || e.kind), el("b", e.head || e.title), el("p", e.head ? e.title : e.text), el("em", id)];
    const refuted = e.refutedBy && e.refutedBy in st.evidence;
    const card = el(`div.b-card.${type}${e.kind === "기사" ? ".news" : ""}${refuted ? ".refuted" : ""}`, { "data-id": id },
      type === "note" ? el("i.b-clip") : el("i.b-pin"), ...body,
      el("button.b-pencil", { title: "끌어서 다른 카드와 잇는다", "aria-label": "잇는다" }));
    card.style.setProperty("--r", `${((hash(id) - 0.5) * (type === "note" ? 5 : 4)).toFixed(2)}deg`);
    card.style.width = `${SIZE[type][0]}px`;
    card.style.height = `${SIZE[type][1]}px`;
    return card;
  }
  function moveCard(id) {
    const c = cardEls.get(id);
    if (!c) return;
    c.style.left = `${board.pos[id][0]}px`;
    c.style.top = `${board.pos[id][1]}px`;
  }
  function drawCards() {
    placeAll();
    clampAll();
    const fresh = [];
    for (const id of ownedCards(st)) {
      if (!ev(id)) continue;
      let c = cardEls.get(id);
      if (!c) {
        c = makeCard(id);
        cardEls.set(id, c);
        cardsEl.append(c);
        if (!board.seen.includes(id)) fresh.push(id);
      }
      moveCard(id);
    }
    // 새로 온 카드는 차례로 꽂힌다
    fresh.forEach((id, i) => {
      const c = cardEls.get(id);
      c.classList.add("drop");
      c.style.animationDelay = `${180 + i * 110}ms`;
      setTimeout(() => sfx.pin(), 330 + i * 110);
      board.seen.push(id);
    });
  }

  // ── 이은 선 ──
  function ends(a, b) {
    const ca = center(a), cb = center(b);
    const clip = (c, id, to) => {
      const [w, h] = sizeOf(id), dx = to[0] - c[0], dy = to[1] - c[1];
      const t = Math.min((w / 2 + 7) / Math.abs(dx || 1e-6), (h / 2 + 7) / Math.abs(dy || 1e-6));
      return t >= 0.5 ? [c[0] + dx * 0.3, c[1] + dy * 0.3] : [c[0] + dx * t, c[1] + dy * t];
    };
    return [clip(ca, a, cb), clip(cb, b, ca)];
  }
  function linkGroup(a, b, rel, cls, title) {
    const [p, q] = ends(a, b);
    const { d, mid } = markPaths(rel, p, q, hash(a + b));
    const g = svg("g", { class: `b-link ${rel} ${cls || ""}` });
    d.forEach((x, i) => {
      g.append(svg("path", { d: x, pathLength: 1, class: "soft", style: `animation-delay:${i * 0.16}s` }), svg("path", { d: x, pathLength: 1, style: `animation-delay:${i * 0.16}s` }));
    });
    if (title) g.append(svg("circle", { cx: mid[0], cy: mid[1], r: 16, class: "b-hit" }, svg("title", {}, title)));
    g.mid = mid;
    return g;
  }
  function drawLinks() {
    linksSvg.replaceChildren();
    const all = [...Object.entries(board.links).map(([id, l]) => ({ id, ...l, main: true })), ...board.more];
    for (const l of all) {
      if (!board.pos[l.a] || !board.pos[l.b] || !(l.a in st.evidence) || !(l.b in st.evidence)) continue;
      const g = linkGroup(l.a, l.b, l.rel, freshLinks.has(`${l.a}|${l.b}`) ? "draw" : "", `${RELS[l.rel].label} → 「${ev(l.id)?.title || l.id}」`);
      // 부호에서 쪽지로 가는 가는 줄
      if (l.main && board.pos[l.id]) {
        const c = center(l.id);
        linksSvg.append(svg("path", { d: `M${g.mid[0].toFixed(1)} ${g.mid[1].toFixed(1)} L${c[0].toFixed(1)} ${c[1].toFixed(1)}`, class: "b-thread" }));
      }
      linksSvg.append(g);
    }
  }

  // ── 쪽지 한 장 (판 위의 말) ──
  function slip(x, y, text, kind = "", ms = 3600) {
    const s = el(`div.b-slip.${kind || "plain"}`, text);
    s.style.left = `${clamp(x, 130, MAIN_W - 130)}px`;
    s.style.top = `${clamp(y, 30, mainH() + 150)}px`;
    s.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      s.remove();
    });
    slips.append(s);
    setTimeout(() => s.classList.add("out"), ms);
    setTimeout(() => s.remove(), ms + 400);
    return s;
  }
  const between = (a, b) => [(center(a)[0] + center(b)[0]) / 2, (center(a)[1] + center(b)[1]) / 2];
  // 두 카드의 아래 (말을 얹을 자리)
  const below = (a, b) => [between(a, b)[0], Math.max(board.pos[a][1] + sizeOf(a)[1], board.pos[b][1] + sizeOf(b)[1]) + 34];

  // ── 고르기와 잇기 ──
  function setSel(next) {
    sel = next;
    for (const [id, c] of cardEls) c.classList.toggle("sel", sel.includes(id));
    if (sel.length === 2) showPicker(sel[0], sel[1]);
    else picker.classList.add("off");
  }
  function showPicker(a, b) {
    const [mx, my] = between(a, b);
    picker.replaceChildren(
      el("div.b-pk-head", el("span", `「${ev(a).title}」`), el("button.b-pk-swap", { title: "순서를 바꾼다", onclick: () => setSel([b, a]) }, "⇄"), el("span", `「${ev(b).title}」`)),
      el("div.b-pk-q", "둘은 무슨 사이인가"),
      el("div.b-pk-rels", REL_ORDER.map((rel) => el("button.b-pk-rel", { onclick: () => choose(rel) }, relIcon(rel), el("b", RELS[rel].label), el("small", rel === "time" ? "앞의 것이 먼저" : RELS[rel].sub), el("kbd", RELS[rel].key)))),
      el("button.b-pk-cancel", { onclick: () => setSel([]) }, "그만둔다"));
    picker.classList.remove("off");
    picker.style.left = `${clamp(mx, 190, MAIN_W - 190)}px`;
    picker.style.top = `${clamp(my + 70, 20, mainH() - 150)}px`;
  }
  async function choose(rel) {
    if (sel.length !== 2 || locked) return;
    const [a, b] = sel;
    setSel([]);
    const res = tryLink(def, st, a, b, rel);
    const [mx, my] = below(a, b);
    if (res.ok && res.compare) return openCompare(res.compare);
    if (res.ok) return celebrate(res, a, b);
    if (res.kind === "dup" || res.kind === "order") {
      sfx.paper();
      return void slip(mx, my, res.text, "plain");
    }
    // 그었다가 지운다
    locked = true;
    const ghost = linkGroup(a, b, rel, "ghost");
    linksSvg.append(ghost);
    sfx.pencil(0.36);
    await sleep(520);
    sfx.wrong();
    ghost.classList.add("erase");
    slip(mx, my, res.kind === "rel" ? res.text : `이어지지 않는다. ${res.text}`, "miss", 4600);
    if (res.hint) setTimeout(() => slip(mx, my + 64, "수첩의 '물음'에 실마리가 하나 적혔다.", "hint", 4200), 700);
    await sleep(520);
    ghost.remove();
    locked = false;
    save();
  }
  // 이어졌다: 부호가 그어지고, 쪽지가 붙는다
  async function celebrate(res, a, b) {
    locked = true;
    freshLinks.add(`${a}|${b}`);
    drawLinks();
    sfx.pencil(0.5);
    await sleep(620);
    freshLinks.clear(); // 한 번 그어진 선은 다시 그리지 않는다
    if (!res.again) {
      board.seen.push(res.id);
      placeAll();
      const c = makeCard(res.id);
      cardEls.set(res.id, c);
      cardsEl.append(c);
      moveCard(res.id);
      c.classList.add("born");
      drawLinks();
      sfx.right();
      slip(center(res.id)[0], center(res.id)[1] + sizeOf(res.id)[1] / 2 + 34, `쪽지가 붙었다 · ${ev(res.id).title}`, "note", 3800);
      for (const [id, c2] of cardEls) c2.classList.toggle("refuted", Boolean(ev(id).refutedBy && ev(id).refutedBy in st.evidence));
    } else {
      sfx.paper();
      slip(...below(a, b), `같은 결론에 닿는 다른 길이다 · ${ev(res.id).title}`, "note");
    }
    drawSheet();
    drawBar();
    save();
    locked = false;
    if (res.close) {
      await sleep(1900);
      close();
    }
  }

  // ── 판본 비교: 원문과 기사를 겹쳐 놓고, 달라진 곳을 짚는다 ──
  function openCompare(linkId) {
    const view = compareView(def, linkId);
    const feedback = el("div.b-cmp-fb", "표시된 곳 가운데 하나를 누른다 · 붉은 것은 사라진 말, 푸른 것은 덧붙은 말");
    const sheet = (side, e, toks) => {
      const p = el("p");
      let run = null, mark = null, n = 0;
      for (const t of toks) {
        if (t.br) {
          p.append(el("br"), el("span.b-cmp-gap"));
          run = null;
          continue;
        }
        if (t.run == null) {
          p.append(`${t.text} `);
          run = null;
        } else {
          if (run !== t.run) {
            run = t.run;
            mark = el(`mark.b-run.${side === "left" ? "del" : "add"}`, { "data-run": run, style: { animationDelay: `${0.7 + n++ * 0.28}s` }, onclick: (ev2) => pick(Number(ev2.currentTarget.dataset.run), ev2.currentTarget) });
            p.append(mark, " ");
            mark.textContent = t.text;
          } else mark.textContent += ` ${t.text}`;
        }
      }
      return el(`div.b-cmp-sheet.${side}${e.kind === "기사" ? ".news" : ""}`, el("small", e.source || e.kind), el("h4", e.head || e.title), p, el("i.b-cmp-tag", side === "left" ? "원문" : "옮긴 글"));
    };
    cmp = el("div.b-compare",
      el("div.b-cmp-prompt", el("em", "판본 비교"), el("b", view.prompt)),
      el("div.b-cmp-sheets", sheet("left", ev(view.a), view.left), sheet("right", ev(view.b), view.right)),
      el("div.b-cmp-foot", feedback, el("button.b-cmp-close", { onclick: () => closeCompare() }, "그만둔다", el("kbd", "Esc"))));
    layer.append(cmp);
    sfx.paper();
    setTimeout(() => cmp && sfx.pencil(0.9), 720);
    async function pick(run, node) {
      if (locked) return;
      const res = pickCompare(def, st, linkId, run);
      if (!res.ok) {
        node.classList.remove("shake");
        void node.offsetWidth;
        node.classList.add("shake");
        feedback.textContent = res.text;
        feedback.classList.add("miss");
        sfx.wrong();
        save();
        return;
      }
      locked = true;
      node.classList.add("hit");
      feedback.classList.remove("miss");
      feedback.textContent = "기사는 이 문장을 지웠다.";
      sfx.pencil(0.6);
      await sleep(1500);
      closeCompare();
      locked = false;
      celebrate(res, view.a, view.b);
    }
  }
  function closeCompare() {
    cmp?.remove();
    cmp = null;
  }

  // ── 시간 띠 ──
  function drawStrip() {
    const view = stripView(def, st), W = STRIP_W - 30, x0 = 15, base = 150, H = DOCK - 22;
    const X = (m) => x0 + stripX(view, m) * W;
    const g = svg("svg", { viewBox: `0 0 ${STRIP_W} ${H}`, width: STRIP_W, height: H });
    g.append(svg("defs", {}, svg("pattern", { id: "b-hatch", width: 7, height: 7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(38)" }, svg("line", { x1: 0, y1: 0, x2: 0, y2: 7, class: "hatch" }))));
    // 날의 경계와 이름
    for (let d = Math.floor(view.from / 1440); d <= Math.floor(view.to / 1440); d++) {
      const a = Math.max(view.from, d * 1440), b = Math.min(view.to, (d + 1) * 1440);
      if (d * 1440 > view.from) g.append(svg("line", { x1: X(d * 1440), x2: X(d * 1440), y1: 26, y2: base + 30, class: "day" }));
      g.append(svg("text", { x: (X(a) + X(b)) / 2, y: base + 44, class: "dayname" }, DAY[d] || ""));
    }
    // 눈금
    for (let h = Math.ceil(view.from / 60); h <= Math.floor(view.to / 60); h++) {
      const hr = ((h % 24) + 24) % 24, big = hr % 6 === 0;
      g.append(svg("line", { x1: X(h * 60), x2: X(h * 60), y1: base, y2: base + (big ? 9 : 4), class: "tick" }));
      if (big && hr !== 0) g.append(svg("text", { x: X(h * 60), y: base + 22, class: "hour" }, hr === 12 ? "정오" : `${hr}시`));
    }
    g.append(svg("line", { x1: x0, x2: x0 + W, y1: base, y2: base, class: "axis" }));
    // 봉인된 시간 (봉인 진술을 올렸을 때)
    for (const b of view.bands) {
      g.append(svg("rect", { x: X(b.from), y: base - 96, width: X(b.to) - X(b.from), height: 96, class: "band" }),
        svg("text", { x: X(b.from) + 6, y: base - 100, class: "bandname" }, `${b.label} ${hhmm(b.from)} ~ ${hhmm(b.to)}`));
    }
    // 시험 시간표
    view.blocks.forEach((b, i) => {
      g.append(svg("rect", { x: X(b.from), y: base - (b.thin ? 8 : 15), width: Math.max(2, X(b.to) - X(b.from)), height: b.thin ? 8 : 15, class: `block ${i % 2 ? "odd" : ""} ${b.thin ? "thin" : ""}` }, svg("title", {}, `${b.label} ${hhmm(b.from)} ~ ${hhmm(b.to)}`)));
      if (!b.thin) g.append(svg("text", { x: (X(b.from) + X(b.to)) / 2, y: base - 4, class: "blockno" }, b.label.slice(0, 1)));
    });
    if (view.blocks.length) {
      const a = X(view.blocks[0].from), z = X(view.blocks.at(-1).to);
      g.append(svg("path", { d: `M${a} ${base - 19} v-5 H${z} v5`, class: "bracket" }), svg("text", { x: (a + z) / 2, y: base - 28, class: "blockname" }, "시험 시간"));
    }
    for (const m of view.marks) g.append(svg("line", { x1: X(m.at), x2: X(m.at), y1: base - 58, y2: base + 9, class: "mark" }), svg("text", { x: X(m.at) - 4, y: base - 62, class: "markname" }, `${m.label} ${hhmm(m.at)}`));
    if (view.now > view.from && view.now < view.to) g.append(svg("line", { x1: X(view.now), x2: X(view.now), y1: base - 40, y2: base + 9, class: "now" }), svg("text", { x: X(view.now), y: base - 44, class: "nowname" }, "지금"));
    // 올린 카드: 겹치지 않게 높이를 달리한다
    const lastX = [];
    for (const it of [...view.items].sort((a, b) => a.at - b.at)) {
      const x = X(it.at);
      let lv = 0;
      while (lastX[lv] != null && x - lastX[lv] < 92) lv++;
      lastX[lv] = x;
      const y = base - 44 - lv * 27;
      const flag = svg("g", { class: `flag ${it.inside ? "inside" : ""} ${drawStrip.fresh === it.id ? "new" : ""}`, "data-id": it.id },
        svg("line", { x1: x, x2: x, y1: y + 9, y2: base }),
        svg("circle", { cx: x, cy: base, r: 3.2 }),
        svg("rect", { x: x - 42, y: y - 11, width: 84, height: 21, rx: 2 }),
        svg("text", { x, y: y + 4.5 }, `${it.id} · ${hhmm(it.at)}`),
        svg("title", {}, `${it.title} — 누르면 띠에서 뗀다`));
      if (it.inside) flag.append(svg("ellipse", { cx: x, cy: y, rx: 50, ry: 16, class: "ring", pathLength: 1 }));
      flag.addEventListener("pointerdown", (e) => e.stopPropagation());
      flag.addEventListener("click", () => {
        stripRemove(st, it.id);
        sfx.paper();
        drawStrip();
        save();
      });
      g.append(flag);
    }
    drawStrip.fresh = null;
    stripEl.replaceChildren(el("div.b-strip-head", el("b", "시간 띠"), el("span", view.items.length ? "꽂힌 표를 누르면 뗀다" : "시각이 적힌 카드를 여기로 끌어 놓는다")), g);
  }

  // ── 원고지: 빈칸 추리 ──
  let sheetNotes = [], sheetPick = null;
  // 지금 원고지에 올릴 추리: 골라 둔 것, 없으면 아직 맞추지 못한 첫 번째
  const sheetDed = (open = dedOpen(def, st)) => open.find((d) => d.id === sheetPick) || open.find((d) => !dedState(st, d.id).solved) || open.at(-1) || null;
  function drawSheet(typeset = false) {
    const open = dedOpen(def, st);
    if (!open.length) return void sheetEl.replaceChildren(el("div.b-sh-head", el("em", "원고지")), el("p.b-sh-empty", "아직 문장으로 맞출 만큼 모이지 않았다."));
    const ded = sheetDed(open), me = dedState(st, ded.id), slots = dedSlots(ded, st);
    const text = el(`p.b-sh-text${me.solved ? ".set" : ""}`);
    let n = 0;
    for (const part of dedParts(ded, st)) {
      if (!part.slot) {
        if (me.solved && typeset) for (const ch of part) text.append(el("span.ch", { style: { animationDelay: `${n++ * 34}ms` } }, ch));
        else text.append(part);
        continue;
      }
      const card = me.slots[part.slot];
      if (me.solved) {
        const phrase = slotPhrase(def, ded, part.slot, card);
        if (typeset) for (const ch of phrase) text.append(el("span.ch.key", { style: { animationDelay: `${n++ * 34}ms` } }, ch));
        else text.append(el("span.key", phrase));
        continue;
      }
      const bad = sheetNotes.find((x) => x.slot === part.slot);
      text.append(el(`span.b-slot${card ? ".filled" : ""}${bad ? ".bad" : ""}`, { "data-slot": part.slot, "data-ded": ded.id, title: card ? "누르면 비운다" : "카드를 끌어다 놓는다",
        onclick: () => {
          if (!card) return;
          setSlot(def, st, ded.id, part.slot, null);
          sheetNotes = sheetNotes.filter((x) => x.slot !== part.slot);
          sfx.paper();
          drawSheet();
          save();
        } }, card ? ev(card).title : ded.slots[part.slot].label));
    }
    const full = slots.every((s) => me.slots[s]);
    put(sheetEl,
      el("div.b-sh-head", el("em", `추리 ${ded.no}`), el("b", ded.title), me.solved ? el("i.b-sh-ok", "맞았다") : el("span", "빈칸에 카드를 끌어다 끼운다"),
        open.length > 1 ? el("span.b-sh-tabs", open.map((d) => el(`button${d === ded ? ".on" : ""}${dedState(st, d.id).solved ? ".ok" : ""}`, { title: d.title, onclick: () => { sheetPick = d.id; sheetNotes = []; sfx.paper(); drawSheet(); } }, d.no))) : null),
      text,
      me.solved ? null : el("div.b-sh-foot",
        el("button.b-sh-check", { disabled: !full || null, onclick: () => check(ded) }, "맞춰 본다"),
        el("small", sheetNotes.length ? sheetNotes.map((x) => `✕ ${ded.slots[x.slot].label}: ${x.text}`).join("  ") : `틀리면 게임 속 ${ded.wrongMinutes}분이 흐른다`)));
    sheetEl.classList.toggle("solved", me.solved);
    if (me.solved && typeset) for (let i = 0; i < n; i += 3) setTimeout(() => sfx.type(), i * 34);
  }
  async function check(ded) {
    if (locked) return;
    const res = checkDeduction(def, st, ded.id);
    if (res.incomplete) return;
    if (res.ok) {
      sheetNotes = [];
      locked = true;
      sheetPick = ded.id; // 활자가 되는 동안에는 이 문장을 그대로 둔다
      drawSheet(true);
      drawBar();
      save();
      await sleep(res.sentence.length * 34 + 350);
      sfx.right();
      slip(MAIN_W - SHEET_W / 2, mainH() - 26, "문장이 맞춰졌다. 연필이 활자가 된다.", "note", 4200);
      locked = false;
      return;
    }
    sheetNotes = Object.entries(res.slots).filter(([, r]) => !r.ok).map(([slot, r]) => ({ slot, text: r.text }));
    sfx.wrong();
    drawSheet();
    drawBar(res.minutes);
    drawStrip();
    if (res.hint) slip(MAIN_W - SHEET_W / 2, mainH() - 26, "수첩의 '물음'에 실마리가 하나 적혔다.", "hint", 4200);
    save();
  }

  // ── 위쪽 띠 ──
  function drawBar(spent = 0) {
    const q = currentQuestion(def, st);
    put(qEl, el("em", "지금의 물음"), el("b", q?.text || "—"), q?.sub ? el("span", q.sub) : null);
    clockEl.replaceChildren(fmtClock(st.minute), spent ? el("i.b-spent", `+${spent}분`) : el("small", "시계는 멈춰 있다"));
  }
  function showRead(id) {
    if (!id || drag) return void read.classList.remove("on");
    const e = ev(id);
    read.replaceChildren(el("em", id), el("b", e.title), el("span", e.kind + (e.source ? ` · ${e.source}` : "")), el("p", e.head ? `${e.head} ${(e.body || []).join(" ")}` : e.text));
    read.classList.add("on");
  }

  // ── 손 ──
  const pt = (e) => {
    const r = main.getBoundingClientRect();
    return [(e.clientX - r.left) / k, (e.clientY - r.top) / k];
  };
  const under = (e, sel2) => document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.closest?.(sel2))?.closest(sel2) || null;
  function onDown(e) {
    if (e.button !== 0 || cmp || locked) return;
    if (e.target.closest(".b-picker, .b-slip, .b-stamp")) return;
    const c = e.target.closest(".b-card");
    if (!c) return void setSel([]);
    const id = c.dataset.id, p = pt(e);
    if (cardsEl.lastElementChild !== c) cardsEl.append(c); // 집은 카드가 맨 위로 온다
    drag = e.target.closest(".b-pencil") ? { kind: "link", id, p0: p } : { kind: "card", id, p0: p, o: [...board.pos[id]], moved: false };
    try {
      main.setPointerCapture(e.pointerId);
    } catch { /* 잡지 못해도 window의 pointermove로 따라간다 */ }
    read.classList.remove("on");
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag) {
      const c = e.target.closest?.(".b-card");
      return void showRead(c?.dataset.id);
    }
    const p = pt(e);
    if (drag.kind === "link") {
      const from = center(drag.id);
      liveSvg.replaceChildren(svg("path", { d: `M${from[0].toFixed(1)} ${from[1].toFixed(1)} L${p[0].toFixed(1)} ${p[1].toFixed(1)}`, class: "soft" }), svg("path", { d: `M${from[0].toFixed(1)} ${from[1].toFixed(1)} L${p[0].toFixed(1)} ${p[1].toFixed(1)}` }));
      const t = under(e, ".b-card");
      for (const [id, c] of cardEls) c.classList.toggle("aim", Boolean(t) && c === t && id !== drag.id);
      return;
    }
    if (!drag.moved && Math.hypot(p[0] - drag.p0[0], p[1] - drag.p0[1]) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      setSel([]);
      cardEls.get(drag.id).classList.add("drag");
    }
    board.pos[drag.id] = [drag.o[0] + p[0] - drag.p0[0], drag.o[1] + p[1] - drag.p0[1]];
    moveCard(drag.id);
    drawLinks();
    const slot = under(e, ".b-slot"), inStrip = Boolean(under(e, ".b-strip"));
    for (const s of sheetEl.querySelectorAll(".b-slot")) s.classList.toggle("aim", s === slot);
    stripEl.classList.toggle("aim", inStrip && !slot);
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    liveSvg.replaceChildren();
    for (const c of cardEls.values()) c.classList.remove("aim");
    if (d.kind === "link") {
      const t = under(e, ".b-card");
      if (t && t.dataset.id !== d.id) setSel([d.id, t.dataset.id]);
      return;
    }
    const cardEl = cardEls.get(d.id);
    cardEl.classList.remove("drag");
    stripEl.classList.remove("aim");
    if (!d.moved) return void setSel(sel.includes(d.id) ? sel.filter((x) => x !== d.id) : [...sel, d.id].slice(-2));
    const back = () => {
      board.pos[d.id] = d.o;
      cardEl.classList.add("back");
      moveCard(d.id);
      drawLinks();
      setTimeout(() => cardEl.classList.remove("back"), 320);
    };
    const slot = under(e, ".b-slot");
    if (slot) {
      sheetNotes = sheetNotes.filter((x) => x.slot !== slot.dataset.slot);
      if (setSlot(def, st, slot.dataset.ded, slot.dataset.slot, d.id)) sfx.pin();
      drawSheet();
      back();
    } else if (under(e, ".b-strip")) {
      const res = stripAdd(def, st, d.id);
      if (res.ok) {
        sfx.pin();
        drawStrip.fresh = d.id;
        drawStrip();
        if (res.insight) {
          setTimeout(() => sfx.pencil(0.5), 250);
          slip(STRIP_W * 0.36, mainH() - 46, res.insight, "note", 5600);
        }
      } else if (res.text) slip(STRIP_W / 2, mainH() - 24, res.text, "plain");
      back();
    } else if (under(e, ".b-stamp")) {
      slip(MAIN_W - 150, mainH() - 150, "찍을 수 있는 것은 문장뿐이다. 아직 찍을 문장이 없다.", "plain", 4200);
      back();
    } else {
      clampAll();
      moveCard(d.id);
      drawLinks();
      sfx.paper();
    }
    for (const s of sheetEl.querySelectorAll(".b-slot")) s.classList.remove("aim");
    save();
  }
  const onKey = (e) => {
    if (e.code === "Tab") e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Escape") {
      if (cmp) closeCompare();
      else if (sel.length) setSel([]);
      else close();
    } else if (e.code === "KeyB" && !cmp) close();
    else if (sel.length === 2 && /^(Digit|Numpad)[1-4]$/.test(e.code)) choose(REL_ORDER[Number(e.code.slice(-1)) - 1]);
  };
  stamp.addEventListener("click", () => slip(MAIN_W - 150, mainH() - 150, `아직 찍을 문장이 없다. 「${def.laws?.note || "찍기 전에는 세 번 읽어라"}」`, "plain", 4200));

  // ── 크기 ──
  function fit() {
    const w = layer.clientWidth || 1, h = layer.clientHeight || 1;
    VH = clamp(Math.round((VW * h) / w), 860, 1500);
    k = Math.min(w / VW, h / VH);
    stage.style.width = `${VW}px`;
    stage.style.height = `${VH}px`;
    stage.style.transform = `translate(${((w - VW * k) / 2).toFixed(1)}px, ${((h - VH * k) / 2).toFixed(1)}px) scale(${k.toFixed(4)})`;
    main.style.height = `${mainH()}px`;
    for (const s of [linksSvg, liveSvg]) {
      s.setAttribute("width", MAIN_W);
      s.setAttribute("height", mainH());
    }
    clampAll();
    for (const id of cardEls.keys()) moveCard(id);
    drawLinks();
  }
  const ro = new ResizeObserver(fit);
  ro.observe(layer);

  function close() {
    if (!done || locked) return;
    for (const id of ownedCards(st)) if (!board.seen.includes(id)) board.seen.push(id);
    save();
    ro.disconnect();
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    layer.classList.add("out");
    sfx.paper();
    const d = done;
    done = null;
    setTimeout(() => {
      layer.remove();
      d();
    }, 260);
  }

  main.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("keydown", onKey, true);
  fit();
  drawCards();
  drawLinks();
  drawStrip();
  drawSheet();
  drawBar();
  sfx.paper();
  return Object.assign(new Promise((r) => (done = r)), {
    // 시험과 개발에서 쓰는 손잡이
    api: { select: (a, b) => (board.pos[a] && board.pos[b] ? setSel([a, b]) : false), choose, close, check: () => check(sheetDed()), sheet: (id) => ((sheetPick = id), (sheetNotes = []), drawSheet()), el: layer },
  });
}
