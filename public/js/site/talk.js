// 대화 덮개 — 화면 아래 삼분의 일. 인물은 3D 공간에 그대로 서 있고, 그 위로 말이 얹힌다.
// 묻는 말은 자유롭게 쓴다. 증거를 두 장까지 내밀 수 있다. 받아 적을 말에는 밑줄을 긋는다(문장을 누른다).
// 무엇을 말할 수 있는지는 state.js의 규칙이 정한다. LLM이 없으면 같은 규칙으로 정해 둔 대사를 말한다.
import { el, typeInto } from "./hud.js";
import { sayable, acceptNpcReply, ruleNpcReply, sentences } from "./state.js";
import { ask, llm } from "../llm/api.js";
import { siteNpcRequest, siteNpcTurn } from "../llm/tasks/site-npc.js";

export const TALK_MINUTES = 4;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function openTalk({ root, def, st, npc, hud, onGain, onSpeak }) {
  const me = (st.npc[npc.id] ||= { trust: npc.trust ?? 50, said: [], turns: 0, log: [], chat: [] });
  me.log ||= [];
  me.chat ||= [];
  let picked = []; // 내밀 증거 (두 장까지)
  let busy = false, done = null;

  const log = el("div.s-talk-log");
  const tray = el("div.s-talk-tray");
  const input = el("textarea.s-talk-input", { rows: "1", maxlength: "160", placeholder: "무엇을 물을까 (Enter로 묻는다)" });
  const mode = el("span.s-talk-mode");
  const sendBtn = el("button.s-talk-send", { onclick: () => send() }, "묻는다");
  const layer = el("div.s-talk",
    el("div.s-talk-card",
      el("div.s-talk-head", el("b", npc.name), el("span", npc.role), mode, el("button.s-talk-leave", { onclick: () => close() }, "물러난다 (Esc)")),
      log,
      el("div.s-talk-ask", input, sendBtn),
      el("div.s-talk-foot", el("span.s-talk-label", "내밀 것"), tray),
    ));
  root.append(layer);

  const giveable = (entry) => entry.revealed.map((id) => npc.facts.find((f) => f.id === id)?.gives).filter(Boolean);

  function drawTray() {
    const ids = Object.keys(st.evidence).sort((a, b) => st.evidence[a] - st.evidence[b]);
    tray.replaceChildren(...ids.map((id) => el(`button.s-talk-chip${picked.includes(id) ? ".on" : ""}`, {
      title: def.evidence[id]?.text || "",
      onclick: () => {
        picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-2);
        drawTray();
      },
    }, el("i", id), def.evidence[id]?.title || id)));
    if (!ids.length) tray.append(el("span.dim", "아직 내밀 것이 없다"));
  }
  function drawMode() {
    mode.textContent = llm.online ? "" : "규칙 모드 · 낱말과 내민 증거에 따라 답한다";
  }

  // 한 번의 답을 문장 단위로 그린다. 문장을 누르면 밑줄이 그어지고 수첩에 적힌다.
  function drawEntry(entry, typed) {
    const box = el("div.s-talk-entry");
    if (entry.q) box.append(el("p.s-talk-q", entry.shown?.length ? el("i", entry.shown.join(" · ")) : null, entry.q));
    const a = el("p.s-talk-a");
    const parts = sentences(entry.a);
    parts.forEach((text, i) => {
      const s = el(`span.s-sent${entry.under?.includes(i) ? ".under" : ""}`, { onclick: () => underline(entry, i, s) }, typed ? "" : text);
      s.dataset.text = text;
      a.append(s, " ");
    });
    box.append(a);
    log.append(box);
    log.scrollTop = log.scrollHeight;
    return a;
  }
  async function typeOut(a) {
    for (const s of a.querySelectorAll(".s-sent")) {
      await typeInto(s, s.dataset.text, 46);
      log.scrollTop = log.scrollHeight;
    }
  }
  function underline(entry, i, span) {
    if (span.classList.contains("under")) return;
    span.classList.add("under");
    (entry.under ||= []).push(i);
    const text = span.dataset.text;
    st.statements.push({ id: `${npc.id}.${me.log.indexOf(entry)}.${i}`, who: npc.name, text, minute: st.minute });
    const gives = giveable(entry).filter((id) => !(id in st.evidence));
    if (gives.length) {
      onGain({ evidence: gives });
      drawTray();
    } else hud.toast("밑줄을 그었다. 수첩에 적혔다.", "note", 2200);
  }

  async function reply(text, shown) {
    const ctx = { trust: me.trust, shown, text, evidence: st.evidence, said: me.said, turn: me.turns };
    const facts = sayable(npc, ctx);
    let out = null;
    if (llm.online) {
      const r = await ask(siteNpcRequest(def, npc, facts, st, { trust: me.trust, text, shown }));
      if (r.ok) out = acceptNpcReply(npc, ctx, r.data);
      drawMode();
    }
    const byRule = !out;
    out ||= ruleNpcReply(npc, ctx);
    return { ...out, byRule };
  }

  async function send() {
    const text = input.value.trim().slice(0, 160);
    if (busy || (!text && !picked.length)) return;
    busy = true;
    sendBtn.disabled = true;
    const shown = [...picked];
    const q = text || `(${shown.map((id) => def.evidence[id]?.title || id).join(", ")}을 내민다)`;
    input.value = "";
    picked = [];
    drawTray();
    const entry = { q, shown, a: "…", revealed: [], under: [] };
    const pending = drawEntry(entry, false);
    pending.classList.add("wait");
    onGain({ minutes: TALK_MINUTES });
    const out = await reply(text || q, shown);
    entry.a = out.speech;
    entry.revealed = out.revealed;
    me.turns++;
    for (const id of out.revealed) if (!me.said.includes(id)) me.said.push(id);
    me.trust = clamp(me.trust + out.trust_delta * 4, 0, 100);
    me.log.push(entry);
    me.chat.push({ role: "user", content: siteNpcTurn(def, { trust: me.trust, text: text || q, shown }) }, { role: "assistant", content: JSON.stringify({ speech: out.speech, revealed: out.revealed, trust_delta: out.trust_delta, end: false }) });
    me.chat = me.chat.slice(-12);
    pending.parentElement.remove();
    onSpeak?.();
    const a = drawEntry(entry, true);
    await typeOut(a);
    if (giveable(entry).some((id) => !(id in st.evidence)) && !st.flags.hint_underline) {
      st.flags.hint_underline = true;
      hud.toast("받아 적을 말이 있다면, 그 문장을 눌러 밑줄을 긋는다.", "note", 5200);
    }
    onGain({});
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }

  const onKey = (e) => {
    if (e.code === "Escape") close();
    else if (e.code === "Enter" && !e.shiftKey && e.target === input && !e.isComposing) {
      e.preventDefault();
      send();
    }
  };
  window.addEventListener("keydown", onKey);
  function close() {
    if (busy || !done) return;
    window.removeEventListener("keydown", onKey);
    layer.remove();
    const d = done;
    done = null;
    d();
  }

  // 시작: 처음이면 여는 말, 아니면 지난 말을 다시 보여 준다
  drawTray();
  drawMode();
  for (const entry of me.log.slice(-4)) drawEntry(entry, false);
  const first = !me.greeted;
  me.greeted = true;
  const hello = { q: "", a: (first ? npc.opening : npc.again || npc.opening.slice(0, 1)).join(" "), revealed: [], under: [], greeting: true };
  onSpeak?.();
  typeOut(drawEntry(hello, true));
  setTimeout(() => input.focus(), 50);
  return new Promise((r) => (done = r));
}
