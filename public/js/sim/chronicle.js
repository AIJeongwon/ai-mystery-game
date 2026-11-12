// 세계 연대기 — 사건이 국면을 넘길 때, LLM이 '그 뒤 무슨 일이 벌어졌는지'를 써 준다.
// 한 시간에 한 번, 국면이 바뀐 사건 몇 건을 묶어 한 번의 요청으로 처리한다.
// LLM은 경과 서술과 새 사실, 그리고 흐름의 기울기를 '제안'할 뿐이다(요청 조립은 llm/tasks/chronicle.js). 받아들이는 범위는 여기서 정한다.
import { G } from "../core/store.js";
import { on, emit } from "../core/bus.js";
import { clamp, cleanText } from "../core/util.js";
import { ask, llm } from "../llm/api.js";
import { chronicleRequest } from "../llm/prompts.js";
import { STAGES } from "../data/templates.js";
import { feed, now } from "./world.js";

const queue = [];
let busy = false;
let bound = false;

const RULE_TEXT = {
  2: ["당사자들이 잇따라 입장을 내며 공방이 이어지고 있다.", "관계 기관이 사실관계 확인에 들어갔다.", "파장이 관련 업계와 정치권으로 번지고 있다."],
  3: ["사태는 수습 국면에 들어섰고, 책임 소재를 둘러싼 논의가 남았다.", "후속 대책이 논의되는 가운데 관심은 차츰 잦아들고 있다."],
};

export function initChronicle() {
  queue.length = 0;
  busy = false;
  if (bound) return;
  bound = true;
  on("event:stage", (ev) => {
    if (ev.stage < 2 || ev.stage > 3 || ev.hold || ev.campaign) return;
    queue.push(ev.id);
  });
}

function apply(ev, dev, viaLlm) {
  const text = cleanText(dev.development, 240);
  if (!text) return;
  ev.devs ||= [];
  ev.devs.push({ t: now(), stage: ev.stage, text });
  if (ev.devs.length > 4) ev.devs.shift();
  const factText = cleanText(dev.new_fact || "", 260);
  if (viaLlm && factText.length > 8 && ev.facts.length < 11) {
    const id = `n${ev.devs.length}${ev.stage}`;
    if (!ev.facts.some((f) => f.id === id)) {
      const depth = dev.depth === 1 ? 1 : 0;
      ev.facts.push({ id, text: factText, depth, true: true, ev: null, cond: null, talk: false, late: true });
      // 현장 사실은 입이 무겁지 않은 취재원 한 명이 알게 된다
      const src = ev.sources.filter((s) => s.stance !== "hostile").sort((a, b) => a.knows.length - b.knows.length)[0];
      if (src) src.knows.push(id);
      ev.deskDone = false; // 새로 확인할 것이 생겼다
      if (depth === 1) ev.fieldDone = false;
    }
  }
  if (viaLlm) ev.bias = clamp(ev.bias + clamp(dev.tilt | 0, -1, 1) * 0.5, -3, 3);
  ev._boost = (ev._boost || 0) + 3;
  if (ev.known) feed("world", `[${STAGES[ev.stage].ko}] ${ev.title} — ${text}`, { ev: ev.id, cat: ev.cat });
  emit("event:dev", ev);
}

export async function chronicleHourly() {
  if (busy || !queue.length) return;
  const ids = [...new Set(queue.splice(0, 3))];
  const evs = ids.map((id) => G.world.events[id]).filter((e) => e && e.stage >= 2 && e.stage < 4);
  if (!evs.length) return;
  if (!llm.online) {
    for (const ev of evs) {
      const pool = RULE_TEXT[ev.stage] || RULE_TEXT[2];
      apply(ev, { development: pool[(ev.born + ev.stage) % pool.length] }, false);
    }
    return;
  }
  busy = true;
  const g = G;
  try {
    const r = await ask(chronicleRequest(evs));
    if (G !== g) return;
    const items = r.ok && Array.isArray(r.data?.items) ? r.data.items : [];
    for (const ev of evs) {
      if (ev.stage >= 4) continue;
      const it = items.find((x) => x.id === ev.id);
      if (it) apply(ev, it, true);
      else {
        const pool = RULE_TEXT[ev.stage] || RULE_TEXT[2];
        apply(ev, { development: pool[(ev.born + ev.stage) % pool.length] }, false);
      }
    }
  } finally {
    busy = false;
  }
}
