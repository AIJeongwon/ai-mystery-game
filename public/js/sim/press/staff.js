// 직원 — 채용 후보, 고용·해고·배치, 소속 기자의 자동 취재
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { clamp, rand, chance, pick, uid } from "../../core/util.js";
import { HOME, CAT_KEYS, NAME_POOLS } from "../../data/world.js";
import { ECON } from "../../data/progress.js";
import { C, feed, now, registerCoverage, rivalCount, knownEvents } from "../world.js";
import { tierDef } from "./base.js";
import { pay } from "./money.js";
import { learnFact } from "./notebook.js";
import { estimateViews } from "./reach.js";

export function refreshCandidates() {
  const list = [];
  for (let i = 0; i < 3; i++) {
    const sk = clamp(rand(0.15, 0.6) + G.outlet.tier * 0.07 + rand(0, 0.15), 0.1, 0.98);
    list.push({ id: uid("cd"), name: pick(NAME_POOLS.kr), skill: +sk.toFixed(2), beat: pick(CAT_KEYS), cost: Math.round(ECON.hireCost(sk) / 10000) * 10000, salary: Math.round(ECON.salaryDaily(sk) / 1000) * 1000 });
  }
  G.outlet.candidates = list;
}
export function hire(cid) {
  const o = G.outlet;
  const c = o.candidates.find((x) => x.id === cid);
  if (!c || o.staff.length >= tierDef().staff || o.cash < c.cost) return false;
  pay(c.cost, "invest");
  o.candidates = o.candidates.filter((x) => x.id !== cid);
  o.staff.push({ id: uid("st"), name: c.name, skill: c.skill, beat: c.beat, salary: c.salary, post: HOME, hired: now(), lastAt: 0, filed: 0 });
  emit("staff");
  return true;
}
export function fire(sid) {
  G.outlet.staff = G.outlet.staff.filter((s) => s.id !== sid);
  emit("staff");
}
export function assign(sid, countryId) {
  const s = G.outlet.staff.find((x) => x.id === sid);
  if (!s) return false;
  if (countryId !== HOME && !G.outlet.bureaus.includes(countryId)) return false;
  s.post = countryId;
  emit("staff");
  return true;
}

function staffHourly() {
  const o = G.outlet;
  for (const s of o.staff) {
    if (now() - s.lastAt < 300) continue;
    const evs = knownEvents().filter((e) => e.country === s.post && e.stage >= 1 && e.stage < 4 && !e.campaign && (e.cov.player?.stage ?? -1) < e.stage);
    if (!evs.length || !chance(0.45)) continue;
    evs.sort((a, b) => (b.cat === s.beat ? 30 : 0) + b.heat - ((a.cat === s.beat ? 30 : 0) + a.heat));
    const ev = evs[0];
    const depth = chance(s.skill * 0.65) ? 1 : 0;
    for (const f of ev.facts) if (f.true && f.depth <= depth) learnFact(ev, f.id, "confirmed", "staff");
    const Q = clamp(3.4 + s.skill * 3.6 + rand(-0.5, 0.5), 2, 8);
    const rn = rivalCount(ev);
    const est = estimateViews({ evCountry: ev.country, sig: ev.sig, heat: ev.heat, Q, X: Math.max(0.5, 1 / (1 + 0.22 * rn)), sens: 2, cat: ev.cat });
    let cpmF = 0;
    for (const [id, v] of Object.entries(est.dist)) cpmF += (v / est.total) * (0.35 + C(id).gdp * 0.19);
    const head = ev.headlines?.dry || ev.title;
    o.articles.push({
      id: uid("ar"), at: now(), ev: ev.id, cat: ev.cat, country: ev.country, headline: head, body: "", decree: null, auto: true, by: s.name,
      scores: { acc: 7, wri: Q, head: Q, sens: 2, depth: depth + 2, Q }, used: ev.facts.filter((f) => f.true && f.depth <= depth).map((f) => f.id), usedAll: [],
      maxDepth: depth, scoop: false, first: rn === 0, rehash: false, X: 1, plan: Math.round(est.total * 0.6), done: 0, rev: 0, newSubs: 0, tick: 0, cpmF,
      dist: est.dist, total: est.total, comment: "", falseClaims: [], unsupported: 0, dCred: 0, via: "staff", settled: false, evTitle: ev.title,
    });
    o.totals.articles++;
    registerCoverage(ev, "player", depth, Q, clamp(Math.sqrt(est.total / 2500), 0.3, 8));
    ev.cov.player.stage = ev.stage;
    s.lastAt = now();
    s.filed++;
    feed("mine", `${head} (${s.name} 기자)`, { ev: ev.id, cat: ev.cat });
  }
}

export function pressHourly() {
  staffHourly();
}
