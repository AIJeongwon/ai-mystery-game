// 사건 — 생성, 발견, 보도 압력, 국면 진행, 종결
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { clamp, rand, chance, uid, HOUR, cleanText } from "../../core/util.js";
import { EVENT_TYPES } from "../../data/templates.js";
import { cd, now, actor, presence, portraitFor } from "./query.js";
import { feed } from "./feed.js";

// ───────── 사건 생성 ─────────
export function addEvent(seed, nar) {
  const T = EVENT_TYPES[seed.type];
  const t = now();
  const stage = seed.start ?? T.start;
  const facts = (nar.facts || []).slice(0, 10).map((f, i) => ({ id: f.id || `f${i}`, text: cleanText(f.text, 300), depth: clamp(f.depth | 0, 0, 3), true: f.true !== false, ev: f.ev || null, cond: f.cond || null, talk: Boolean(f.cond || f.talk) }));
  if (nar.rumor) facts.push({ id: "r0", text: cleanText(nar.rumor, 200), depth: 1, true: false });
  const factIds = new Set(facts.map((f) => f.id));
  const sources = (nar.sources || []).slice(0, 5).map((s, i) => ({
    id: s.id || `s${i}`, name: cleanText(s.name, 30), role: cleanText(s.role, 60), persona: cleanText(s.persona, 160),
    stance: ["friendly", "neutral", "evasive", "hostile"].includes(s.stance) ? s.stance : "neutral",
    secret: cleanText(s.secret || "", 160),
    knows: (s.knows || []).map((k) => (typeof k === "number" ? `f${k}` : k)).filter((k) => factIds.has(k)),
    lies: s.spreads_rumor && nar.rumor ? ["r0"] : s.lies || [],
    gender: s.gender === "f" ? "f" : "m", age: s.age === "old" ? "old" : "young",
    portrait: s.portrait || portraitFor(seed.country, s.gender, s.age, seed.id + i),
    trust: null, turns: 0, log: [], met: false, onsiteOnly: Boolean(s.onsiteOnly), script: s.script || null,
  }));
  const ev = {
    id: seed.evId || uid("ev"), type: seed.type, cat: seed.cat, country: seed.country, city: seed.city, lon: seed.lon, lat: seed.lat,
    sig: seed.sig, title: cleanText(nar.title, 70), summary: cleanText(nar.summary, 320), truth: cleanText(nar.truth || "", 400),
    facts, sources, headlines: nar.headlines || null,
    stage, born: t, stageAt: t, nextAt: t + T.dur[stage] * HOUR * rand(0.8, 1.25),
    heat: stage === 0 ? 5 + seed.sig * 4 : 18 + seed.sig * 9, pressure: 0, bias: 0,
    actor: seed.actor, agenda: seed.agenda, dir: seed.dir, cov: {},
    known: false, knownAt: null, seen: false, outcome: null, closedAt: null,
    campaign: Boolean(seed.campaign), canonText: seed.canonText || null, nar: nar.rule ? "rule" : "llm",
    fieldDone: false, deskDone: false, digs: 0,
  };
  if (seed.fixed) Object.assign(ev, seed.fixed);
  G.world.events[ev.id] = ev;
  if (ev.agenda && G.world.agendas[ev.agenda]) G.world.agendas[ev.agenda].heat = clamp(G.world.agendas[ev.agenda].heat + 6, 0, 100);
  checkDiscovery(ev, true);
  emit("event:new", ev);
  return ev;
}

// ───────── 발견 ─────────
export function checkDiscovery(ev, first = false) {
  if (ev.known) return true;
  const p = presence(ev.country);
  const net = G.player.skills.network;
  let found = false;
  if (ev.campaign) found = true;
  else if (ev.stage >= 1) {
    if (ev.sig >= 2 || p >= 1) found = true;
    else found = chance(0.04 + net * 0.03);
  } else if (p >= 2) found = chance((first ? 0.45 : 0.1) + net * 0.1);
  else if (p === 1) found = chance((first ? 0.25 : 0.06) + net * 0.08);
  else found = ev.sig >= 4 && chance(0.01 + net * 0.02);
  if (found) {
    ev.known = true;
    ev.knownAt = now();
    emit("lead:new", ev);
  }
  return found;
}

// ───────── 보도와 압력 ─────────
// 어떤 매체가 사건을 보도하면 관심도와 언론 압력이 쌓인다.
export function registerCoverage(ev, outletId, depth, quality, weight) {
  const prev = ev.cov[outletId];
  ev.cov[outletId] = { at: now(), depth: Math.max(prev?.depth ?? -1, depth), q: Math.max(prev?.q ?? 0, quality), n: (prev?.n ?? 0) + 1 };
  ev._boost = (ev._boost || 0) + clamp(weight * (1.5 + depth), 0.5, 14);
  ev.pressure += weight * (1 + depth * 0.9) * (quality / 6);
}
export const rivalMaxDepth = (ev) => Math.max(-1, ...Object.entries(ev.cov).filter(([k]) => k !== "player").map(([, v]) => v.depth));
export const rivalCount = (ev) => Object.keys(ev.cov).filter((k) => k !== "player").length;

// ───────── 단계 진행 ─────────
export function advanceStage(ev) {
  const T = EVENT_TYPES[ev.type];
  ev.stage++;
  ev.stageAt = now();
  if (ev.stage >= 4) return closeEvent(ev);
  ev.nextAt = now() + T.dur[ev.stage] * HOUR * rand(0.8, 1.25);
  if (ev.stage === 1) ev.heat = clamp(ev.heat + 12 + ev.sig * 7, 0, 100);
  else ev.heat = clamp(ev.heat + 3, 0, 100);
  checkDiscovery(ev);
  emit("event:stage", ev);
}

export function closeEvent(ev, forced) {
  const T = EVENT_TYPES[ev.type];
  ev.stage = 4;
  ev.closedAt = now();
  const thresh = 24 + ev.sig * 9;
  const P = ev.pressure + ev.bias * 14;
  const hi = forced?.hi ?? P >= thresh;
  ev.outcome = { hi, text: forced?.text ?? T.out?.[hi ? 0 : 1] ?? "사건은 마무리됐다" };
  const mul = hi ? 1.25 : 0.45;
  const imp = T.impact || {};
  const d = cd(ev.country);
  if (d) {
    if (imp.stab) d.stab = clamp(d.stab + imp.stab * 4 * mul, 2, 98);
    if (imp.appr) d.appr = clamp(d.appr + imp.appr * 5 * mul, 3, 95);
    if (imp.econ) d.econ = clamp(d.econ + imp.econ * 4 * mul, 3, 98);
    if (imp.tens) d.tens = clamp(d.tens + imp.tens * 5 * mul, 0, 100);
  }
  const a = ev.actor && actor(ev.actor);
  if (a && imp.rep) a.rep = clamp(a.rep + imp.rep * 7 * mul, 2, 98);
  const ag = ev.agenda && G.world.agendas[ev.agenda];
  if (ag && !ag.resolved) {
    ag.progress = clamp(ag.progress + ev.dir * (hi ? 9 : 4), 0, 100);
    ag.momentum = clamp(ag.momentum + ev.dir * 0.6, -3, 3);
    ag.heat = clamp(ag.heat + 8, 0, 100);
  }
  G.world.history.push({ id: ev.id, t: now(), title: ev.title, country: ev.country, cat: ev.cat, out: ev.outcome.text, hi });
  if (G.world.history.length > 80) G.world.history.shift();
  if (ev.known) feed("world", `[종결] ${ev.title} — ${ev.outcome.text}`, { ev: ev.id, cat: ev.cat });
  emit("event:closed", ev);
}

// 사건 강제 발생 (캠페인·기정 여파용)
export function spawnScripted(def) {
  const seed = {
    id: uid("sd"), evId: def.id, type: def.type, cat: def.cat ?? EVENT_TYPES[def.type].cat, country: def.country, city: def.city,
    lon: def.lon, lat: def.lat, sig: def.sig ?? 2, actor: def.actor ?? null, agenda: def.agenda ?? null, dir: def.dir ?? 1,
    start: def.start ?? 1, campaign: def.campaign ?? true, fixed: def.fixed ?? null,
  };
  return addEvent(seed, def.nar);
}
