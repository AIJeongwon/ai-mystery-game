// 게임 상태(G) 생성·저장·불러오기
import { bindRng, bindIds, hash01, clamp } from "./util.js";
import { COUNTRIES } from "../data/countries.js";
import { OUTLETS, RIVAL_IDS, ACTORS, AGENDAS, HOME, CAT_KEYS } from "../data/world.js";
import { ECON } from "../data/progress.js";

export let G = null;
export function setG(g) {
  G = g;
  if (g) {
    bindRng(g.rng);
    bindIds(g.ids);
  }
  if (typeof window !== "undefined") window.__G = g; // 디버깅용
}

const SAVE_KEY = "gijeongsasil.save.v1";
export const SAVE_VERSION = 1;

export const blankDay = () => ({ ad: 0, sub: 0, plat: 0, etc: 0, rent: 0, pay: 0, bureau: 0, travel: 0, invest: 0, legal: 0, views: 0, newSubs: 0 });

export function newGame({ reporter, outlet, skipPrologue = false, seed }) {
  const s = seed ?? (Date.now() & 0x7fffffff);
  const g = {
    v: SAVE_VERSION,
    rng: { s },
    ids: { n: 1 },
    meta: { reporter, outlet, started: Date.now(), realSeconds: 0 },
    time: { min: 0, speed: 0, lastHour: 0, lastDay: 0 },
    player: {
      loc: HOME, city: "서울", travel: null, xp: 0, level: 1, pts: 0,
      skills: { research: 0, network: 0, mobility: 0, sense: 0 },
    },
    outlet: {
      cash: ECON.startCash, subs: ECON.startSubs, cred: ECON.startCred, tier: 1,
      upgrades: {}, staff: [], bureaus: [], articles: [], ledger: [], today: blankDay(),
      totals: { views: 0, articles: 0, scoops: 0, revenue: 0, decrees: 0 },
      fallout: [], candidates: [],
    },
    world: { c: {}, actors: {}, agendas: {}, schedule: [], events: {}, trends: {}, feed: [], history: [] },
    rivals: {},
    canon: { list: [], ink: 0, lv: { scope: 1, power: 1, hold: 1, slots: 1, veil: 1 }, distortion: 0, unlocked: false, seq: 0 },
    notebook: {},
    casefile: { evidence: {}, deductions: {}, wrong: 0, notes: [] },
    campaign: { ch: skipPrologue ? "ch1" : "prologue", beat: 0, entered: false, flags: {}, objectives: [], vars: {} },
    tutorial: { seen: {} },
  };

  // 국가 동적 상태
  for (const [id, c] of Object.entries(COUNTRIES)) {
    if (c.minor) continue;
    const h = hash01("c" + id);
    const share = {};
    for (const rid of RIVAL_IDS) {
      const o = OUTLETS[rid];
      const base = o.countries?.[id] ?? o.regions?.[c.region] ?? 0;
      if (base > 0) share[rid] = +(base * (0.75 + hash01(rid + id) * 0.5) * (o.hq === id ? 1.6 : 1)).toFixed(4);
    }
    g.world.c[id] = {
      stab: c.stab, appr: Math.round(38 + h * 22), econ: Math.round(clamp(38 + c.gdp * 8 + (h - 0.5) * 14, 10, 95)),
      tens: Math.round(clamp((100 - c.stab) * 0.45 + (hash01("t" + id) - 0.5) * 12, 2, 90)),
      attn: Math.max(5, Math.min(72, 6 + Math.log10(c.pop + 1) * 13 + c.gdp * 5)), share, my: 0,
    };
  }
  g.world.c[HOME].my = 0.00006;

  for (const a of ACTORS) g.world.actors[a.id] = { ...a };
  for (const a of AGENDAS) g.world.agendas[a.id] = { ...a, heat: 15 + Math.round(hash01(a.id) * 25), resolved: null };
  for (const k of CAT_KEYS) g.world.trends[k] = 1;
  for (const rid of RIVAL_IDS) g.rivals[rid] = { cred: OUTLETS[rid].cred, articles: 0, scoops: 0, lastAt: 0 };

  if (skipPrologue) {
    g.canon.unlocked = true;
    g.canon.ink = 12;
    g.campaign.flags.prologueDone = true;
  }
  return g;
}

// ── 저장 ──
export function saveGame() {
  if (!G || typeof localStorage === "undefined") return false;
  try {
    pruneForSave(G);
    localStorage.setItem(SAVE_KEY, JSON.stringify(G));
    return true;
  } catch (e) {
    console.warn("[save] 실패", e);
    return false;
  }
}
export function hasSave() {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}
export function peekSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    return { outlet: g.meta.outlet, reporter: g.meta.reporter, min: g.time.min, tier: g.outlet.tier, ch: g.campaign.ch, v: g.v };
  } catch {
    return null;
  }
}
export function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  const g = JSON.parse(raw);
  if (g.v !== SAVE_VERSION) return null;
  g.time.speed = 0;
  return g;
}
export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* 무시 */ }
}
export function exportSave() {
  return JSON.stringify(G);
}
export function importSave(text) {
  const g = JSON.parse(text);
  if (!g || g.v !== SAVE_VERSION || !g.world || !g.outlet) throw new Error("세이브 형식이 맞지 않습니다");
  localStorage.setItem(SAVE_KEY, JSON.stringify(g));
  return g;
}

// 오래된 종결 사건·피드 정리 (세이브 용량 관리)
function pruneForSave(g) {
  const now = g.time.min;
  const keep = new Set(g.outlet.articles.slice(-40).map((a) => a.ev).filter(Boolean));
  for (const [id, ev] of Object.entries(g.world.events)) {
    if (ev.stage >= 4 && !ev.campaign && now - (ev.closedAt ?? now) > 3 * 1440 && !keep.has(id)) {
      delete g.world.events[id];
      delete g.notebook[id];
    }
  }
  if (g.world.feed.length > 160) g.world.feed = g.world.feed.slice(-160);
  if (g.outlet.articles.length > 120) g.outlet.articles = g.outlet.articles.slice(-120);
  if (g.outlet.ledger.length > 60) g.outlet.ledger = g.outlet.ledger.slice(-60);
}
