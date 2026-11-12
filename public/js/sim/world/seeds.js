// 사건 씨앗 — 어느 나라에서 어떤 유형의 사건이 어떤 규모로 생길지 뽑는다
import { G } from "../../core/store.js";
import { randInt, chance, pick, pickWeighted, uid } from "../../core/util.js";
import { HOME, CITIES } from "../../data/world.js";
import { EVENT_TYPES, EVENT_TYPE_KEYS } from "../../data/templates.js";
import { C, cd, now, countryIds, actor, activeEvents, presence } from "./query.js";
import { pickActor } from "./actors.js";

let pendingProvider = () => [];
export const setPendingProvider = (fn) => (pendingProvider = fn);
const crowd = () => [...activeEvents(), ...pendingProvider()];
function sigCap(c) {
  if (c.pop < 5) return c.gdp >= 5 ? 3 : 2;
  if (c.pop < 30) return 3;
  if (c.pop < 100) return 4;
  return 5;
}
function pickCountry() {
  const tier = G.outlet.tier;
  const ids = countryIds();
  const busy = crowd();
  return pickWeighted(ids, (id) => {
    const c = C(id);
    const d = cd(id);
    let w = Math.pow(c.pop + 0.5, 0.36) * (0.6 + c.gdp * 0.18) * (0.7 + d.attn / 80);
    const p = presence(id);
    if (id === HOME) w *= [90, 48, 26, 15, 9][tier - 1] ?? 9;
    else if (p >= 2) w *= 13;
    else if (p === 1) w *= 6;
    const mine = busy.filter((e) => e.country === id).length;
    return w / (1 + mine * (p >= 2 ? 0.14 : 0.7));
  });
}
function pickType(countryId) {
  const merged = { ...C(countryId), ...cd(countryId) };
  const act = crowd();
  return pickWeighted(EVENT_TYPE_KEYS, (k) => {
    const t = EVENT_TYPES[k];
    const sameCat = act.filter((e) => e.cat === t.cat && e.country === countryId).length + act.filter((e) => e.cat === t.cat).length * 0.15;
    const sameType = act.filter((e) => e.type === k).length;
    return (t.w(merged) * (G.world.trends[t.cat] || 1)) / (1 + sameCat * 0.8 + sameType * 1.5);
  });
}
export function pickCity(countryId) {
  const list = CITIES[countryId];
  if (list) return pick(list);
  const c = C(countryId);
  return [c.cap || c.short, c.lon, c.lat];
}

export function makeSeed(opt = {}) {
  const country = opt.country ?? pickCountry();
  const type = opt.type ?? pickType(country);
  const T = EVENT_TYPES[type];
  const c = C(country);
  const cap = Math.max(T.sig[0], Math.min(T.sig[1], sigCap(c)));
  let sig = opt.sig ?? randInt(T.sig[0], cap);
  if (country === HOME && G.outlet.tier <= 1 && !opt.sig && chance(0.6)) sig = Math.min(sig, 2);
  const [city, lon, lat] = opt.city ?? pickCity(country);
  const act = opt.actor ? actor(opt.actor) : T.actor ? pickActor(country, T.actor) : chance(0.5) ? pickActor(country, "gov") : null;
  let agenda = opt.agenda ? G.world.agendas[opt.agenda] : null;
  if (!agenda && chance(0.45)) {
    const cands = Object.values(G.world.agendas).filter((a) => !a.resolved && a.cat === T.cat && (a.country === country || (!a.country && sig >= 3)));
    if (cands.length) agenda = pick(cands);
  }
  return {
    id: uid("sd"), type, cat: opt.cat ?? T.cat, country, city, lon, lat, sig,
    actor: act?.id ?? null, agenda: agenda?.id ?? null, dir: chance(0.5) ? 1 : -1,
    fireAt: opt.fireAt ?? null, start: opt.start ?? T.start, canonText: opt.canonText ?? null,
    hintExtra: opt.hintExtra ?? null, schedId: opt.schedId ?? null, queuedAt: now(),
  };
}
