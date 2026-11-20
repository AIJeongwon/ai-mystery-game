// 공개 정보 — 노트북 속의 누리집들. 낱말을 넣어 찾고, 쓸 대목을 오려 둔다.
// 검색은 자유 입력이지만 결과는 손으로 쓴 글 묶음(def.records.web) 안에서만 나온다.
// 이 화면의 '아하': 고쳐진 페이지는 고치기 전의 모습이 어딘가에 남아 있다(지난 모습).
import { el } from "./hud.js";
import { makeFrame, svg, put, CIRCLED } from "./probe.js";
import { recOf, webSearch, webTerms, webPage, webVisit, webClip, webCards } from "./records.js";
import { sfx } from "./sfx.js";

// 수학 14번의 그림: 끊긴 곳이 다섯인 그래프. 세로 점선 둘은 좌표를 알려 주는 선일 뿐이다.
function figQ14() {
  const X = (x) => 210 + x * 52, Y = (y) => 226 - y * 44;
  const g = svg("svg", { viewBox: "0 0 420 270", class: "w-graph" });
  const line = (x1, y1, x2, y2, cls) => svg("line", { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), class: cls });
  g.append(line(-3.7, 0, 3.8, 0, "axis"), line(0, -0.6, 0, 4.6, "axis"),
    svg("path", { d: `M${X(3.8)} ${Y(0)} l-7 -4 m7 4 l-7 4 M${X(0)} ${Y(4.6)} l-4 7 m4 -7 l4 7`, class: "axis" }),
    svg("text", { x: X(3.8) + 4, y: Y(0) + 14, class: "lab i" }, "x"), svg("text", { x: X(0) - 14, y: Y(4.6) + 4, class: "lab i" }, "y"), svg("text", { x: X(0) - 12, y: Y(0) + 15, class: "lab" }, "O"));
  for (const x of [-3, -2, -1, 1, 2, 3]) g.append(line(x, -0.07, x, 0.07, "axis"), svg("text", { x: X(x), y: Y(0) + 16, class: "lab", "text-anchor": "middle" }, x < 0 ? `−${-x}` : x));
  // 좌표를 알려 주는 세로 점선 (그래프의 일부가 아니다)
  g.append(line(-1, 0, -1, 3, "guide"), line(2, 0, 2, 3.5, "guide"));
  // 조각들: [x0, y0, x1, y1, 왼쪽 끝이 찬 점인가, 오른쪽 끝이 찬 점인가]
  const pieces = [[-3, 1, -2, 1, 1, 0], [-2, 2, -1, 3, 1, 0], [-1, 1.5, 0, 0.5, 1, 0], [0, 2.5, 1, 2.5, 1, 0], [1, 1, 2, 2, 1, 0], [2, 3.5, 3, 3, 1, 1]];
  for (const [x0, y0, x1, y1] of pieces) g.append(line(x0, y0, x1, y1, "curve"));
  for (const [x0, y0, x1, y1, a, b] of pieces) g.append(svg("circle", { cx: X(x0), cy: Y(y0), r: 3.6, class: a ? "dot" : "dot open" }), svg("circle", { cx: X(x1), cy: Y(y1), r: 3.6, class: b ? "dot" : "dot open" }));
  g.append(svg("text", { x: X(2.2), y: Y(3.9), class: "lab i" }, "y = f(x)"));
  return el("div.w-q14",
    el("p", el("b", "14."), " 닫힌구간 [−3, 3]에서 정의된 함수 ", el("i", "y = f(x)"), "의 그래프가 그림과 같다. 함수 ", el("i", "f(x)"), "가 불연속인 ", el("i", "x"), "의 값의 개수는? ", el("span", "[4점]")),
    g,
    el("ol", [1, 2, 3, 4, 5].map((n) => el("li", el("i", CIRCLED[n]), String(n)))));
}

export function openWeb({ root, def, st, save = () => {}, spent = 0 }) {
  const W = def.records.web, A = Object.values(def.records.answers || {})[0];
  const F = makeFrame({ root, kind: "web", title: "노트북", sub: "누구나 볼 수 있는 것들 · 낱말을 넣어 찾는다", prompt: "수첩의 낱말로 찾고, 쓸 대목을 오려 둔다", def, st, save, spent });
  const me = recOf(st).web;
  let view = { kind: "home", query: "", results: null };
  let sel = null, snapMenu = false;
  const back = [];

  const tabEl = el("div.w-tab");
  const addr = el("div.w-addr");
  const backBtn = el("button.w-btn", { title: "뒤로", onclick: () => goBack() }, "←");
  const homeBtn = el("button.w-btn", { title: "모아찾기", onclick: () => show({ kind: "home", query: "", results: null }) }, "⌂");
  const snapBtn = el("button.w-snap", { onclick: () => toggleSnaps() }, el("i", "◷"), "지난 모습");
  const snapList = el("div.w-snaps.off");
  const viewEl = el("div.w-view");
  const act = el("div.w-act.off");
  const laptop = el("div.w-laptop", el("div.w-chrome", el("div.w-tabs", tabEl), el("div.w-tools", backBtn, homeBtn, addr, el("div.w-snapwrap", snapBtn, snapList))), viewEl, act, el("div.w-hinge"));
  const termsEl = el("div.w-terms");
  const clipsEl = el("div.w-clips");
  const side = el("div.w-side", termsEl, clipsEl, el("p.w-help", "글의 한 대목을 누르면 오려 둘 수 있다. 오려 둔 것은 카드가 되어 증거판에 꽂힌다."));
  F.body.append(el("div.w-wrap", laptop, side));

  const sheetOf = (id) => A?.sheets.find((s) => s.id === id);
  function sheetEl(s) {
    const qs = A.questions;
    return el("div.w-sheet",
      el("div.w-sheet-head", el("b", "수학 가채점"), el("span", `${s.where} · 선택 ${s.elective}`)),
      el("table", el("tbody",
        el("tr", el("th", "문항"), qs.map((q) => el("td.q", String(q)))),
        el("tr", el("th", "내 답"), qs.map((q) => el("td", CIRCLED[s.answers[q]]))))),
      el("small", `선택 과목 23~28번: ${s.extra.map((x) => CIRCLED[x]).join(" ")} · 단답형은 적지 않음`));
  }
  function ratioEl(b) {
    const rows = Object.keys(b.ratios).map(Number);
    return el("table.w-ratio",
      el("thead", el("tr", el("th", "문항"), [1, 2, 3, 4, 5].map((n) => el("th", CIRCLED[n])), el("th", "정답"))),
      el("tbody", rows.map((q) => {
        const id = `${b.id}:${q}`, cut = b.clippedRows.includes(String(q));
        return el(`tr.w-pick${sel === id ? ".sel" : ""}${cut ? ".cut" : ""}`, { onclick: () => select(id) },
          el("th", String(q)), b.ratios[q].map((p, i) => el(`td${b.key[q] === i + 1 ? ".key" : ""}`, `${p}%`)), el("td.k", CIRCLED[b.key[q]]));
      })));
  }
  function blockEl(b) {
    let node, pick = true;
    if (b.t === "h") node = el("h2", b.text), pick = false;
    else if (b.t === "meta") node = el("div.w-meta", b.text), pick = false;
    else if (b.t === "link") node = el("a.w-link", { onclick: () => go(b.to) }, "→ ", b.text), pick = false;
    else if (b.t === "comment") node = el("div.w-comment", el("b", b.who), el("span", b.text));
    else if (b.t === "ad") node = el("div.w-ad", b.text);
    else if (b.t === "foot") node = el("div.w-foot", b.text);
    else if (b.t === "fig") node = figQ14();
    else if (b.t === "keyrow") node = el("div.w-keyrow", el("b", b.text), el("table", el("tbody", el("tr", Object.keys(b.key).map((q) => el("th", q))), el("tr", Object.values(b.key).map((k) => el("td", CIRCLED[k]))))));
    else if (b.t === "sheet") node = sheetEl(sheetOf(b.sheet));
    else if (b.t === "ratio") return ratioEl(b);
    else node = el("p", b.text);
    if (!pick) return node;
    node.classList.add("w-pick");
    if (sel === b.id) node.classList.add("sel");
    if (b.clipped) node.classList.add("cut");
    node.addEventListener("click", () => select(b.id));
    return node;
  }

  function drawSide() {
    const terms = webTerms(def, st);
    put(termsEl, el("h5", "찾아볼 낱말"),
      terms.length ? terms.map((t, i) => el("button.w-term", { style: { rotate: `${((i * 37) % 5) - 2}deg` }, title: `${t.from}에서`, onclick: () => search(t.text) }, t.text)) : el("p.w-dim", "아직 적어 둔 낱말이 없다."),
      el("p.w-dim", "수첩에 적힌 낱말이다. 다른 말을 직접 쳐 넣어도 된다."));
    const cards = webCards(def);
    put(clipsEl, el("h5", "오려 둔 것"),
      el("ul", cards.map((id) => {
        const have = id in st.evidence, part = (me.parts[id] || []).length, total = W.parts?.[id];
        if (!have && !part) return null;
        return el(`li${have ? ".have" : ""}`, el("em", id), have ? def.evidence[id].title : `${def.evidence[id].title} ${part}/${total}`);
      })),
      cards.some((id) => id in st.evidence || (me.parts[id] || []).length) ? null : el("p.w-dim", "아직 없다."));
  }
  function draw() {
    sel = null;
    snapMenu = false;
    snapList.classList.add("off");
    act.classList.add("off");
    backBtn.disabled = !back.length;
    if (view.kind === "home") {
      tabEl.textContent = "모아찾기";
      put(addr, el("span", "모아찾기"), view.results ? el("b", ` › “${view.query}”`) : null);
      snapBtn.disabled = true;
      const input = el("input.w-input", { type: "text", value: view.query || "", placeholder: "찾을 낱말", maxlength: "40", spellcheck: "false", autocomplete: "off" });
      const form = el("form.w-form", { onsubmit: (e) => (e.preventDefault(), search(input.value)) }, input, el("button", { type: "submit" }, "찾기"));
      const R = view.results;
      put(viewEl, el(`div.w-page.find${R ? ".has" : ""}`,
        el("div.w-logo", el("b", "모아"), "찾기"), form,
        !R ? (me.trail.length ? el("div.w-trail", el("span", "찾아본 낱말"), me.trail.map((t) => el("button", { onclick: () => search(t) }, t))) : null)
          : R.short ? el("p.w-none", "두 글자 이상 넣는다.")
          : !R.results.length ? el("p.w-none", `“${R.query}”로 찾은 것이 없다. 수첩에 적힌 낱말을 넣어 본다.`)
          : el("ol.w-results", R.results.map((x) => el(`li${x.seen ? ".seen" : ""}`, { onclick: () => go(x.id) }, el("small", x.siteName), el("b", x.title), el("p", x.snippet), x.seen ? el("i", "읽음") : null)))));
      viewEl.scrollTop = 0;
      if (!R) setTimeout(() => input.focus({ preventScroll: true }), 50);
    } else {
      const p = webPage(def, st, view.pageId, view.snapId);
      tabEl.textContent = p.siteName;
      put(addr, el("span", p.address || p.siteName), el("b", p.current ? "" : ` · ${p.date}의 모습`));
      snapBtn.disabled = false;
      snapBtn.classList.toggle("on", !p.current);
      put(snapList, p.snaps.length > 1
        ? p.snaps.map((s) => el(`button${s.id === p.snap ? ".on" : ""}`, { onclick: () => go(view.pageId, s.current ? null : s.id) }, el("b", s.current ? "지금" : s.date), el("span", s.current ? "지금의 모습" : "보관된 모습")))
        : el("p", "보관된 옛 모습이 없다."));
      put(viewEl, el(`div.w-page.${p.skin}${p.current ? "" : ".old"}`,
        p.current ? null : el("div.w-oldbar", el("span", p.note || `지난 페이지 보관본 · ${p.date}`), el("button", { onclick: () => go(view.pageId, null) }, "지금의 모습으로")),
        el("div.w-mast", el("b", p.siteName), el("span", p.current ? p.date : `${p.date}에 보관됨`)),
        el("article", p.blocks.map(blockEl))));
    }
    drawSide();
    F.clock();
  }
  function show(next, keep = false) {
    if (!keep && (view.kind !== "home" || view.results)) back.push(view);
    view = next;
    draw();
    viewEl.scrollTop = 0;
  }
  function goBack() {
    if (!back.length) return;
    view = back.pop();
    draw();
  }
  function search(q) {
    const res = webSearch(def, st, q);
    sfx.type();
    show({ kind: "home", query: res.query, results: res });
    save();
  }
  function go(pageId, snapId = null) {
    if (!W.pages[pageId]) return;
    webVisit(def, st, pageId, snapId);
    sfx.page();
    show({ kind: "page", pageId, snapId });
    save();
  }
  function toggleSnaps() {
    if (view.kind !== "page") return;
    snapMenu = !snapMenu;
    snapList.classList.toggle("off", !snapMenu);
  }
  function select(id) {
    if (view.kind !== "page") return;
    const scroll = viewEl.scrollTop;
    const next = sel === id ? null : id;
    draw();
    sel = next;
    viewEl.scrollTop = scroll;
    for (const n of viewEl.querySelectorAll(".w-pick.sel")) n.classList.remove("sel");
    if (!sel) return;
    const p = webPage(def, st, view.pageId, view.snapId);
    const [bid, row] = sel.split(":");
    const nodes = [...viewEl.querySelectorAll("article > .w-pick, article .w-ratio tr.w-pick")];
    const flat = p.blocks.flatMap((b) => (b.t === "ratio" ? Object.keys(b.ratios).map((q) => `${b.id}:${q}`) : ["h", "meta", "link"].includes(b.t) ? [] : [b.id]));
    nodes[flat.indexOf(sel)]?.classList.add("sel");
    const b = p.blocks.find((x) => x.id === bid);
    const cut = row != null ? b.clippedRows.includes(row) : b.clipped;
    put(act, cut ? el("span", "이미 오려 둔 대목이다.") : el("button.w-cut", { onclick: () => clip() }, el("i", "✂"), "이 대목을 오려 둔다"), el("button.w-cancel", { onclick: () => select(sel) }, "그만둔다"));
    act.classList.remove("off");
    sfx.paper();
  }
  function clip() {
    if (!sel || view.kind !== "page") return;
    const res = webClip(def, st, view.pageId, view.snapId, sel);
    const scroll = viewEl.scrollTop;
    if (!res.ok) {
      if (res.kind === "dup") F.slip(res.text, "plain");
      else F.miss(res);
      draw();
      viewEl.scrollTop = scroll;
      return;
    }
    sfx.pencil(0.3);
    if (res.partial) {
      F.slip(`${def.evidence[res.card].title} ${res.have}/${res.total} · 같은 낱말로 찾은 글이 더 있다`, "note", 4600);
      save();
    } else F.gain(res);
    draw();
    viewEl.scrollTop = scroll;
  }
  F.onEsc = () => {
    if (snapMenu) return toggleSnaps(), true;
    if (sel) return select(sel), true;
    return false;
  };
  draw();
  return Object.assign(F.promise, {
    // 시험과 개발에서 쓰는 손잡이
    api: { search, go, select, clip, back: goBack, close: F.close, view: () => view, el: F.layer },
  });
}
