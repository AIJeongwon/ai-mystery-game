// 수첩 — 위로 넘기는 기자 수첩. 왼쪽 색인으로 쪽을 넘긴다: 물음 · 사실 · 인물 · 장소 · 법칙 · 조작.
// 펼친 동안 시계는 멈춘다(곰곰이 따져 볼 때만 흐른다). 새로 적힌 줄은 펼친 순간 눈앞에서 써진다.
// 무엇을 적을지는 reason.js가 고른다. 이 파일은 그것을 종이 위에 옮길 뿐이다.
import { el } from "./hud.js";
import { questionsPage, factsPage, peoplePage, pullFact, bookKeys, bookSeen, markBookSeen, bookUnseen, factKey, lineKey, hintsLeft, ponder, PONDER_MINUTES } from "./reason.js";
import { nextDeadline, fmtClock } from "./state.js";
import { sfx } from "./sfx.js";

const TABS = [
  { id: "q", label: "물음" }, { id: "facts", label: "사실" }, { id: "people", label: "인물" },
  { id: "map", label: "장소" }, { id: "laws", label: "법칙" }, { id: "keys", label: "조작" },
];
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
const DAY = ["금", "토", "일", "월", "화"];
const stamp = (minute) => {
  const d = Math.floor(minute / 1440), m = ((minute % 1440) + 1440) % 1440;
  return `${DAY[d] ?? (d < 0 ? ["", "목", "수"][-d] || "" : "")} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const span = (minutes) => {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h ? `${h}시간 ` : ""}${m || !h ? `${m}분` : ""}`.trim();
};
function rnd(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}
// 손으로 그은 네모
function wobblyRect(x, y, w, h, r, amp = 0.9) {
  const j = () => (r() - 0.5) * amp * 2;
  const p = [[x, y], [x + w / 2, y], [x + w, y], [x + w, y + h / 2], [x + w, y + h], [x + w / 2, y + h], [x, y + h], [x, y + h / 2]].map(([a, b]) => [a + j(), b + j()]);
  return `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)} ` + [1, 2, 3, 4, 5, 6, 7, 0].map((i) => `L${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)}`).join(" ") + ` l${(1.5 + r()).toFixed(1)} ${(0.6 * r()).toFixed(1)}`;
}

// 표시: 직접 본 것 ✓ / 들은 것 ❝ / 거짓 ✕ / 판에서 이은 것 ∴
const MARK = { seen: ["✓", "직접 본 것"], heard: ["❝", "들은 것"], false: ["✕", "거짓으로 드러난 것"], note: ["∴", "판에서 이은 것"] };

export function openNotebook({ root, def, st, tab = null, map = null, photos = {}, save = () => {}, onChange = () => {} }) {
  let cur = Math.max(0, TABS.findIndex((t) => t.id === (tab || st.book?.tab || "q")));
  let done = null, flipping = false;
  const fresh = new Set(); // 이번에 처음 보이는 줄

  const tabsEl = el("div.n-tabs");
  const page = el("div.n-page");
  const stack = el("div.n-stack", page);
  const foot = el("div.n-foot");
  const book = el("div.n-book", el("div.n-cover"), el("div.n-coil"), tabsEl, stack);
  const layer = el("div.n-layer", book, foot);
  root.append(layer);

  // 새로 적힌 줄이면 n-new를 붙인다 (써지는 연출)
  const isNew = (key) => {
    if (bookSeen(st, key)) return false;
    fresh.add(key);
    return true;
  };
  const cls = (key, base) => `${base}${isNew(key) ? ".n-new" : ""}`;
  const head = (title, sub) => el("div.n-head", el("h2", title), el("span", sub || `${fmtClock(st.minute)} · ${def.title}`));

  // ── 물음 ──
  function pageQuestions() {
    const Q = questionsPage(def, st), nowIt = Q.list.find((x) => x.now), out = [head("물음", null)];
    if (nowIt) {
      const q = nowIt.q;
      out.push(el(cls(`q:${q.id}`, "div.n-qnow"),
        el("em", "지금의 물음"),
        el("h3", q.text),
        q.sub ? el("p.n-qsub", `→ ${q.sub}`) : null,
        nowIt.total ? el("ul.n-qcards", nowIt.cards.map((c) => el(`li${c.owned ? ".have" : ""}`, el("i", c.owned ? "●" : "○"), c.owned ? c.title : "아직 모른다"))) : null));
      const hints = nowIt.hints.map((h, i) => el(cls(`h:${q.id}:${i}`, "li"), el("i", "실마리"), h));
      const left = hintsLeft(def, st);
      if (hints.length || left) {
        out.push(el("div.n-hints", hints.length ? el("ul", hints) : null,
          left ? el("button.n-ponder", { onclick: () => doPonder() }, "곰곰이 따져 본다", el("small", `게임 속 ${PONDER_MINUTES}분 · 실마리가 하나 적힌다`)) : el("p.n-dim", "더 적을 실마리가 없다. 답은 이 방 안에 있다.")));
      }
    }
    const d = nextDeadline(def, st);
    if (d?.warn) out.push(el("div.n-deadline", el("em", "시한"), el("b", d.warn), el("span", d.at > st.minute ? `앞으로 ${span(d.at - st.minute)}` : "지났다")));
    for (const { ded, solved, sentence } of Q.deds) {
      out.push(el(cls(solved ? `d:${ded.id}:ok` : `d:${ded.id}`, `div.n-ded${solved ? ".ok" : ""}`),
        el("em", `추리 ${ded.no} · ${ded.title}`),
        solved ? el("p.n-typeset", sentence) : el("p", "문장으로 맞출 때가 됐다. 증거판(B) 아래의 원고지에 카드를 끼운다.")));
    }
    const past = Q.list.filter((x) => !x.now).reverse();
    if (past.length) {
      out.push(el("h4", "지나온 물음"), el("ul.n-past", past.map((x) => el("li", el("i", "✓"), el("span", x.q.text),
        x.hints.length ? el("small", x.hints.at(-1)) : null))));
    }
    return out;
  }
  function doPonder() {
    const res = ponder(def, st);
    if (!res.ok) return;
    sfx.pencil(0.7);
    save();
    onChange({ minutes: res.minutes });
    draw();
    foot.replaceChildren(el("b", `+${res.minutes}분`), " 곰곰이 따져 보는 사이 시간이 흘렀다.");
  }

  // ── 사실 ──
  function pageFacts() {
    const groups = factsPage(def, st), out = [head("사실", null)];
    for (const g of groups) {
      out.push(el("h4", g.title));
      out.push(el("ul.n-facts", g.items.map((it) => {
        const key = factKey(it), refuter = it.mark === "false" ? def.evidence[def.evidence[it.id]?.refutedBy] : null;
        return el(cls(key, `li.${it.mark}`),
          el("i.n-mark", { title: MARK[it.mark][1] }, MARK[it.mark][0]),
          el("div",
            el("b", it.title, it.id ? el("sup", it.id) : null, el("time", stamp(it.minute))),
            el("p", it.text),
            refuter ? el("p.n-refute", `→ 「${refuter.title}」로 뒤집혔다`) : null,
            it.pull ? el("button.n-pull", { onclick: () => doPull(it.pull) }, "판에 꽂는다", el("small", "증거판의 카드가 된다")) : null,
            it.pulled ? el("small.n-pulled", "증거판에 꽂혀 있다") : null));
      })));
    }
    if (groups.length === 1 && groups[0].items.every((x) => def.evidence[x.id]?.carried)) out.push(el("p.n-dim", "이 방에서 본 것은 아직 없다."));
    out.push(el("p.n-legend", Object.values(MARK).map(([g, t]) => el("span", el("i", g), t))));
    return out;
  }
  function doPull(cardId) {
    const got = pullFact(def, st, cardId);
    if (!got) return;
    sfx.pin();
    save();
    onChange({ fresh: got });
    draw();
    foot.replaceChildren(el("b", def.evidence[cardId].title), " — 카드로 만들어 증거판에 꽂았다.");
  }

  // ── 인물 ──
  function portrait(p) {
    const face = svg("svg", { viewBox: "0 0 80 100", class: "n-sil" },
      svg("path", { d: "M40 16c-11 0-18 8-18 20 0 9 4 17 10 21-12 4-22 12-24 30v13h64V87c-2-18-12-26-24-30 6-4 10-12 10-21 0-12-7-20-18-20z" }),
      p.unknown ? svg("text", { x: 40, y: 50 }, "?") : null);
    const src = photos[`who:${p.npc}`] || p.photo; // 현장에서 찍어 둔 사진이 먼저다
    if (!src) return el(`div.n-portrait${p.unknown ? ".unknown" : ""}`, face, el("i.n-tape"));
    const img = el("img", { src, alt: "", draggable: "false" });
    img.addEventListener("error", () => img.replaceWith(face));
    return el("div.n-portrait", img, el("i.n-tape"));
  }
  function pagePeople() {
    const out = [head("인물", null)];
    for (const p of peoplePage(def, st)) {
      out.push(el(cls(`p:${p.id}`, "section.n-person"),
        portrait(p),
        el("div.n-who",
          el("h3", p.name),
          el("span.n-role", p.role),
          p.where ? el("p.n-where", el("i", "있는 곳"), p.where) : null,
          p.mood ? el("p.n-mood", el("i", "지금"), p.mood) : null),
        el("div.n-plines",
          p.lines.length ? el("ul.n-lines", p.lines.map((l) => el(cls(lineKey(p.id, l), "li"), l))) : null,
          p.said.length ? el("div.n-said", el("em", "밑줄 친 말"), p.said.map((s) => el(cls(`p:${p.id}:s:${s.id}`, "p"), el("q", s.text.replace(/^"|"$/g, "")), el("time", stamp(s.minute))))) : null,
          p.unasked.length ? el("div.n-unasked", el("em", "아직 묻지 않은 것"), el("ul", p.unasked.map((u) => el(cls(lineKey(p.id, `?${u}`), "li"), u)))) : null)));
    }
    return out;
  }

  // ── 장소: 손으로 그린 평면도 ──
  function pageMap() {
    const out = [head("장소", def.place)];
    const m = map?.();
    if (!m) return [...out, el("p.n-dim", "이 방의 그림은 아직 그리지 못했다.")];
    const r = rnd(def.id), S = 52, pad = 36;
    const { minX, maxX, minZ, maxZ } = m.bounds;
    const W = (maxX - minX) * S + pad * 2, H = (maxZ - minZ) * S + pad * 2;
    const X = (x) => pad + (x - minX) * S, Z = (z) => pad + (z - minZ) * S;
    const g = svg("svg", { viewBox: `0 0 ${W.toFixed(0)} ${H.toFixed(0)}`, class: "n-map" });
    // 벽: 두 번 그은 선
    g.append(svg("path", { d: wobblyRect(pad, pad, W - pad * 2, H - pad * 2, r, 1.2), class: "wall" }), svg("path", { d: wobblyRect(pad + 1, pad - 1, W - pad * 2, H - pad * 2, r, 1.6), class: "wall thin" }));
    for (const b of m.boxes) {
      const w = (b.maxX - b.minX) * S, h = (b.maxZ - b.minZ) * S;
      if (w > (maxX - minX) * S * 0.7 || h > (maxZ - minZ) * S * 0.7) continue; // 벽은 위에서 그렸다
      const kind = /desk|chair/.test(b.name) ? "desk" : /ladder/.test(b.name) ? "ladder" : "thing";
      g.append(svg("path", { d: wobblyRect(X(b.minX), Z(b.minZ), w, h, r, 0.7), class: `box ${kind}` }));
    }
    // 벽 바깥 여백에 적는 이름. 방 한가운데에서 먼 쪽으로 민다.
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    for (const l of m.labels || []) {
      const dx = l.x - cx, dz = l.z - cz, side = Math.abs(dx) / (maxX - minX) > Math.abs(dz) / (maxZ - minZ);
      const x = X(l.x) + (side ? Math.sign(dx) * 15 : 0), y = Z(l.z) + (side ? 0 : dz < 0 ? -9 : 21);
      g.append(svg("text", { x, y, class: "label", transform: side ? `rotate(${dx < 0 ? -90 : 90} ${x} ${y})` : null, "dominant-baseline": side ? "middle" : null }, l.text));
    }
    // 살펴본 곳에는 다닌 순서대로 번호를 붙인다. 이름은 아래 목록에 적는다.
    const log = m.spots.filter((sp) => sp.status === "done" && st.seenAt?.[sp.id] != null).sort((p, q) => st.seenAt[p.id] - st.seenAt[q.id]);
    const no = new Map(log.map((sp, i) => [sp.id, i + 1]));
    const NUM = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
    // 조사점: 가까운 것끼리 한 묶음으로
    const groups = new Map();
    for (const sp of m.spots) {
      const key = `${Math.round(sp.x * 1.6)}:${Math.round(sp.z * 1.6)}:${sp.y > 2.2 ? 1 : 0}`;
      const G = groups.get(key) || { x: sp.x, z: sp.z, up: sp.y > 2.2, done: [], open: 0 };
      if (sp.status === "done") G.done.push(no.get(sp.id));
      else G.open++;
      groups.set(key, G);
    }
    let opens = 0;
    for (const G of groups.values()) {
      const x = X(G.x), y = Z(G.z);
      if (G.done.length) {
        g.append(svg("path", { d: `M${x - 5} ${y - 1} l3.5 4.5 l7 -9`, class: "check" }));
        if (G.up) g.append(svg("circle", { cx: x, cy: y, r: 10, class: "upring" }));
        const nums = G.done.filter(Boolean).sort((p, q) => p - q).map((n) => NUM[n - 1] || n).join("");
        g.append(svg("text", { x: x + (G.up ? 12 : 8), y: y - (G.up ? 8 : 6), class: "num" }, nums));
      } else if (G.open) {
        opens++;
        g.append(svg("circle", { cx: x, cy: y, r: 3.2, class: "dot" }));
      }
    }
    for (const n of m.npcs || []) g.append(svg("circle", { cx: X(n.x), cy: Z(n.z), r: 6, class: "npc" }), svg("text", { x: X(n.x), y: Z(n.z) - 11, class: "npcname" }, n.name));
    const me = m.me;
    g.append(svg("g", { transform: `translate(${X(me.x).toFixed(1)} ${Z(me.z).toFixed(1)}) rotate(${((-me.yaw * 180) / Math.PI).toFixed(1)})`, class: "me" },
      svg("path", { d: "M0 -11 L7 8 L0 4 L-7 8 Z" })));
    out.push(el("div.n-mapwrap", g));
    out.push(el("p.n-legend", el("span", el("i.red", "✓"), `살펴본 곳 ${log.length}`), el("span", el("i.red", "•"), `아직 보지 않은 곳 ${opens}`), el("span", el("i.ring"), "천장"), el("span", el("i", "▲"), m.me.note ? `나 (${m.me.note})` : "나")));
    if (log.length) out.push(el("h4", "다닌 순서"), el("ol.n-route", log.map((sp, i) => el("li", el("i", NUM[i] || i + 1), el("span", sp.label), el("time", stamp(st.seenAt[sp.id]))))));
    return out;
  }

  // ── 법칙 ──
  function pageLaws() {
    const L = def.laws || {}, known = L.known || [];
    return [head("법칙", "도장에 대하여"),
      el("div.n-taped", el("i.n-tape"), el("p", `「${L.note || "찍기 전에는 세 번 읽어라"}」`), el("small", "증거판 옆에 붙어 있던 쪽지. 누구의 글씨인지 모른다.")),
      el("p.n-lawintro", "도장을 찍으면 그 문장은 모두가 아는 일이 된다. 무엇을 치르는지는 찍어 봐야 안다."),
      el("ol.n-laws", ["①", "②", "③", "④", "⑤"].map((no, i) => el(`li${known[i] ? ".known" : ""}`, el("i", no), known[i] || el("span.n-blank")))),
      el("p.n-dim", "아직 배운 것이 없다. 이 방에는 찍을 문장이 없다.")];
  }

  // ── 조작 ──
  function pageKeys() {
    const rows = [["W A S D", "걷는다 (Shift: 빠르게)"], ["마우스 끌기", "둘러본다"], ["바닥 누르기", "그 자리로 걸어간다"], ["붉은 동그라미 · E", "살펴본다"],
      ["F", "휴대폰 카메라"], ["G", "개조된 펜"], ["I", "가진 물건을 꺼내 본다"], ["Tab", "수첩"], ["B", "증거판"], ["L", "마우스 시점 고정"], ["Esc", "닫는다 · 물러난다"]];
    return [head("조작", "손에 익히는 것"),
      el("ul.n-keys", rows.map(([k, v]) => el("li", el("kbd", k), el("span", v)))),
      el("h4", "증거판에서"),
      el("ul.n-keys", [["카드 끌기", "자리를 옮긴다"], ["두 장 누르기", "잇는다 (연필 손잡이를 끌어도 된다)"], ["1 2 3 4", "맞지 않는다 · 같다 · 앞뒤 · 원문"], ["아래로 끌기", "시간 띠에 꽂거나 원고지의 빈칸에 끼운다"]].map(([k, v]) => el("li", el("kbd", k), el("span", v)))),
      el("p.n-dim", "살펴보기와 대화에는 게임 속 시간이 든다. 걷는 데는 들지 않는다. 수첩과 증거판을 펼친 동안 시계는 멈춘다.")];
  }

  const RENDER = { q: pageQuestions, facts: pageFacts, people: pagePeople, map: pageMap, laws: pageLaws, keys: pageKeys };

  function drawTabs() {
    const unseen = bookUnseen(def, st);
    tabsEl.replaceChildren(...TABS.map((t, i) => el(`button.n-tab.t${i}${i === cur ? ".on" : ""}`, { onclick: () => go(i), title: `${i + 1}` },
      t.label, unseen[t.id] && i !== cur ? el("i.n-badge") : null)));
  }
  function draw() {
    fresh.clear();
    const body = el("div.n-body", RENDER[TABS[cur].id]());
    page.replaceChildren(body);
    page.dataset.tab = TABS[cur].id;
    // 새 줄은 차례로 써진다
    const news = [...body.querySelectorAll(".n-new")];
    news.forEach((n, i) => n.style.setProperty("--d", `${260 + i * 240}ms`));
    if (news.length) {
      news.slice(0, 4).forEach((_, i) => setTimeout(() => done && sfx.pencil(0.34), 260 + i * 240));
      news[0].scrollIntoView?.({ block: "nearest" });
    }
    markBookSeen(st, fresh);
    st.book.tab = TABS[cur].id;
    foot.replaceChildren("수첩을 펼친 동안 시계는 멈춘다 · ", el("kbd", "←"), el("kbd", "→"), " 쪽 넘기기 · ", el("kbd", "Tab"), " 덮는다");
    drawTabs();
    save();
  }
  // 쪽을 넘긴다: 앞으로 가면 지금 쪽이 위로 넘어가고, 뒤로 가면 넘겨 둔 쪽이 도로 내려온다
  function go(i) {
    i = (i + TABS.length) % TABS.length;
    if (i === cur || flipping) return;
    const forward = i > cur;
    const old = page.cloneNode(true);
    old.classList.add("n-ghost");
    cur = i;
    draw();
    flipping = true;
    sfx.page();
    if (forward) {
      old.classList.add("up");
      stack.append(old);
    } else {
      stack.insertBefore(old, page);
      page.classList.add("down");
    }
    setTimeout(() => {
      old.remove();
      page.classList.remove("down");
      flipping = false;
    }, 430);
  }

  const onKey = (e) => {
    if (e.code === "Tab") e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.code === "Escape" || e.code === "Tab") close();
    else if (e.code === "ArrowRight" || e.code === "ArrowDown" || e.code === "KeyD") go(cur + 1);
    else if (e.code === "ArrowLeft" || e.code === "ArrowUp" || e.code === "KeyA") go(cur - 1);
    else if (/^(Digit|Numpad)[1-6]$/.test(e.code)) go(Number(e.code.slice(-1)) - 1);
    else if (e.code === "KeyH") go(TABS.length - 1);
    else if (e.code === "KeyB") close("board");
  };
  function close(next) {
    if (!done) return;
    window.removeEventListener("keydown", onKey, true);
    ro.disconnect();
    layer.classList.add("out");
    sfx.page();
    save();
    const d = done;
    done = null;
    setTimeout(() => {
      layer.remove();
      d(next || null);
    }, 240);
  }
  // 수첩은 640 x 860으로 짜고, 화면에 맞춰 통째로 키우거나 줄인다
  const fit = () => {
    const k = Math.max(0.5, Math.min(1.5, (layer.clientHeight || 900) / 960, (layer.clientWidth || 800) / 790));
    book.style.zoom = foot.style.zoom = k.toFixed(3);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(layer);
  fit();
  layer.addEventListener("pointerdown", (e) => e.target === layer && close());
  window.addEventListener("keydown", onKey, true);
  draw();
  sfx.page();
  return Object.assign(new Promise((r) => (done = r)), { api: { go, close, tab: () => TABS[cur].id, el: layer } });
}

// 수첩에 들어갈 열쇠를 미리 살핀다 (HUD의 표시가 쓴다)
export { bookKeys };
