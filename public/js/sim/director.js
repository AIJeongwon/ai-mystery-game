// 세계 연출가 — 규칙 엔진이 낸 '사건 씨앗'에 LLM이 서사를 입힌다. 실패하면 규칙 기반 서사로 대체.
// 서사 한 건을 쓰는 데 10초쯤 걸리므로, 평범한 사건은 미리 써서 재고로 쌓아 두고(stock) 세계가 필요로 할 때 꺼낸다.
import { G } from "../core/store.js";
import { on, emit } from "../core/bus.js";
import { ask, llm } from "../llm/api.js";
import { directorRequest } from "../llm/prompts.js";
import { addEvent, fallbackNarrative, seedPending, now, makeSeed, setPendingProvider } from "./world.js";

const queue = []; // 예약·특수 사건 (일정, 기정 여파, 잔향)
const ready = []; // 서사는 준비됐고 시각을 기다리는 사건
const stock = []; // 미리 써 둔 평범한 사건
const inflight = new Set();
let running = 0;
let stocking = 0;
let failStreak = 0;
let dry = 0;
let bound = false;
const STOCK_TARGET = 5;
const STOCK_PARALLEL = 3;

export function initDirector() {
  queue.length = 0;
  ready.length = 0;
  stock.length = 0;
  inflight.clear();
  failStreak = 0;
  dry = 0;
  seedPending(-99);
  setPendingProvider(() => [...stock.map((s) => s.seed), ...inflight]);
  if (!bound) {
    bound = true;
    on("seed", (seed) => {
      seedPending(+1);
      queue.push({ seed, g: G });
      pump();
    });
    on("need:event", supply);
    on("llm:status", () => refill());
  }
  refill();
}

function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift();
    running++;
    produce(job).finally(() => {
      running--;
      pump();
    });
  }
}

function validate(n) {
  if (!n || typeof n.title !== "string" || !Array.isArray(n.facts) || !Array.isArray(n.sources)) return false;
  if (n.facts.length < 4 || n.sources.length < 2) return false;
  n.facts = n.facts.filter((f) => f && typeof f.text === "string" && f.text.length > 6).slice(0, 7);
  n.facts.sort((a, b) => a.depth - b.depth);
  if (n.facts.length < 4) return false;
  if (!n.facts.some((f) => f.depth === 0)) n.facts[0].depth = 0;
  if (!n.facts.some((f) => f.depth >= 2)) n.facts[n.facts.length - 1].depth = 3;
  const N = n.facts.length;
  for (const s of n.sources) {
    s.knows = [...new Set((s.knows || []).filter((k) => Number.isInteger(k) && k >= 0 && k < N))];
    // 방어적인 취재원은 깊은 사실을 쥐고 있지 않다 / 핵심 진상은 한 사람만 안다
    if (s.stance === "hostile") s.knows = s.knows.filter((k) => n.facts[k].depth === 0);
  }
  for (let i = 0; i < N; i++) {
    if (n.facts[i].depth < 3) continue;
    const holders = n.sources.filter((s) => s.knows.includes(i));
    const keep = holders.find((s) => s.stance === "evasive") || holders.find((s) => s.stance === "neutral") || holders[0];
    for (const s of holders) if (s !== keep) s.knows = s.knows.filter((k) => k !== i);
  }
  // 누구도 모르는 사실이 없도록 보정
  for (let i = 0; i < N; i++) {
    if (n.sources.some((s) => s.knows.includes(i))) continue;
    const depth = n.facts[i].depth;
    const cands = n.sources.filter((s) => (depth >= 2 ? s.stance !== "hostile" && s.stance !== "friendly" : s.stance !== "hostile"));
    (cands.sort((a, b) => a.knows.length - b.knows.length)[0] || n.sources.find((s) => s.stance !== "hostile") || n.sources[0]).knows.push(i);
  }
  let liar = false;
  for (const s of n.sources) {
    if (s.spreads_rumor && !liar) liar = true;
    else s.spreads_rumor = false;
  }
  return true;
}

async function write(seed) {
  if (!llm.online) return null;
  const r = await ask(directorRequest(seed));
  if (r.ok && validate(r.data)) {
    failStreak = 0;
    return r.data;
  }
  failStreak++;
  return null;
}

// ── 예약·특수 사건 ──
async function produce({ seed, g }) {
  let nar = await write(seed);
  if (G !== g) return;
  if (!nar) nar = fallbackNarrative(seed);
  if (seed.fireAt && now() < seed.fireAt) ready.push({ seed, nar });
  else spawn(seed, nar);
}
function spawn(seed, nar) {
  seedPending(-1);
  const ev = addEvent(seed, nar);
  if (seed.schedId) {
    const s = G.world.schedule.find((x) => x.id === seed.schedId);
    if (s) {
      s.done = true;
      s.ev = ev.id;
    }
  }
  return ev;
}
export function directorTick() {
  for (let i = ready.length - 1; i >= 0; i--) {
    if (now() >= ready[i].seed.fireAt) {
      const { seed, nar } = ready.splice(i, 1)[0];
      spawn(seed, nar);
    }
  }
}

// ── 재고 ──
function refill() {
  if (!G || !llm.online || failStreak >= 4) return;
  while (stock.length + stocking < STOCK_TARGET && stocking < STOCK_PARALLEL) {
    const g = G;
    const seed = makeSeed();
    seed.avoid = [...stock, ...[...inflight].map((s) => ({ seed: s, nar: null }))].filter((x) => x.seed.country === seed.country && x.nar).map((x) => x.nar.title);
    inflight.add(seed);
    stocking++;
    write(seed)
      .then((nar) => {
        if (G === g && nar) stock.push({ seed, nar });
      })
      .finally(() => {
        stocking--;
        inflight.delete(seed);
        if (G === g) setTimeout(refill, failStreak ? 4000 : 50);
      });
  }
}
// 세계가 새 사건을 필요로 한다
function supply() {
  if (stock.length) {
    dry = 0;
    const { seed, nar } = stock.shift();
    addEvent(seed, nar);
    refill();
    return;
  }
  const offline = !llm.online || failStreak >= 4;
  if (offline || ++dry > 10) {
    dry = 0;
    const seed = makeSeed();
    addEvent(seed, fallbackNarrative(seed));
    if (!offline) refill();
    return;
  }
  refill(); // 온라인인데 재고가 비었으면 이번에는 건너뛰고 채운다
}

export const directorBusy = () => running + queue.length + stocking;
export const stockSize = () => stock.length;
void emit;
