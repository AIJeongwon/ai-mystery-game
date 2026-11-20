// 책상 — 걸어 다니지 않는 곳의 호스트. 책상 위에 놓인 기록을 눌러 '기록을 읽는 화면'을 연다.
// 3D 현장(engine.js)과 같은 상태, 같은 수첩, 같은 증거판을 쓴다. 다른 것은 무대뿐이다.
// 무대는 위에서 내려다본 책상 한 장이다. 무엇이 놓이는지는 def.probes와 def.things가 정한다.
import { el, makeHud } from "./hud.js";
import { newSiteState, loadSite, saveSite, clearSite, lockOpen, apply, currentQuestion, questionProgress, runDeadlines, fmtClock } from "./state.js";
import { primeBook, bookUnseen, boardUnseen, boardOf, ownedCards, isNote } from "./reason.js";
import { loadPhotos } from "./photos.js";
import { openNotebook } from "./notebook.js";
import { openBoard } from "./board.js";
import { recOf, probeOf, probeStatus, probeOpen, answersView } from "./records.js";
import { pencilRing, hash } from "./probe.js";
import { openWeb } from "./probe-web.js";
import { openLedger } from "./probe-ledger.js";
import { openFlow } from "./probe-flow.js";
import { openAnswers } from "./probe-answers.js";
import { sfx } from "./sfx.js";

const DW = 1500, DH = 900;
const OPEN = { web: openWeb, ledger: openLedger, flow: openFlow, answers: openAnswers };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 물건의 크기 (CSS와 같은 값). 아직 펴 보지 않은 것에 두르는 색연필 동그라미가 이 크기를 따른다.
const SIZE = { laptop: [430, 372], printout: [250, 320], ledger: [214, 276], bankbook: [268, 182], lightbox: [350, 244] };

// 물건의 생김새. 그림은 CSS(site-probe.css의 d-*)가 그린다.
const LOOKS = {
  laptop: ({ st }) => el("div.d-laptop", el("div.d-screen", el("b", el("i", "모아"), "찾기"), el("span", recOf(st).web.trail[0] || ""), el("u"), el("u")), el("div.d-deck")),
  printout: ({ probe }) => el("div.d-print", el("b", probe.label.replace(/ 사본$/, "")), el("span", "행정실 단말 출력본"), [100, 86, 94, 70, 90, 78, 96, 64, 88].map((w) => el("i", { style: { "--w": `${w}%` } }))),
  ledger: () => el("div.d-ledger", el("b", "매입 장부"), ["10/9  사인펜  30", "10/9  뿔테   4", "10/12 기판   4", "10/12 배터리  8", "10/13 마이크  4", "10/15 부품   5", "10/16 타이   1", "10/16 카드   4"].map((t) => el("span", t))),
  bankbook: () => el("div.d-bank", el("b", "통장 사본"), el("div"), el("div")),
  lightbox: ({ def, st, probe, status }) => {
    const n = status === "locked" ? 1 : Math.max(1, answersView(def, st, probe.ref).on.length);
    return el(`div.d-light${status === "locked" ? "" : ".lit"}`, el("div.d-glass", Array.from({ length: n }, (_, i) => el("i.d-omr", { style: { "--r": `${(hash(`omr${i}`) - 0.5) * 5}deg` } }))));
  },
  envelope: () => el("div.d-envelope", el("span", "받은 만큼 드립니다.")),
  box: () => el("div.d-box"),
  pen: () => el("div.d-pen"),
  mug: () => el("div.d-mug"),
  book: () => el("div.d-book", el("b", "수첩"), el("i")),
};

export async function createDesk(root, def, opts = {}) {
  if (opts.fresh) clearSite(def);
  const saved = !opts.fresh && loadSite(def);
  const st = saved || newSiteState(def);
  const photos = def.photosFrom ? loadPhotos(def.photosFrom) : {};
  primeBook(def, st); // 이어받은 것은 수첩에 이미 적혀 있다
  root.classList.add("desk");

  const scene = el("div.d-scene");
  const fitEl = el("div.d-fit", scene);
  root.append(fitEl);
  const hud = makeHud(root);
  hud.setPlace(def.place || def.title);
  hud.setMode("desk");
  const save = () => saveSite(st);

  let busy = false, overlay = null;
  const shown = new Set(); // 이미 책상에 놓인 것 (새로 놓이는 것만 떨어지는 연출을 한다)
  let first = true;
  const pinsSeen = new Set(ownedCards(st));

  // 1500 x 900으로 짜고, 화면에 맞춰 통째로 키우거나 줄인다
  const fit = () => (scene.style.zoom = Math.max(0.4, Math.min(1.8, fitEl.clientWidth / DW, fitEl.clientHeight / DH)).toFixed(3));
  new ResizeObserver(fit).observe(fitEl);
  fit();

  const tagFor = (probe, status) => {
    const opened = probe.id in recOf(st).opened;
    return status === "locked" ? "아직 펼 수 없다" : status === "done" ? "카드로 만들었다 · 다시 볼 수 있다" : opened ? "펼쳐 본다" : probe.minutes ? `펼쳐 본다 · 처음 펴는 데 ${probe.minutes}분` : "펼쳐 본다";
  };
  function objEl(id, look, at, kids, { cls = "", onclick, title }) {
    const [x, y, r = 0] = at;
    const node = el(`button.d-obj${cls}`, { "data-id": id, "aria-label": title, style: { left: `${x}px`, top: `${y}px`, "--r": `${r}deg` }, onclick }, kids);
    if (!first && !shown.has(id)) {
      node.classList.add("arrive");
      node.style.setProperty("--d", `${(shown.arrivals = (shown.arrivals || 0) + 1) * 0.16}s`);
    }
    shown.add(id);
    return node;
  }
  function drawScene() {
    shown.arrivals = 0;
    const q = currentQuestion(def, st), B = boardOf(st);
    const cards = ownedCards(st);
    const kids = [el("div.d-wood"), el("div.d-lamp"), el("div.d-shade"),
      el(`button.d-board${q?.board ? ".nudge" : ""}`, { "data-id": "board", onclick: () => openOverlay("board") },
        cards.slice(-17).map((c) => {
          const isNew = !pinsSeen.has(c);
          pinsSeen.add(c);
          return el(`i.d-pin${isNew ? ".new" : ""}${isNote(def, c) ? ".note" : ""}`, { style: { "--r": `${((hash(c) - 0.5) * 9).toFixed(1)}deg`, marginTop: `${4 + Math.round(hash(`${c}y`) * 14)}px` } });
        }),
        el("span.d-board-label", `증거판 · 카드 ${cards.length}장${Object.keys(B.links).length ? ` · 이은 선 ${Object.keys(B.links).length}` : ""}`, el("kbd", "B")))];
    for (const th of def.things || []) {
      if (th.showIf && !lockOpen(th.showIf, st)) continue;
      kids.push(objEl(th.id, th.look, th.at, [LOOKS[th.look]({ def, st }), el(`span.d-tag${th.at[1] > 560 ? ".up" : ""}`, el("b", th.label))], { cls: ".thing", title: th.label, onclick: () => say(th.lines) }));
    }
    for (const probe of def.probes || []) {
      const status = probeStatus(def, st, probe);
      if (status === "hidden") continue;
      const fresh = status === "open" && !(probe.id in recOf(st).opened);
      const art = LOOKS[probe.look]({ def, st, probe, status });
      kids.push(objEl(probe.id, probe.look, probe.at, [art,
        fresh && SIZE[probe.look] ? pencilRing(SIZE[probe.look][0] + 20, SIZE[probe.look][1] + 16, probe.id) : null,
        status === "done" ? el("i.d-check", "✓") : null,
        el(`span.d-tag${probe.at[1] > 520 ? ".up" : ""}`, el("b", probe.label), el("small", probe.sub || ""), el("em", tagFor(probe, status)))],
        { cls: `.probe.${status}`, title: probe.label, onclick: () => openProbe(probe.id) }));
    }
    if (def.bookAt) kids.push(objEl("book", "book", def.bookAt, [LOOKS.book({}), el("span.d-tag.up", el("b", "수첩"), el("small", "물음 · 사실 · 인물"), el("em", "펼친다 (Tab)"))], { cls: ".thing", title: "수첩", onclick: () => openOverlay("book") }));
    scene.replaceChildren(...kids);
    if (!first && shown.arrivals) setTimeout(() => sfx.paper(), 380);
    first = false;
  }
  function refresh(spent = 0) {
    for (const d of runDeadlines(def, st)) if (d.note) hud.toast(d.note, "warn", 6000);
    const q = currentQuestion(def, st);
    hud.setQuestion(q, questionProgress(q, st));
    hud.setClock(fmtClock(st.minute), spent);
    hud.setBelt([], null, null, { book: bookUnseen(def, st).total, board: boardUnseen(st), nudge: Boolean(q?.board), bag: false });
    save();
    drawScene();
  }

  // 한두 줄의 말 (물건을 눌렀을 때, 일이 일어났을 때)
  async function say(lines) {
    if (busy || !lines?.length) return;
    busy = true;
    hud.setMode("cine");
    try {
      await hud.caption(lines);
    } finally {
      hud.setMode("desk");
      busy = false;
    }
  }
  // 조건이 맞는 순간 한 번 일어나는 일. 시간이 드는 일은 화면이 잠깐 어두워졌다 밝아진다.
  async function runTriggers() {
    for (const tr of def.triggers || []) {
      if (st.flags[`trig_${tr.id}`] || !lockOpen(tr.when, st)) continue;
      st.flags[`trig_${tr.id}`] = true;
      busy = true;
      hud.setMode("cine");
      try {
        if (tr.caption) await hud.caption(tr.caption);
        const before = st.minute, long = (tr.effect?.minutes || 0) >= 30;
        if (long) await hud.fade(true, 600);
        apply(st, tr.effect || {});
        refresh(st.minute - before);
        if (long) {
          await sleep(350);
          await hud.fade(false, 800);
        }
        if (tr.after) await hud.caption(tr.after);
      } finally {
        hud.setMode("desk");
        busy = false;
      }
      refresh();
    }
  }

  async function openOverlay(kind, tab) {
    if (busy) return;
    busy = true;
    const before = st.minute;
    hud.setMode(kind);
    let next = null;
    try {
      const view = kind === "book"
        ? openNotebook({ root, def, st, tab, map: null, photos, save, onChange: () => refresh() })
        : openBoard({ root, def, st, photos, save });
      overlay = view.api;
      next = await view;
    } finally {
      overlay = null;
      hud.setMode("desk");
      busy = false;
    }
    refresh(st.minute - before);
    if (next === "board") return openOverlay("board");
    await runTriggers();
  }
  async function openProbe(id) {
    if (busy) return;
    const probe = probeOf(def, id);
    if (!probe) return;
    const status = probeStatus(def, st, probe);
    if (status === "hidden") return;
    if (status === "locked") return say([probe.lockText || "아직 펼 수 없다."]);
    const before = st.minute, res = probeOpen(def, st, id);
    if (!res.ok) return;
    busy = true;
    hud.setMode("probe");
    let next = null;
    try {
      const view = OPEN[probe.kind]({ root, def, st, id: probe.ref, save, spent: res.minutes });
      overlay = view.api;
      next = await view;
    } finally {
      overlay = null;
      hud.setMode("desk");
      busy = false;
    }
    refresh(st.minute - before);
    if (next === "book" || next === "board") return openOverlay(next);
    await runTriggers();
  }
  hud.onBelt = (k) => openOverlay(k);

  // 말이 떠 있는 동안에는 어디를 눌러도 다음 줄로 넘어간다
  root.addEventListener("click", (e) => {
    if (!hud.busy || overlay) return;
    e.stopPropagation();
    e.preventDefault();
    hud.advance();
  }, true);
  const onKey = (e) => {
    if (overlay || e.repeat) return;
    if (hud.busy) {
      if (["Space", "Enter", "KeyE", "Escape"].includes(e.code)) {
        e.preventDefault();
        hud.advance();
      }
      return;
    }
    if (busy) return;
    if (e.code === "Tab") {
      e.preventDefault();
      openOverlay("book");
    } else if (e.code === "KeyB") openOverlay("board");
    else if (e.code === "KeyH") openOverlay("book", "keys");
  };
  window.addEventListener("keydown", onKey);

  refresh();
  if (!saved && def.sketch) hud.sketch(def.sketch);
  runTriggers();

  // 시험과 개발에서 쓰는 손잡이
  return {
    def, st, hud, photos,
    book: (tab) => openOverlay("book", tab),
    board: () => openOverlay("board"),
    probe: (id) => openProbe(id),
    thing: (id) => say((def.things || []).find((t) => t.id === id)?.lines),
    overlay: () => overlay,
    busy: () => busy,
    advance: () => hud.advance(),
    refresh, triggers: runTriggers,
    dispose: () => {
      window.removeEventListener("keydown", onKey);
      hud.dispose();
      fitEl.remove();
    },
  };
}
