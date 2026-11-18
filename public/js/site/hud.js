// 현장의 화면 글자 — 가운데 점, 장소와 시각, 지금의 물음, 살펴보기 문장, 수첩.
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
  const notebook = el("div.s-notebook.off");
  const stats = el("div.s-stats.off");
  const tool = el("div.s-tool.off");
  const veil = el("div.s-veil");
  const layer = el("div.s-hud", el("div.s-top", el("div.s-where", place, clock), question), dot, prompt, caption, toasts, belt, sketch, bubble, tool, notebook, stats, veil);
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
  hud.evidence = (id, ev) => {
    const t = el("div.s-toast.evidence", el("span.s-ev-no", id), el("div", el("b", ev.title), el("small", `${ev.kind} · 수첩에 적었다`)));
    toasts.append(t);
    setTimeout(() => t.classList.add("out"), 4200);
    setTimeout(() => t.remove(), 4700);
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

  hud.setBelt = (items, active, holding) => {
    belt.replaceChildren(...[
      ...items.map((it) => el(`div.s-belt-item${active === it.tool ? ".on" : ""}`, it.key ? el("kbd", it.key) : null, it.title)),
      holding ? el("div.s-belt-item.holding", `들고 있다: ${holding}`) : null,
      el("div.s-belt-item.dim", el("kbd", "I"), "소지품"),
      el("div.s-belt-item.dim", el("kbd", "Tab"), "수첩"),
      el("div.s-belt-item.dim", el("kbd", "H"), "조작"),
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

  // ── 수첩 (간이): 물음, 얻은 것, 시한. 본격적인 수첩은 다음 단계에서 만든다 ──
  hud.notebookOpen = () => !notebook.classList.contains("off");
  hud.toggleNotebook = (def, st, extra) => {
    if (hud.notebookOpen()) return notebook.classList.add("off"), false;
    const ev = Object.keys(st.evidence).sort((a, b) => st.evidence[a] - st.evidence[b]);
    notebook.classList.remove("help");
    notebook.replaceChildren(
      el("div.s-nb-page",
        el("h3", "물음"),
        el("p.s-nb-q", extra.question?.text || "—"),
        extra.deadline ? el("p.s-nb-deadline", `시한 · ${extra.deadline}`) : null,
        el("h3", `얻은 것 ${ev.length}`),
        ev.length ? el("ul", ev.map((id) => el("li", el("i", id), el("div", el("b", def.evidence[id]?.title || id), el("span", def.evidence[id]?.text || ""))))) : el("p.dim", "아직 없다."),
        st.statements.length ? el("h3", "밑줄") : null,
        st.statements.length ? el("ul", st.statements.map((s) => el("li", el("i", "진술"), el("div", el("b", s.who), el("span", `"${s.text}"`))))) : null,
        el("p.s-nb-foot", "수첩을 펼친 동안 시계는 멈춘다 · Tab으로 닫는다"),
      ),
    );
    notebook.classList.remove("off");
    return true;
  };

  hud.help = () => {
    const open = notebook.classList.contains("help") && hud.notebookOpen();
    notebook.classList.toggle("help", !open);
    if (open) return notebook.classList.add("off");
    notebook.replaceChildren(el("div.s-nb-page",
      el("h3", "조작"),
      el("ul.s-keys",
        [["W A S D", "걷기 (Shift: 빠르게)"], ["마우스 끌기", "둘러보기"], ["바닥 누르기", "그 자리로 걸어간다"], ["붉은 동그라미 누르기 · E", "살펴본다"],
          ["F", "휴대폰 카메라"], ["G", "개조된 펜"], ["I", "가진 물건 살펴보기"], ["Tab", "수첩"], ["L", "마우스 시점 고정"], ["Esc", "닫기 · 물러나기"]]
          .map(([k, v]) => el("li", el("i", k), el("div", el("span", v))))),
      el("p.s-nb-foot", "살펴보기와 대화에는 게임 속 시간이 든다. 걷는 데는 들지 않는다."),
    ));
    notebook.classList.remove("off");
  };

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
