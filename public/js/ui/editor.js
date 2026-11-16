// 편집국 — 기사를 직접 쓰고, 한 문장에 記定 도장을 찍고, 발행한다.
import { G } from "../core/store.js";
import { emit } from "../core/bus.js";
import { fmtDate, fmtNum, fmtWon, splitSentences, escapeHtml, sleep, fmtDuration } from "../core/util.js";
import { h, $, mount, icon, chip, bar, modal, toast, sealSvg, confirmDialog } from "./dom.js";
import { CATS } from "../data/world.js";
import { DEPTH_KO } from "../data/templates.js";
import { SCOPES } from "../data/progress.js";
import { cfull } from "../sim/world.js";
import { notes, publish, upLv, requestDraft } from "../sim/press.js";
import { appraise, effectText, scopeKo } from "../sim/canon.js";
import { judgeRequest } from "../llm/prompts.js";
import { ask } from "../llm/api.js";
import { hold, release } from "../sim/clock.js";
import { CHAPTERS } from "../campaign/chapters.js";
import { ripple, focusCountry } from "./map.js";
import { sfx, music } from "../audio.js";

let openState = null;
let flowBusy = 0; // 발행 → 결과 → 도장 연출이 끝날 때까지 다른 연출(캠페인 컷신)이 끼어들지 않게 한다
export const editorOpen = () => Boolean(openState) || flowBusy > 0;

export function openEditor(ev, onDone, opts = {}) {
  if (openState) return;
  const st = { ev, headline: opts.headline || "", body: opts.body || "", decree: null, busy: false };
  openState = st;
  hold();
  sfx("paper");
  const nb = ev ? notes(ev.id) : {};
  const facts = ev ? ev.facts.filter((f) => nb[f.id] && nb[f.id].st !== "debunked").sort((a, b) => a.depth - b.depth) : [];
  const minBody = opts.minBody ?? 60;

  const headInput = h("input.ed-headline", { placeholder: "제목을 쓰세요", maxLength: 60, value: st.headline, spellcheck: "false", autocomplete: "off" });
  const bodyInput = h("textarea.ed-body", { placeholder: ev ? "취재한 사실을 바탕으로 기사를 직접 쓰세요.\n왼쪽 수첩의 사실을 누르면 본문에 옮겨 적을 수 있습니다. 옮긴 뒤에는 당신의 문장으로 다듬으세요." : "칼럼을 쓰세요. 특정 사건에 매이지 않은 글입니다.", spellcheck: "false" });
  bodyInput.value = st.body;
  const counter = h("span.dim");
  const decreeBox = h("div.ed-decree.hidden");
  const checklist = h("div.ed-check");
  const overlay = h("div.ed-busy.hidden", h("div.boot-seal", "記定"), h("div.ed-busy-text", "데스크가 기사를 읽고 있다…"));

  function insertFact(f) {
    const n = nb[f.id];
    let text = f.text;
    if (n.st === "heard") text = text.replace(/([다요])\.$/, "$1는 증언이 나왔다.").replace(/다는 증언이/, "다는 증언이");
    const el = bodyInput;
    const s = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, s), after = el.value.slice(el.selectionEnd ?? s);
    const pad = before && !/\s$/.test(before) ? " " : "";
    el.value = before + pad + text + (after && !/^\s/.test(after) ? " " : "") + after;
    const pos = (before + pad + text).length;
    el.focus();
    el.setSelectionRange(pos, pos);
    sfx("key");
    sync();
  }

  function sync() {
    st.headline = headInput.value;
    st.body = bodyInput.value;
    counter.textContent = `${st.body.length}자`;
    if (st.decree && !st.body.includes(st.decree.sentence)) {
      st.decree = null;
      toast("도장을 찍은 문장이 본문에서 사라져 도장이 지워졌다.", "info");
    }
    renderDecree();
    // 체크리스트
    const used = facts.filter((f) => {
      const key = f.text.replace(/\s/g, "").slice(0, 12);
      return st.body.replace(/\s/g, "").includes(key);
    });
    const heardUsed = used.filter((f) => nb[f.id].st === "heard").length;
    const items = [
      [st.headline.trim().length >= 6, `제목 ${st.headline.trim().length}자 (6자 이상)`],
      [st.body.trim().length >= minBody, `본문 ${st.body.trim().length}자 (${minBody}자 이상)`],
    ];
    if (ev) items.push([used.length >= 1, `수첩에서 옮긴 사실 ${used.length}건`]);
    mount(checklist, items.map(([ok, text]) => h(`div.ck${ok ? ".ok" : ""}`, icon(ok ? "check" : "info", 13), text)),
      heardUsed ? h("div.ck.warn", icon("info", 13), `미확인 전언 ${heardUsed}건 포함 — 단정하면 오보가 될 수 있다`) : null);
    publishBtn.disabled = st.busy || st.headline.trim().length < 6 || st.body.trim().length < minBody;
  }
  function renderDecree() {
    decreeBox.classList.toggle("hidden", !st.decree);
    if (!st.decree) return;
    const ap = st.decree;
    mount(decreeBox,
      h("div.ed-seal", { html: sealSvg(54) }),
      h("div.grow", h("div.eyebrow", { style: { color: "#ff9c8c" } }, "도장을 찍은 문장"), h("div.ed-decree-s", `「${ap.sentence}」`),
        h("div.ed-decree-fx", `${scopeKo(ap.scopeIdx)}에 닿는다 · 인주 ${ap.cost} · ${ap.effects.map(effectText).join(" · ")}`)),
      h("button.icon-btn", { title: "도장 지우기", onclick: () => { st.decree = null; sync(); } }, icon("close")));
  }

  // ── 도장 찍기 ──
  async function pickDecree() {
    const sents = splitSentences(st.body).filter((s) => s.text.replace(/\s/g, "").length >= 8);
    if (!sents.length) return toast("본문에 완결된 문장이 없다. 먼저 문장을 쓰자.", "info");
    const choice = await new Promise((resolve) => {
      let done = false;
      const m = modal({
        title: "어느 문장에 도장을 찍겠습니까", eyebrow: "記定", cls: "wide",
        body: h("div", h("p.muted", { style: { marginBottom: "10px", lineHeight: 1.7 } }, "도장이 찍힌 문장은 진실 여부와 상관없이, 발행되는 순간 세상 모두가 원래부터 알던 상식이 됩니다. 한 기사에 한 문장만 찍을 수 있습니다."),
          h("div.sent-list", sents.map((s) => h("button.sent-pick", { onclick: () => { done = true; resolve(s.text); m.close(); } }, s.text)))),
        buttons: [{ label: "취소", ghost: true }],
        onClose: () => !done && resolve(null),
      });
    });
    if (!choice) return;
    const wait = modal({ title: "문장을 감정하는 중…", cls: "small", closable: false, body: h("div.confirm-text", `「${choice}」\n\n이 문장이 세계에 무엇을 하게 되는지 가늠하고 있다.`) });
    const ap = await appraise({ sentence: choice, ev, headline: st.headline });
    wait.close();
    showAppraisal(ap);
  }
  function showAppraisal(ap) {
    const lv = G.canon.lv;
    const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      h("div.paperbox", { style: { fontSize: "16px" } }, h("span.stamped", ap.sentence)),
      ap.effects.length ? h("div.card", h("div.eyebrow", "세상이 믿게 되는 것"), h("div.serif", { style: { fontSize: "16px", fontWeight: 700, margin: "4px 0 8px" } }, `「${ap.belief}」`),
        h("div.kv",
          h("dt", "범위"), h("dd", `${scopeKo(ap.scopeIdx)} ${ap.scopeIdx + 1 > lv.scope ? "(도장이 닿지 않음)" : ""}`),
          h("dt", "세기"), h("dd", `${ap.mag}단`),
          h("dt", "지속"), h("dd", ap.holdMin == null ? "영구" : fmtDuration(ap.holdMin)),
          h("dt", "인주"), h("dd", `${ap.cost} (보유 ${Math.floor(G.canon.ink)})`),
          h("dt", "왜곡"), h("dd", `+${ap.distortion.toFixed(1)}`)),
        h("div", { style: { marginTop: "8px", display: "flex", flexDirection: "column", gap: "3px" } }, ap.effects.map((e) => h("div.row", { style: { fontSize: "13px" } }, h("span", { style: { color: e.sign > 0 ? "var(--green)" : "var(--red)", fontWeight: 800 } }, e.sign > 0 ? "▲" : "▼"), `${e.name} — ${e.label}`)))) : null,
      ap.notes.map((n) => h("div.gold", { style: { fontSize: "13px" } }, `· ${n}`)),
      ap.problems.map((p) => h("div.red", { style: { fontSize: "13.5px", lineHeight: 1.6 } }, `✕ ${p}`)),
      ap.via === "rule" ? h("div.dim", { style: { fontSize: "12px" } }, "※ 해석기가 응답하지 않아 낱말 기준으로 어림했다.") : null);
    modal({
      title: ap.ok ? "이 문장에 도장을 찍겠습니까" : "도장이 먹지 않는다", eyebrow: "記定 감정", body,
      buttons: ap.ok
        ? [{ label: "그만둔다", ghost: true }, { label: "찍는다", primary: true, icon: "stamp", onclick: () => { st.decree = ap; sfx("stamp"); sync(); } }]
        : [{ label: "알겠다", primary: true }],
    });
  }

  // ── 초안 보조 / 교열 ──
  async function draft() {
    if (!ev || !facts.length) return toast("옮겨 적을 사실이 없다.", "info");
    if (st.body.trim() && !(await confirmDialog("지금 본문을 데스크 초안으로 바꿉니다. 계속할까요?", { title: "초안 보조" }))) return;
    setBusy(true, "데스크 보조가 초안을 잡는 중…");
    const d = await requestDraft(ev);
    setBusy(false);
    if (!d) return;
    bodyInput.value = d.body;
    if (!headInput.value.trim() && upLv("desk") >= 2) headInput.value = d.headline;
    toast("초안이 들어왔다. 그대로 내지 말고 당신의 문장으로 고쳐 쓰자.", "gold");
    sync();
  }
  async function review() {
    setBusy(true, "팩트체크 데스크가 검토 중…");
    const r = await ask(judgeRequest({ ev, headline: st.headline, body: st.body, decree: st.decree?.sentence, known: nb }));
    setBusy(false);
    if (!r.ok) return toast("팩트체크 데스크가 응답하지 않는다.", "bad");
    const j = r.data;
    modal({
      title: "교열 검토", eyebrow: "팩트체크 데스크", body: h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
        h("div.card", h("div.serif", { style: { lineHeight: 1.7 } }, `"${j.comment}"`)),
        j.false_claims?.length ? h("div.sect", h("h4", "사실과 다른 대목"), j.false_claims.map((c) => h("div.red", `✕ ${c}`))) : h("div.green", "✓ 사실과 어긋나는 대목은 찾지 못했다."),
        j.unsupported ? h("div.gold", `· 근거를 찾지 못한 주장 ${j.unsupported}건`) : null),
      buttons: [{ label: "고치러 간다", primary: true }],
    });
  }
  function setBusy(on, text) {
    st.busy = on;
    overlay.classList.toggle("hidden", !on);
    if (text) overlay.querySelector(".ed-busy-text").textContent = text;
    sync();
  }

  // ── 발행 ──
  async function doPublish() {
    if (st.busy) return;
    if (opts.validate) {
      const msg = opts.validate(st);
      if (msg) return toast(msg, "info");
    }
    if (st.decree && !st.decree.ok) st.decree = null;
    setBusy(true, "데스크가 기사를 읽고 있다…");
    let art = null;
    try {
      art = await publish({ ev, headline: st.headline.trim(), body: st.body.trim(), appraisal: st.decree, special: opts.special });
    } catch (e) {
      console.error(e);
    }
    setBusy(false);
    if (!art) return toast("발행에 실패했다. 다시 시도하자.", "bad");
    flowBusy++;
    try {
      close(true);
      await showPublishResult(art, ev);
      if (art.decree) await playDecree(G.canon.list.find((c) => c.id === art.decree), { silent: Boolean(CHAPTERS[G.campaign.ch]?.quietDecree) });
    } finally {
      flowBusy--;
    }
    opts.onPublished?.(art);
    onDone?.(art);
  }

  function close(published = false) {
    if (!openState) return;
    openState = null;
    wrap.classList.remove("in");
    setTimeout(() => wrap.remove(), 200);
    release();
    document.removeEventListener("keydown", onKey);
    if (!published) {
      opts.onCancel?.();
      onDone?.(null);
    }
  }
  const onKey = (e) => {
    if (e.key === "Escape" && !st.busy && !document.querySelector(".modal-wrap")) tryClose();
  };
  async function tryClose() {
    if (opts.noCancel) return toast("지금은 이 기사를 마쳐야 한다.", "info");
    if ((st.headline.trim() || st.body.trim()) && !(await confirmDialog("쓰던 기사를 버리고 나갑니까?", { title: "편집국", yes: "버린다", danger: true }))) return;
    close(false);
  }

  const publishBtn = h("button.btn.primary.block", { onclick: doPublish }, icon("article", 16), opts.publishLabel || "발행");
  const tools = h("div", { style: { display: "flex", flexDirection: "column", gap: "7px" } },
    G.canon.unlocked && !opts.noDecree ? h("button.btn.block", { id: "btn-stamp", onclick: pickDecree, style: { borderColor: "rgba(226,69,47,.6)", color: "#ff9c8c" } }, icon("stamp", 16), "記定 도장 찍기", h("span.sub", `인주 ${Math.floor(G.canon.ink)}`)) : null,
    upLv("desk") >= 1 && ev ? h("button.btn.block", { onclick: draft }, icon("pen", 15), "초안 보조") : null,
    upLv("factcheck") >= 1 && ev ? h("button.btn.block", { onclick: review }, icon("check", 15), "교열 검토") : null);

  const left = h("div.ed-left",
    ev ? h("div.card", h("div.row.wrap", chip(CATS[ev.cat].ko, "solid", { background: CATS[ev.cat].color }), h("span.dim", { style: { fontSize: "12px" } }, `${cfull(ev.country)} ${ev.city}`)),
      h("div.serif", { style: { fontWeight: 700, fontSize: "15px", margin: "5px 0 4px", lineHeight: 1.4 } }, ev.title), h("div.muted", { style: { fontSize: "12.5px", lineHeight: 1.6 } }, ev.summary))
      : h("div.card", h("div.eyebrow", "칼럼"), h("div.muted", { style: { fontSize: "12.5px", marginTop: "4px", lineHeight: 1.6 } }, "사건에 매이지 않은 글. 조회수는 낮지만 무엇이든 쓸 수 있다.")),
    ev ? h("div.sect", h("h4", `취재 수첩 ${facts.length}건 — 눌러서 옮겨 적기`),
      facts.length ? facts.map((f) => h(`button.ed-fact.d${f.depth}.${nb[f.id].st}`, { onclick: () => insertFact(f) },
        h("div.row", chip(DEPTH_KO[f.depth], f.depth === 3 ? "red" : f.depth === 2 ? "gold" : f.depth === 1 ? "teal" : "gray"), nb[f.id].st === "confirmed" ? chip("확인", "green") : chip("전언", "gold")), h("div", f.text)))
        : h("div.empty", "수첩이 비어 있다.")) : null,
    opts.guide ? h("div.card", { style: { borderColor: "rgba(240,178,79,.5)" } }, h("div.eyebrow", { style: { color: "var(--amber)" } }, "길잡이"), h("div", { style: { fontSize: "13px", lineHeight: 1.7, marginTop: "4px", whiteSpace: "pre-line" } }, opts.guide)) : null);

  const paper = h("div.ed-paper",
    h("div.ed-mast", h("div.ed-mast-name", G.meta.outlet), h("div.ed-mast-date", fmtDate(G.time.min, { dateOnly: true }))),
    headInput,
    h("div.ed-byline", `${G.meta.reporter} 기자`, counter),
    bodyInput, decreeBox);
  const right = h("div.ed-right",
    h("div.sect", h("h4", "데스크 점검"), checklist),
    h("div.sect", h("h4", "도구"), tools),
    h("div.card", { style: { fontSize: "12.5px", lineHeight: 1.7, color: "var(--text-2)" } },
      h("b", { style: { color: "var(--text)" } }, "좋은 기사의 조건"), h("br"),
      "· 첫 문장에 핵심을 담는다", h("br"), "· 깊은 사실일수록, 남이 모를수록 값지다", h("br"), "· 확인 안 된 말은 단정하지 않는다", h("br"), "· 자극적인 제목은 조회수를 올리고 신뢰를 깎는다"),
    h("div.grow"),
    publishBtn,
    h("button.btn.ghost.block", { onclick: tryClose }, "나가기"));

  const wrap = h("div.editor", h("div.ed-grid", left, h("div.ed-center", paper), right), overlay);
  $("#app").append(wrap); // 모달(#modal-root)보다 아래 층에 놓이도록 #app 안에 둔다
  requestAnimationFrame(() => wrap.classList.add("in"));
  headInput.addEventListener("input", sync);
  bodyInput.addEventListener("input", () => { sfx("key"); sync(); });
  document.addEventListener("keydown", onKey);
  sync();
  (st.headline ? bodyInput : headInput).focus();
  emit("editor:open", ev);
  return { close: () => close(false), state: st, pickDecree };
}

// ═════════ 발행 결과 ═════════
function scoreRow(label, v, cls, max = 10) {
  return h("div", { style: { display: "grid", gridTemplateColumns: "64px 1fr 30px", gap: "8px", alignItems: "center", fontSize: "13px" } }, h("span.muted", label), bar(v, max, cls), h("b.num", { style: { textAlign: "right" } }, (Math.round(v * 10) / 10).toString()));
}
export function articlePaper(art) {
  const cn = art.decree ? G.canon.list.find((c) => c.id === art.decree) : null;
  let bodyHtml = escapeHtml(art.body);
  if (cn) {
    const s = escapeHtml(cn.text);
    bodyHtml = bodyHtml.includes(s) ? bodyHtml.replace(s, `<span class="stamped">${s}</span>`) : bodyHtml + `\n<span class="stamped">${s}</span>`;
  }
  return h("div.paperbox.article",
    h("div.np-mast", h("span", G.meta.outlet), h("span", fmtDate(art.at, { dateOnly: true }))),
    h("h5", art.scoop ? h("span.np-excl", "단독") : null, art.headline),
    h("div.by", art.auto ? `${art.by} 기자` : `${G.meta.reporter} 기자`),
    h("div", { html: bodyHtml || "<i>(단신)</i>" }),
    cn ? h("div.np-seal", { html: sealSvg(72) }) : null);
}
export function showPublishResult(art, ev) {
  return new Promise((resolve) => {
    sfx(art.scoop ? "good" : "paper");
    const s = art.scores;
    const badges = [];
    if (art.scoop) badges.push(chip("단독 보도", "red"));
    else if (art.first) badges.push(chip("최초 보도", "gold"));
    if (art.rehash) badges.push(chip("새로운 내용 없음", "gray"));
    if (art.decree) badges.push(chip("記定", "red"));
    if (art.via === "rule") badges.push(chip("기계 검토", "gray"));
    const body = h("div.pub",
      articlePaper(art),
      h("div.pub-side",
        h("div.row.wrap", badges),
        h("div.card", h("div.eyebrow", "데스크 평"), h("div.serif", { style: { marginTop: "5px", lineHeight: 1.7, fontSize: "14px" } }, `"${art.comment || "수고했다."}"`)),
        h("div.sect", h("h4", "평가"),
          scoreRow("정확성", s.acc, s.acc >= 7 ? "green" : "amber"), scoreRow("깊이", s.depth, "teal"), scoreRow("문장력", s.wri, "teal"), scoreRow("제목", s.head, "teal"),
          scoreRow("선정성", s.sens, s.sens >= 6 ? "red" : "gold"), scoreRow("종합", s.Q, "gold")),
        h("div.grid2",
          h("div.bigstat", h("label", "예상 조회수 (48시간)"), h("b", fmtNum(art.plan))),
          h("div.bigstat", h("label", "신뢰도"), h("b", { style: { color: art.dCred >= 0 ? "var(--green)" : "var(--red)" } }, `${art.dCred >= 0 ? "+" : ""}${art.dCred.toFixed(1)}`)),
          h("div.bigstat", h("label", "경험치"), h("b", `+${art.xp}`)),
          G.canon.unlocked ? h("div.bigstat", h("label", "인주"), h("b", { style: { color: "#ff8b78" } }, `+${art.ink.toFixed(1)}`)) : h("div.bigstat", h("label", "독점 배율"), h("b", `×${art.X.toFixed(2)}`))),
        ev ? h("div.dim", { style: { fontSize: "12px", lineHeight: 1.6 } }, "조회수와 광고 수익은 이틀에 걸쳐 들어온다. 사건이 뜨거울수록 더 읽힌다.") : null));
    modal({ title: "기사가 나갔다", eyebrow: G.meta.outlet, cls: "xwide", body, buttons: [{ label: "확인", primary: true }], onClose: resolve });
  });
}

// ═════════ 記定 연출 ═════════
export async function playDecree(cn, opts = {}) {
  if (!cn) return;
  flowBusy++;
  try {
    await decreeSequence(cn, opts);
  } finally {
    flowBusy--;
  }
}
async function decreeSequence(cn, opts) {
  hold();
  const root = $("#fx-root");
  const seal = h("div.dz-seal", { html: sealSvg(240) });
  const sent = h("div.dz-sent", `「${cn.text}」`);
  const sub = h("div.dz-sub");
  const el = h("div.dz", h("div.dz-inner", sent, seal, sub));
  root.append(el);
  await sleep(60);
  el.classList.add("in");
  await sleep(1100);
  seal.classList.add("hit");
  sfx("canon");
  $("#app").classList.add("shake");
  ripple(cn.country, cn.scopeIdx >= 2);
  await sleep(500);
  $("#app").classList.remove("shake");
  await sleep(900);
  sub.textContent = opts.caption || "세계가 문장을 받아들였다.";
  sub.classList.add("in");
  await sleep(1700);
  el.classList.remove("in");
  await sleep(450);
  el.remove();
  if (cn.country) focusCountry(cn.country);
  release();
  if (!opts.silent) {
    await new Promise((resolve) => {
      modal({
        title: "문장은 이제 상식이다", eyebrow: "記定", body: h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
          h("div.canon-card", h("div.sent", `「${cn.belief}」`), h("div.fx", `${SCOPES[cn.scopeIdx].ko} · ${cn.expires == null ? "영구" : fmtDuration(cn.expires - cn.at) + " 동안"}`)),
          cn.reaction ? h("div.summary", cn.reaction) : null,
          h("div.sect", h("h4", "세계의 변화"), cn.effects.map((e) => h("div.row", { style: { fontSize: "13.5px" } }, h("span", { style: { color: e.sign > 0 ? "var(--green)" : "var(--red)", fontWeight: 800 } }, e.sign > 0 ? "▲" : "▼"), `${e.name} — ${e.label}`,
            h("span.dim.num", e.attr === "outcome" ? "" : ` ${e.applied > 0 ? "+" : ""}${Math.round(e.applied)}`)))),
          h("div.dim", { style: { fontSize: "12.5px", lineHeight: 1.7 } }, "이 문장을 의심하는 사람은 이제 없다. 도장을 쥔 당신만이 문장이 찍히기 전의 세계를 기억한다.")),
        buttons: [{ label: "확인", primary: true }], onClose: resolve,
      });
    });
  }
  void music;
  void fmtWon;
}
