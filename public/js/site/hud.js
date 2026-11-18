// 현장의 화면 글자 — 가운데 점, 장소와 시각, 지금의 물음, 살펴보기 문장, 허리띠(도구·수첩·증거판).
// 사실적인 3D 위에 '기자의 수첩'이라는 종이 한 겹을 얹는다: 명조체, 종이색, 붉은 색연필.

export function el(spec, props, ...kids) {
  const [tag, ...cls] = spec.split(".");
  const e = document.createElement(tag || "div");
  if (cls.length) e.className = cls.join(" ");
  if (props && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style") Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 한 글자씩 적는다. 흐른 시간으로 세므로 화면이 느려도 말이 밀리지 않는다.
export function typeInto(node, text, cps = 60, skipped = () => false) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const n = skipped() ? text.length : Math.min(text.length, Math.floor(((performance.now() - t0) / 1000) * cps) + 1);
      node.textContent = text.slice(0, n);
      if (n >= text.length) resolve();
      else setTimeout(tick, 16);
    };
    tick();
  });
}

export function makeHud(root) {
  const place = el("div.s-place");
  const clock = el("div.s-clock");
  const question = el("div.s-question");
  const dot = el("div.s-dot");
  const prompt = el("div.s-prompt.off");
  const caption = el("div.s-caption.off");
  const toasts = el("div.s-toasts");
  const belt = el("div.s-belt");
  const sketch = el("div.s-sketch.off");
  const bubble = el("div.s-bubble.off");
  const flash = el("div.s-flash");
  const stats = el("div.s-stats.off");
  const tool = el("div.s-tool.off");
  const veil = el("div.s-veil");
  const layer = el("div.s-hud", el("div.s-top", el("div.s-where", place, clock), question), dot, prompt, caption, toasts, belt, sketch, bubble, tool, stats, flash, veil);
  root.append(layer);

  const hud = { layer, tool, busy: false };

  hud.setPlace = (t) => (place.textContent = t);
  let lastClock = "";
  hud.setClock = (t, spent) => {
    if (t === lastClock) return;
    lastClock = t;
    clock.textContent = t;
    if (spent) {
      const tick = el("span.s-spent", `+${spent}분`);
      clock.append(tick);
      setTimeout(() => tick.remove(), 1600);
    }
  };
  let lastQ = "";
  hud.setQuestion = (q, [have, total] = [0, 0]) => {
    const key = `${q?.id}:${have}`;
    if (key === lastQ) return;
    const changed = !lastQ.startsWith(`${q?.id}:`);
    lastQ = key;
    question.replaceChildren();
    if (!q) return;
    question.append(el("span.s-q-eyebrow", "지금의 물음"), el("span.s-q-text", q.text));
    if (q.sub) question.append(el("span.s-q-sub", q.sub));
    if (total) question.append(el("span.s-q-dots", "●".repeat(have) + "○".repeat(total - have)));
    if (changed) {
      question.classList.remove("flash");
      void question.offsetWidth;
      question.classList.add("flash");
    }
  };

  hud.setPrompt = (key, parts) => {
    prompt.classList.toggle("off", !parts);
    if (prompt.dataset.k === key) return;
    prompt.dataset.k = key;
    prompt.replaceChildren(...(parts || []));
  };
  hud.promptParts = (key, verb, label, extra) => [el("kbd", key), el("b", verb), el("span", label), extra ? el("em", extra) : null].filter(Boolean);
  hud.setDot = (mode) => (dot.dataset.mode = mode || "");

  // ── 살펴보기 문장: 한 줄씩, 누르면 다음 ──
  let advance = null;
  hud.advance = () => {
    if (!advance) return false;
    advance();
    return true;
  };
  hud.caption = async (lines, { speaker } = {}) => {
    hud.busy = true;
    caption.classList.remove("off");
    for (const line of lines) {
      const body = el("div.s-cap-text");
      caption.replaceChildren(...[speaker ? el("div.s-cap-speaker", speaker) : null, body, el("div.s-cap-next", "▾")].filter(Boolean));
      let skip = false, next = null;
      advance = () => {
        if (!skip) skip = true;
        else next?.();
      };
      await typeInto(body, line, 60, () => skip);
      skip = true;
      await new Promise((r) => (next = r));
    }
    advance = null;
    caption.classList.add("off");
    hud.busy = false;
  };

  hud.toast = (text, kind = "note", ms = 3800) => {
    const t = el(`div.s-toast.${kind}`, text);
    toasts.append(t);
    setTimeout(() => t.classList.add("out"), ms);
    setTimeout(() => t.remove(), ms + 500);
  };
  // 얻은 것: 사진이 있으면 사진과 함께. 사라질 때는 허리띠의 증거판 쪽으로 날아간다.
  hud.evidence = (id, ev, photo) => {
    const note = ev.kind === "추론";
    const t = el(`div.s-toast.evidence${note ? ".note" : ""}`,
      photo ? el("img", { src: photo, alt: "" }) : null,
      el("span.s-ev-no", id),
      el("div", el("b", ev.title), el("small", note ? "추론 · 증거판에 쪽지가 붙었다" : `${ev.kind} · 수첩에 적고 판에 꽂았다`)));
    toasts.append(t);
    setTimeout(() => {
      const to = belt.querySelector('[data-k="board"]')?.getBoundingClientRect(), from = t.getBoundingClientRect();
      if (to && from.width) t.style.translate = `${Math.round(to.left + to.width / 2 - from.left - from.width / 2)}px ${Math.round(to.top - from.top)}px`;
      t.classList.add("fly");
    }, 4200);
    setTimeout(() => t.remove(), 4850);
  };
  // 사진을 찍는 순간
  hud.flash = () => {
    flash.classList.remove("on");
    void flash.offsetWidth;
    flash.classList.add("on");
  };

  hud.sketch = async (lines) => {
    sketch.replaceChildren(...lines.map((l) => el("p", l)));
    sketch.classList.remove("off");
    await sleep(5200);
    sketch.classList.add("off");
  };

  // 인물의 한마디 (머리 위)
  let bubbleTimer = 0;
  hud.bubble = (name, text, ms = 3600) => {
    bubble.replaceChildren(el("b", name), el("span", text));
    bubble.classList.remove("off");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.add("off"), ms);
  };
  hud.bubbleAt = (x, y, visible) => {
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    bubble.style.visibility = visible ? "visible" : "hidden";
  };

  // 허리띠: 도구, 들고 있는 것, 소지품, 수첩, 증거판. 수첩과 증거판은 눌러서도 연다.
  // marks: { book: 새로 적힌 줄 수, board: 새 카드 수, nudge: 지금 물음이 증거판에서 풀리는가 }
  hud.onBelt = null;
  hud.setBelt = (items, active, holding, marks = {}) => {
    const link = (k, key, title, n, nudge) => el(`div.s-belt-item.dim.link${nudge ? ".nudge" : ""}`, { "data-k": k, onclick: () => hud.onBelt?.(k) }, el("kbd", key), title, n ? el("span.s-badge", String(n)) : null);
    belt.replaceChildren(...[
      ...items.map((it) => el(`div.s-belt-item${active === it.tool ? ".on" : ""}`, it.key ? el("kbd", it.key) : null, it.title)),
      holding ? el("div.s-belt-item.holding", `들고 있다: ${holding}`) : null,
      el("div.s-belt-item.dim", el("kbd", "I"), "소지품"),
      link("book", "Tab", "수첩", marks.book, false),
      link("board", "B", "증거판", marks.board, marks.nudge),
    ].filter(Boolean));
  };

  // ── 도구 화면: 휴대폰 카메라 틀, 펜의 숫자 ──
  hud.setTool = (kind, info = {}) => {
    if (tool.dataset.k !== (kind || "")) {
      tool.dataset.k = kind || "";
      tool.className = `s-tool ${kind || "off"}`;
      if (kind === "phone") tool.replaceChildren(el("div.s-phone-cam"), el("div.s-phone-bar", el("i"), "카메라 · 화면 가운데를 맞춘다"), el("div.s-phone-ring"));
      else if (kind === "pen") tool.replaceChildren(el("div.s-pen", el("div.s-pen-lens", el("div.s-pen-digit")), el("small", "왼쪽 알 너머로 본 펜 · 뚜껑을 위로")));
      else tool.replaceChildren();
    }
    if (kind === "phone") {
      tool.querySelector(".s-phone-ring").style.setProperty("--p", String(info.progress || 0));
      tool.classList.toggle("found", Boolean(info.found));
    } else if (kind === "pen") {
      const d = tool.querySelector(".s-pen-digit");
      if (d.textContent !== (info.digit || "E")) d.textContent = info.digit || "E";
      tool.classList.toggle("found", (info.digit || "E") !== "E");
    }
  };
  // 휴대폰 화면이 차지하는 자리 (캔버스 좌표). 엔진이 여기에 두 번째 시점을 그린다.
  hud.phoneRect = () => tool.querySelector(".s-phone-cam")?.getBoundingClientRect() || null;

  hud.setStats = (text) => {
    stats.classList.toggle("off", !text);
    stats.textContent = text || "";
  };
  hud.fade = async (on, ms = 350) => {
    veil.style.transitionDuration = `${ms}ms`;
    veil.classList.toggle("on", on);
    await sleep(ms);
  };
  hud.setMode = (mode) => (layer.dataset.mode = mode);
  hud.dispose = () => layer.remove();
  return hud;
}

// 고르기: 둘 가운데 하나. 돌려주는 값은 고른 option.
export function choose(root, { prompt, options }) {
  return new Promise((resolve) => {
    const box = el("div.s-choice",
      el("div.s-choice-card",
        el("h3", prompt),
        options.map((o) => el("button.s-choice-opt", { onclick: () => { box.remove(); resolve(o); } }, el("b", o.label), el("span", o.sub || ""))),
      ));
    root.append(box);
  });
}
