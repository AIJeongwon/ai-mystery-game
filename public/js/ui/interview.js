// 인터뷰 — 취재원은 LLM이 연기한다. 규칙 엔진은 '밝혀진 사실'만 검증해 수첩에 적는다.
import { emit } from "../core/bus.js";
import { clamp, cleanText, sleep, pick } from "../core/util.js";
import { h, mount, icon, chip, bar, modal, portraitUrl, toast } from "./dom.js";
import { ask } from "../llm/api.js";
import { npcRequest, npcUserTurn, trustGate } from "../llm/prompts.js";
import { STANCE_KO, DEPTH_KO } from "../data/templates.js";
import { notes, learnFact, initTrust, patience, spend } from "../sim/press.js";
import { sfx } from "../audio.js";

const DEFLECT = {
  friendly: ["그건 저도 잘 모르겠어요. 다른 분께 물어보시는 게 좋겠네요.", "제가 아는 건 이미 다 말씀드린 것 같은데요."],
  neutral: ["그 부분은 제가 답할 수 있는 게 아닙니다.", "확인되지 않은 얘기는 하지 않겠습니다."],
  evasive: ["그 얘기는… 여기서 하기 좀 그렇습니다.", "제 이름이 나가는 건 아니죠? 지금은 더 말씀드리기 어렵습니다."],
  hostile: ["공식 입장은 이미 밝혔습니다. 더 드릴 말씀이 없습니다.", "근거 없는 추측에는 답하지 않겠습니다."],
};
// LLM을 쓸 수 없을 때의 규칙 기반 응답
function ruleReply(ev, src, sess, text) {
  const nb = notes(ev.id);
  const cands = [...src.knows, ...(src.lies || [])]
    .map((id) => ev.facts.find((f) => f.id === id))
    .filter((f) => f && !sess.said.has(f.id) && (src.lies?.includes(f.id) || trustGate(src, f.depth) <= sess.trust || sess.shown.length));
  const polite = /부탁|감사|죄송|익명|보호|힘드|걱정/.test(text);
  if (!cands.length) return { speech: pick(DEFLECT[src.stance] || DEFLECT.neutral), revealed: [], trust_delta: polite ? 1 : 0, end: sess.turn >= 3 };
  const f = cands.sort((a, b) => a.depth - b.depth)[0];
  void nb;
  const lead = { friendly: "말씀드릴게요. ", neutral: "제가 아는 대로만 말하죠. ", evasive: "…이건 제가 말했다고 하지 마세요. ", hostile: "분명히 해 두죠. " }[src.stance] || "";
  return { speech: lead + f.text, revealed: [f.id], trust_delta: polite ? 1 : 0, end: false };
}

export function openInterview(ev, src, onsite, onDone) {
  const sess = {
    trust: initTrust(ev, src, onsite), left: Math.max(2, patience(src) - (src.turns || 0)), shown: [], busy: false, ended: false,
    said: new Set(), turn: 0, got: 0,
  };
  src.chat ||= [];
  src.log ||= [];
  for (const m of src.chat) for (const id of m.facts || []) sess.said.add(id);

  const logEl = h("div.iv-log");
  const trustBar = bar(sess.trust, 100, "teal");
  const trustNum = h("b.num", String(Math.round(sess.trust)));
  const leftEl = h("b.num", String(sess.left));
  const input = h("textarea.input.iv-input", { rows: 2, placeholder: "질문을 직접 입력하세요. (Enter로 보내기, Shift+Enter 줄바꿈)", maxLength: 300 });
  const sendBtn = h("button.btn.primary", { onclick: () => send() }, icon("talk", 15), "묻기");
  const shownEl = h("div.iv-shown");
  const evidenceBtn = h("button.btn.small.ghost", { onclick: () => toggleEvidence() }, icon("doc", 14), "근거 제시");
  const evidenceList = h("div.iv-evidence.hidden");
  const status = h("div.iv-status");

  function bubble(who, text, facts = []) {
    const el = h(`div.iv-msg.${who}`, h("div.b", text));
    if (facts.length) {
      el.append(h("div.iv-facts", facts.map((id) => {
        const f = ev.facts.find((x) => x.id === id);
        return f ? h("div.iv-fact", icon("pen", 12), h("span", `수첩에 적음 · ${DEPTH_KO[f.depth]}`), h("em", f.text)) : null;
      })));
    }
    logEl.append(el);
    logEl.scrollTop = logEl.scrollHeight;
    return el;
  }
  async function typeOut(el, text) {
    const b = el.querySelector(".b");
    b.textContent = "";
    for (let i = 0; i < text.length; i++) {
      b.textContent += text[i];
      if (i % 3 === 0) sfx("tick");
      logEl.scrollTop = logEl.scrollHeight;
      await sleep(text.length > 120 ? 9 : 16);
      if (closed) {
        b.textContent = text;
        return;
      }
    }
  }
  function syncMeters() {
    trustBar.firstChild.style.width = `${clamp(sess.trust, 0, 100)}%`;
    trustNum.textContent = String(Math.round(sess.trust));
    leftEl.textContent = String(Math.max(0, sess.left));
  }
  function toggleEvidence() {
    const nb = notes(ev.id);
    const list = ev.facts.filter((f) => nb[f.id] && nb[f.id].st !== "debunked");
    if (!list.length) return toast("제시할 만한 근거가 아직 수첩에 없다.", "info");
    evidenceList.classList.toggle("hidden");
    mount(evidenceList, list.map((f) => h(`button.iv-ev${sess.shown.includes(f.id) ? ".on" : ""}`, {
      onclick: (e) => {
        const i = sess.shown.indexOf(f.id);
        if (i >= 0) sess.shown.splice(i, 1);
        else if (sess.shown.length < 2) sess.shown.push(f.id);
        e.currentTarget.classList.toggle("on", sess.shown.includes(f.id));
        renderShown();
      },
    }, chip(DEPTH_KO[f.depth], "gray"), f.text)));
  }
  function renderShown() {
    mount(shownEl, sess.shown.map((id) => chip(`근거: ${ev.facts.find((f) => f.id === id).text.slice(0, 26)}…`, "gold")));
  }
  function finish(msg) {
    sess.ended = true;
    src.ended = true;
    input.disabled = true;
    sendBtn.disabled = true;
    evidenceBtn.disabled = true;
    status.textContent = msg;
    api.setButtons([{ label: sess.got ? `마치기 · 사실 ${sess.got}건 확보` : "마치기", primary: true }]);
  }

  async function exchange(turnText, display, opening = false) {
    sess.busy = true;
    sendBtn.disabled = true;
    input.disabled = true;
    if (display) bubble("me", display);
    const wait = bubble("npc", "…");
    wait.classList.add("typing");
    const history = src.log.slice(-18);
    while (history.length && history[0].role !== "user") history.shift();
    let data = null;
    const r = await ask(npcRequest(ev, src, history, turnText));
    if (r.ok && r.data && typeof r.data.speech === "string") data = r.data;
    else data = opening ? { speech: pick(["무슨 일이시죠?", "기자라고요? …말씀하세요.", "네, 듣고 있습니다."]), revealed: [], trust_delta: 0, end: false } : ruleReply(ev, src, sess, display || "");
    if (closed) return;
    const speech = cleanText(data.speech, 420) || "…";
    const allowed = new Set([...src.knows, ...(src.lies || [])]);
    const revealed = [...new Set((data.revealed || []).map((x) => String(x).replace(/[\[\]\s]/g, "")))].filter((id) => allowed.has(id));
    const fresh = [];
    for (const id of revealed) {
      sess.said.add(id);
      const res = learnFact(ev, id, "heard", src.id);
      if (res) fresh.push(id);
    }
    sess.got += fresh.length;
    const td = clamp(data.trust_delta | 0, -2, 2) * 4;
    src.trust = clamp((src.trust ?? 40) + td, 0, 95);
    sess.trust = clamp(sess.trust + td, 0, 100);
    src.log.push({ role: "user", content: turnText }, { role: "assistant", content: JSON.stringify({ speech, revealed, trust_delta: data.trust_delta | 0, end: Boolean(data.end) }) });
    if (src.log.length > 40) src.log.splice(0, src.log.length - 40);
    if (display) src.chat.push({ who: "me", text: display });
    src.chat.push({ who: "npc", text: speech, facts: fresh });
    wait.classList.remove("typing");
    await typeOut(wait, speech);
    if (fresh.length) {
      sfx("fact");
      wait.append(h("div.iv-facts", fresh.map((id) => {
        const f = ev.facts.find((x) => x.id === id);
        return h("div.iv-fact", icon("pen", 12), h("span", `수첩에 적음 · ${DEPTH_KO[f.depth]}`), h("em", f.text));
      })));
      logEl.scrollTop = logEl.scrollHeight;
    }
    if (td) sfx(td > 0 ? "ding" : "bad");
    if (!opening) {
      src.turns = (src.turns || 0) + 1;
      sess.turn++;
      sess.left--;
      spend(10);
    }
    sess.shown = [];
    renderShown();
    evidenceList.classList.add("hidden");
    syncMeters();
    sess.busy = false;
    emit("interview:turn", ev, src, { revealed: fresh, speech });
    if (data.end && !opening) return finish(`${src.name}: 대화를 마무리했다.`);
    if (sess.left <= 0) return finish("상대가 시계를 본다. 오늘은 여기까지다.");
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }

  function send() {
    const text = input.value.trim();
    if (!text || sess.busy || sess.ended) return;
    input.value = "";
    sfx("send");
    const shownTexts = sess.shown.map((id) => ev.facts.find((f) => f.id === id).text);
    const turn = npcUserTurn({ trust: sess.trust, onsite, text, shown: shownTexts });
    exchange(turn, shownTexts.length ? `${text}\n(근거 제시: ${shownTexts.map((s) => s.slice(0, 30)).join(" / ")})` : text);
  }
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });

  let closed = false;
  const body = h("div.iv",
    h("div.iv-side",
      h("div.iv-portrait", h("img", { src: portraitUrl(src.portrait), alt: "" })),
      h("div.iv-name", src.name),
      h("div.iv-role", src.role),
      h("div.row.wrap", chip(STANCE_KO[src.stance], src.stance === "friendly" ? "green" : src.stance === "hostile" ? "red" : "gray"), chip(onsite ? "대면" : "전화", onsite ? "teal" : "gold")),
      h("div.iv-meter", h("div.row.between", h("span", "신뢰"), trustNum), trustBar),
      h("div.iv-meter", h("div.row.between", h("span", "남은 질문"), leftEl)),
      h("div.iv-tip", onsite ? "공감하고, 근거를 내밀고, 익명을 약속하면 입이 열린다. 넘겨짚거나 몰아붙이면 닫힌다." : "전화로는 깊은 얘기를 듣기 어렵다. 직접 찾아가면 신뢰가 오른다."),
    ),
    h("div.iv-main", logEl, status,
      h("div.iv-compose", shownEl, evidenceList, h("div.row", { style: { alignItems: "stretch" } }, input, h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, sendBtn, evidenceBtn)))),
  );
  const api = modal({
    title: `${src.name} 인터뷰`, eyebrow: `${ev.title}`, cls: "xwide interview", body,
    buttons: [{ label: "인터뷰 마치기", ghost: true }],
    onClose: () => {
      closed = true;
      onDone?.();
      emit("interview:end", ev, src);
    },
  });

  // 이전 대화 복원 또는 첫 반응
  if (src.chat.length) {
    logEl.append(h("div.iv-sep", "— 지난 대화 —"));
    for (const m of src.chat.slice(-12)) bubble(m.who, m.text, []);
    logEl.append(h("div.iv-sep", "— 다시 만났다 —"));
    if (sess.left <= 0) finish("이 사람은 더 시간을 내주지 않는다.");
    else input.focus();
  } else exchange(npcUserTurn({ trust: sess.trust, onsite, opening: true }), null, true);
  return api;
}
