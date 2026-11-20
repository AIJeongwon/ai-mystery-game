// 답안 대조 — 라이트 박스 위에 가채점 답안을 겹친다. 같은 칸을 칠한 곳은 겹칠수록 짙어진다.
// 정답 필름(붉은 동그라미)을 얹으면, 모두가 짙게 칠했는데 동그라미 밖에 있는 칸이 하나 남는다.
// 이 화면의 '아하': 서로 모르는 네 사람이 한 문제에서 똑같이, 전국에서 백에 둘만 고른 답을 골랐다.
import { el } from "./hud.js";
import { makeFrame, svg, put, hash, won, CIRCLED } from "./probe.js";
import { answersView, answersToggle, answersPick, answersChance } from "./records.js";
import { sfx } from "./sfx.js";

const CW = 33, RH = 58, X0 = 74, Y0 = 122, GAP = 28, H = 470;

export function openAnswers({ root, def, st, id, save = () => {}, spent = 0 }) {
  const A = def.records.answers[id];
  const F = makeFrame({ root, kind: "answers", title: A.title, sub: A.source, prompt: A.prompt, def, st, save, spent });
  let film = false, sel = null, bad = null;
  const n = A.questions.length, extraN = Math.max(0, ...A.sheets.map((s) => s.extra?.length || 0));
  const colX = (i) => X0 + i * CW + CW / 2;
  const extraX = (j) => X0 + n * CW + GAP + j * CW + CW / 2;
  const rowY = (o) => Y0 + (o - 1) * RH + RH / 2;
  const W = (extraN ? extraX(extraN - 1) : colX(n - 1)) + CW / 2 + 34;

  const art = svg("svg", { class: "a-art", viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  const tray = el("div.a-tray");
  const noteEl = el("div.a-note");
  const foot = el("div.a-foot");
  const detail = el("div.a-detail");
  F.body.append(el("div.a-wrap", tray, el("div.a-main", el("div.a-box", el("div.a-glass", art), el("i.a-lamp")), foot, detail), el("div.a-side", noteEl)));

  const oval = (x, y, cls) => svg("ellipse", { cx: x, cy: y, rx: 7.5, ry: 13, class: cls });
  // 손으로 칠한 칸: 사람마다 조금씩 비뚤다
  const mark = (x, y, seed) => {
    const r = hash(seed), r2 = hash(`${seed}b`);
    return svg("ellipse", { cx: (x + (r - 0.5) * 2.4).toFixed(1), cy: (y + (r2 - 0.5) * 3).toFixed(1), rx: (6.6 + r * 1.2).toFixed(1), ry: (11.6 + r2 * 1.6).toFixed(1), class: "a-mark", transform: `rotate(${((r - 0.5) * 9).toFixed(1)} ${x} ${y})` });
  };
  const ring = (x, y, seed, cls) => {
    const r = hash(seed), pts = [];
    for (let i = 0; i <= 26; i++) {
      const a = -2.1 + (i / 24) * Math.PI * 2, k = 1 + Math.sin(a * 3 + r * 6) * 0.05 + (i / 24) * 0.05;
      pts.push(`${(x + Math.cos(a) * 14 * k).toFixed(1)} ${(y + Math.sin(a) * 20 * k).toFixed(1)}`);
    }
    return svg("path", { d: `M${pts.join(" L")}`, class: cls, pathLength: 1 });
  };

  function draw() {
    const v = answersView(def, st, id);
    const kids = [];
    // 유리판 위에 인쇄된 것처럼 보이는 문항 번호 (답안지를 올려야 또렷해진다)
    const head = svg("g", { class: `a-print${v.on.length ? " lit" : ""}` });
    A.questions.forEach((q, i) => head.append(svg("text", { x: colX(i), y: Y0 - 16, class: `a-num${sel?.q === q ? " on" : ""}`, "text-anchor": "middle" }, q)));
    for (let j = 0; j < extraN; j++) head.append(svg("text", { x: extraX(j), y: Y0 - 16, class: "a-num dim", "text-anchor": "middle" }, 23 + j));
    for (let o = 1; o <= 5; o++) head.append(svg("text", { x: X0 - 22, y: rowY(o) + 6, class: "a-opt", "text-anchor": "middle" }, CIRCLED[o]));
    head.append(svg("text", { x: X0, y: Y0 - 44, class: "a-cap" }, "공통 1~15"));
    if (extraN) head.append(svg("text", { x: extraX(0) - CW / 2, y: Y0 - 44, class: "a-cap dim" }, "선택 과목 23~28"));

    // 겹친 답안지: 한 장씩, 조금씩 어긋나게
    v.on.forEach((s, k) => {
      const dx = (hash(`${s.id}x`) - 0.5) * 7, dy = (hash(`${s.id}y`) - 0.5) * 6, rot = (hash(`${s.id}r`) - 0.5) * 0.9;
      const g = svg("g", { class: "a-sheet", "data-sheet": s.id, transform: `translate(${dx.toFixed(1)} ${dy.toFixed(1)}) rotate(${rot.toFixed(2)} ${W / 2} ${H / 2})`, style: `animation-delay:${k * 40}ms` });
      g.append(svg("rect", { x: 18, y: 26, width: W - 36, height: H - 52, rx: 3, class: "a-paper" }),
        svg("text", { x: 34 + k * 196, y: 50, class: "a-name" }, `${s.who} · ${s.where}`));
      A.questions.forEach((q, i) => {
        for (let o = 1; o <= 5; o++) g.append(oval(colX(i), rowY(o), "a-oval"));
        g.append(mark(colX(i), rowY(s.answers[q]), `${s.id}${q}`));
      });
      (s.extra || []).forEach((o2, j) => {
        for (let o = 1; o <= 5; o++) g.append(oval(extraX(j), rowY(o), "a-oval"));
        g.append(mark(extraX(j), rowY(o2), `${s.id}x${j}`));
      });
      kids.push(g);
    });
    kids.push(head);
    if (!v.on.length) kids.push(svg("text", { x: W / 2, y: H / 2 + 8, class: "a-empty", "text-anchor": "middle" }, "왼쪽의 답안을 눌러 유리판에 올려놓는다"));
    // 선택 과목: 사람마다 과목이 달라 견줄 수 없다
    if (extraN && v.on.length > 1) kids.push(svg("rect", { x: extraX(0) - CW / 2 - 6, y: Y0 - 8, width: extraN * CW + 12, height: RH * 5 + 16, rx: 4, class: "a-hatch" }));

    // 정답 필름
    if (film) {
      const g = svg("g", { class: "a-film" }, svg("rect", { x: X0 - 44, y: Y0 - 62, width: n * CW + 60, height: RH * 5 + 84, rx: 4, class: "a-film-sheet" }),
        svg("text", { x: X0 + n * CW + 4, y: Y0 + RH * 5 + 14, class: "a-film-cap", "text-anchor": "end" }, "정답 · 국가시험관리원 공개"));
      A.questions.forEach((q, i) => g.append(ring(colX(i), rowY(A.key[q]), `k${q}`, "a-keyring")));
      kids.push(g);
    }
    // 짚은 칸, 찾아낸 칸
    if (v.done) kids.push(ring(colX(A.questions.indexOf(A.find.q)), rowY(A.find.option), "found", "a-found"));
    else if (sel) kids.push(ring(colX(A.questions.indexOf(sel.q)), rowY(sel.o), `s${sel.q}${sel.o}`, `a-sel${bad === `${sel.q}:${sel.o}` ? " bad" : ""}`));
    // 누를 자리
    A.questions.forEach((q, i) => {
      for (let o = 1; o <= 5; o++) {
        const hit = svg("rect", { x: colX(i) - CW / 2, y: rowY(o) - RH / 2, width: CW, height: RH, class: "a-hit", "data-q": q, "data-o": o });
        hit.addEventListener("click", () => select(q, o));
        kids.push(hit);
      }
    });
    if (extraN) {
      const hit = svg("rect", { x: extraX(0) - CW / 2, y: Y0, width: extraN * CW, height: RH * 5, class: "a-hit" });
      hit.addEventListener("click", () => F.slip("선택 과목은 사람마다 다르다. 견줄 수 있는 것은 모두가 푼 공통 문항이다.", "plain"));
      kids.push(hit);
    }
    put(art, kids);
    art.dataset.n = String(v.on.length);

    // 왼쪽: 올려놓을 것들
    put(tray,
      el("h5", "답안"),
      v.sheets.map((s, i) => el(`button.a-item${s.on ? ".on" : ""}${s.owned ? "" : ".none"}`, { disabled: !s.owned || null, onclick: () => toggle(s.id) },
        el("i", String(i + 1)), el("b", s.owned ? s.who : "아직 없다"), el("span", s.owned ? s.where : "다른 사람의 가채점"), el("small", s.owned ? `선택 · ${s.elective}` : ""), el("em", s.on ? "올려놓았다" : s.owned ? "올린다" : ""))),
      v.ready && !v.stacked ? el("button.a-all", { onclick: () => stackAll() }, "모두 올린다") : null,
      el("h5", "필름"),
      el(`button.a-item.film${film ? ".on" : ""}`, { onclick: () => setFilm(!film) }, el("i", "○"), el("b", "정답 필름"), el("span", "공개된 정답에 붉은 동그라미"), el("em", film ? "얹어 놓았다" : "얹는다")),
      el("p.a-tip", "같은 칸을 칠한 답안은 겹칠수록 짙어진다. 다른 칸을 칠했다면 옅은 자국이 흩어진다."));

    put(foot, el("span", `유리판 위 ${v.on.length}장`, film ? " · 정답 필름" : ""), v.done ? el("span.l-done", "쪽지가 됐다") : el("span.a-foot-tip", "이상한 칸을 누르면 오른쪽에 그 문항이 펼쳐진다"));

    // 오른쪽: 찾을 것, 찾아낸 뒤의 셈
    const out = [el("h5", "찾을 것"), el("p.l-ask", A.prompt)];
    if (v.done) {
      const c = answersChance(def, id);
      out.push(el("div.a-chance",
        el("p", Array.from({ length: c.people }, () => `${c.percent}%`).join(" × ")),
        el("b", `${won(c.oneIn)} 번에 한 번`),
        el("small", `서로 모르는 ${c.people}사람이 저마다 골라 이렇게 될 일`)));
    } else out.push(el("ol.a-steps",
      el(`li${v.stacked ? ".ok" : ""}`, "답안 넷을 모두 유리판에 올린다"),
      el(`li${film ? ".ok" : ""}`, "정답 필름을 얹어 본다"),
      el(`li${v.ratios ? ".ok" : ""}`, "그 답이 얼마나 드문지 말해 줄 숫자를 가져온다"),
      el("li", "우연일 수 없는 칸을 짚는다")));
    out.push(el("p.l-dim.l-rule", "틀려도 시간은 들지 않는다. 까닭만 듣는다."));

    // 유리판 아래: 고른 문항을 펼쳐 놓는다
    const q = v.done ? A.find.q : sel?.q, o = v.done ? A.find.option : sel?.o;
    if (q == null) put(detail, el("p.a-idle", "칸을 누르면 그 문항에서 누가 무엇을 칠했는지, 그 답을 전국에서 얼마나 골랐는지 여기에 펼쳐진다."));
    else {
      const col = v.cols.find((c) => c.q === q), R = v.ratios?.[q];
      put(detail,
        el("div.a-d-who", el("h5", `${q}번 · 누가 무엇을 칠했나`),
          el("ul.a-who", v.on.length ? v.on.map((s) => el("li", el("span", s.who), el("b", CIRCLED[s.answers[q]]))) : el("li.l-dim", "올려놓은 답안이 없다."),
            el("li.key", el("span", "정답"), el("b", CIRCLED[A.key[q]])))),
        el("div.a-d-ratio", el("h5", "전국의 선택 비율"),
          R ? el("div.a-bars", R.map((pct, i) => el(`div.a-bar${i + 1 === A.key[q] ? ".key" : ""}${i + 1 === o ? ".sel" : ""}`,
            el("i", CIRCLED[i + 1]), el("span", el("u", { style: { width: `${Math.max(1.5, pct)}%` } })), el("b", `${pct}%`),
            el("small", i + 1 === A.key[q] ? "정답" : col?.same && col.picks[0] === i + 1 && v.on.length > 1 ? "칠한 칸" : ""))))
            : el("p.a-lack", "이 답을 고른 사람이 전국에 얼마나 되는지 모른다. 문항별 선택 비율을 찾아야 한다."),
          R ? el("p.l-dim", "가온입시연구소 · 가채점 11만 2천 건") : null),
        el("div.a-d-act",
          v.done ? el("p.a-d-done", `${q}번의 ${CIRCLED[o]}`, el("small", "넷이 함께 고른, 백에 둘뿐인 답"))
            : [el("p.a-d-ask", `${q}번의 ${CIRCLED[o]}`), el("button.l-submit.a-pick", { onclick: () => pick() }, "이 칸은 우연일 수 없다"), el("button.w-cancel", { onclick: () => select(q, o) }, "그만둔다")]));
    }
    put(noteEl, out);
    F.clock();
  }
  function toggle(sheetId) {
    if (!answersToggle(def, st, id, sheetId)) return false;
    sfx.paper();
    save();
    draw();
    return true;
  }
  function stackAll() {
    for (const s of answersView(def, st, id).sheets) if (s.owned && !s.on) answersToggle(def, st, id, s.id);
    sfx.paper();
    save();
    draw();
  }
  function setFilm(on) {
    film = Boolean(on);
    sfx.page();
    draw();
  }
  function select(q, o) {
    if (answersView(def, st, id).done) return;
    sel = sel && sel.q === q && sel.o === o ? null : { q, o };
    bad = null;
    sfx.pencil(0.2);
    draw();
  }
  function pick(q = sel?.q, o = sel?.o) {
    if (q == null) return null;
    sel = { q, o };
    const res = answersPick(def, st, id, q, o);
    if (!res.ok) {
      if (res.kind === "miss") {
        bad = `${q}:${o}`;
        F.miss(res);
      } else F.slip(res.text, "plain");
      draw();
      return res;
    }
    sel = null;
    film = true;
    F.gain(res, `${res.chance.percent}%가 ${res.chance.people}번 겹쳤다. ${won(res.chance.oneIn)} 번에 한 번.`);
    draw();
    return res;
  }
  F.onEsc = () => {
    if (!sel) return false;
    sel = null;
    draw();
    return true;
  };
  draw();
  return Object.assign(F.promise, { api: { toggle, stackAll, film: setFilm, select, pick, close: F.close, view: () => answersView(def, st, id), el: F.layer } });
}
