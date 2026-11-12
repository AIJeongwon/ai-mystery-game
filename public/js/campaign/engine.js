// 캠페인 엔진 — 장(章)은 '비트'의 나열이다. 비트는 진입 연출, 목표, 완료 조건, 퇴장 연출을 가진다.
// 새 장은 campaign/chapters.js에 등록하기만 하면 이어진다. 이 파일에는 특정 장의 내용을 적지 않는다.
import { G, saveGame } from "../core/store.js";
import { on, emit } from "../core/bus.js";
import { playCutscene, cutsceneOpen } from "../ui/cutscene.js";
import { modalOpen, toast } from "../ui/dom.js";
import { editorOpen } from "../ui/editor.js";
import { spawnScripted, closeEvent, feed } from "../sim/world.js";
import { plantCanon, inkCap } from "../sim/canon.js";
import { earn } from "../sim/press.js";
import { sfx, music } from "../audio.js";
import { CHAPTERS, ORDER } from "./chapters.js";

export { CHAPTERS };

// 모든 장의 증거·추리·환원 기사 설정 모음
export const EVIDENCE = {};
export const DEDUCTIONS = {};
export const FINALS = {};
for (const ch of Object.values(CHAPTERS)) {
  Object.assign(EVIDENCE, ch.evidence || {});
  Object.assign(DEDUCTIONS, ch.deductions || {});
  Object.assign(FINALS, ch.finals || {});
}

let busy = false;
let timer = 0;

export const hasEvidence = (id) => Boolean(G.casefile.evidence[id]);
export function addEvidence(id, silent = false) {
  if (!EVIDENCE[id] || G.casefile.evidence[id]) return false;
  G.casefile.evidence[id] = { t: G.time.min, fresh: true };
  if (!silent) {
    sfx("fact");
    toast(`증거 확보 — ${EVIDENCE[id].title}`, "gold", 5200);
  }
  emit("evidence", id);
  return true;
}

const api = {
  cutscene: (steps, vars) => playCutscene(steps, vars),
  spawn: (def) => (G.world.events[def.id] ? G.world.events[def.id] : spawnScripted(def)),
  closeEvent: (id, text) => {
    const ev = G.world.events[id];
    if (ev && ev.stage < 4) closeEvent(ev, { hi: true, text });
  },
  flag: (k, v = true) => (G.campaign.flags[k] = v),
  vars: () => G.campaign.vars,
  evidence: addEvidence,
  plant: plantCanon,
  feed,
  toast,
  give({ cash, ink, cred, subs }) {
    if (cash) earn(cash, "etc");
    if (ink != null) G.canon.ink = Math.min(G.canon.ink + ink, inkCap());
    if (cred) G.outlet.cred = Math.max(1, Math.min(99, G.outlet.cred + cred));
    if (subs) G.outlet.subs += subs;
    emit("cash");
  },
  music,
  sfx,
};

function chapter() {
  return CHAPTERS[G.campaign.ch];
}
function beat() {
  return chapter()?.beats[G.campaign.beat];
}
function setObjective(b) {
  const c = G.campaign;
  if (!b?.objective) c.objectives = [];
  else {
    const ob = typeof b.objective === "function" ? b.objective(G) : b.objective;
    c.objectives = [{ chapter: ob.chapter ?? chapter().label, title: ob.title, hint: ob.hint ?? "", items: ob.items.map((it) => ({ id: it.id, text: typeof it.text === "function" ? it.text(G) : it.text, done: false })) }];
  }
  emit("objective");
}
function evalObjective(b) {
  const ob = G.campaign.objectives[0];
  if (!ob || !b?.objective) return true;
  const def = typeof b.objective === "function" ? b.objective(G) : b.objective;
  let changed = false, all = true;
  for (const it of def.items) {
    const st = ob.items.find((x) => x.id === it.id);
    if (!st) continue;
    const text = typeof it.text === "function" ? it.text(G) : it.text;
    if (st.text !== text) {
      st.text = text;
      changed = true;
    }
    if (!st.done && it.check(G)) {
      st.done = true;
      changed = true;
      sfx("ding");
    }
    if (!st.done && !it.optional) all = false;
  }
  if (def.hint !== undefined) {
    const hint = typeof def.hint === "function" ? def.hint(G) : def.hint;
    if (ob.hint !== hint) {
      ob.hint = hint;
      changed = true;
    }
  }
  if (changed) emit("objective");
  return all;
}

async function enterBeat() {
  const c = G.campaign;
  const b = beat();
  if (!b) return;
  busy = true;
  const g = G;
  try {
    await b.enter?.(api, G);
    if (G !== g) return;
    setObjective(b);
    c.entered = true;
    saveGame();
  } catch (e) {
    console.error("[campaign] enter", b.id, e);
    c.entered = true;
  } finally {
    busy = false;
  }
}

export async function checkCampaign() {
  if (!G || busy) return;
  const c = G.campaign;
  const ch = chapter();
  if (!ch) return;
  if (modalOpen() || editorOpen() || cutsceneOpen()) return;
  if (!c.entered) return enterBeat();
  const b = beat();
  if (!b) return;
  try {
    b.watch?.(api, G);
  } catch (e) {
    console.error("[campaign] watch", b.id, e);
  }
  const objDone = evalObjective(b);
  const done = b.done ? b.done(G) : objDone;
  if (!done) return;
  busy = true;
  const g = G;
  try {
    await b.exit?.(api, G);
  } catch (e) {
    console.error("[campaign] exit", b.id, e);
  }
  busy = false;
  if (G !== g) return;
  c.beat++;
  c.entered = false;
  if (c.beat >= ch.beats.length) {
    const next = ORDER[ORDER.indexOf(c.ch) + 1];
    c.ch = next || "end";
    c.beat = 0;
    c.objectives = [];
    emit("objective");
  }
  saveGame();
  checkCampaign();
}

let bound = false;
export function startCampaign() {
  // 장마다 세계에 미리 심어 둘 것을 심는다 (예: 제1장의 열두 해 전 문장)
  for (const ch of Object.values(CHAPTERS)) ch.worldSetup?.(api, G);
  clearInterval(timer);
  timer = setInterval(checkCampaign, 700);
  if (!bound) {
    bound = true;
    for (const evt of ["tick", "article:published", "fact:new", "evidence", "interview:end", "travel:end", "event:opened", "canon:enacted", "canon:reverted", "deduction", "investigate"]) on(evt, () => setTimeout(checkCampaign, 30));
    on("evidence:found", (id) => addEvidence(id));
  }
  emit("objective");
  setTimeout(checkCampaign, 300);
}
export function stopCampaign() {
  clearInterval(timer);
}
