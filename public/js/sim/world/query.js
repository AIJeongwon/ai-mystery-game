// 세계 조회 도우미 — 나라·행위자·사건을 찾고, 플레이어의 현지 기반을 판정한다
import { G } from "../../core/store.js";
import { clamp, pick, hash01 } from "../../core/util.js";
import { COUNTRIES, REGIONS } from "../../data/countries.js";
import { CATS, HOME, OUTLETS, NAME_POOLS, CULTURE_BY_COUNTRY, CULTURE_BY_REGION, PORTRAIT_BY_REGION } from "../../data/world.js";

export const C = (id) => COUNTRIES[id];
export const cd = (id) => G.world.c[id];
export const cname = (id) => COUNTRIES[id]?.short || COUNTRIES[id]?.ko || "?";
export const cfull = (id) => COUNTRIES[id]?.ko || "?";
export const now = () => G.time.min;
export const countryIds = () => Object.keys(G.world.c);
export const audience = (id) => {
  const c = COUNTRIES[id];
  return c && !c.minor ? c.pop * 1e6 * c.net * 0.3 : 0;
};
export const baseAttn = (id) => {
  const c = COUNTRIES[id];
  return clamp(6 + Math.log10(c.pop + 1) * 13 + c.gdp * 5, 5, 72);
};
export const actor = (id) => G.world.actors[id];
export const actorsOf = (countryId) => Object.values(G.world.actors).filter((a) => a.country === countryId);
export const agendasOf = (countryId) => Object.values(G.world.agendas).filter((a) => a.country === countryId && !a.resolved);
export const activeEvents = () => Object.values(G.world.events).filter((e) => e.stage < 4);
export const knownEvents = () => Object.values(G.world.events).filter((e) => e.known);

// 플레이어의 현지 기반: 3 본인 현장 / 2 본사·지국 / 1 파견 기자 / 0 없음
export function presence(id) {
  if (G.player.loc === id && !G.player.travel) return 3;
  if (id === HOME || G.outlet.bureaus.includes(id)) return 2;
  if (G.outlet.staff.some((s) => s.post === id)) return 1;
  return 0;
}
export const playerHere = (id) => G.player.loc === id && !G.player.travel;

export function culture(countryId) {
  return CULTURE_BY_COUNTRY[countryId] || CULTURE_BY_REGION[C(countryId)?.region] || "eur";
}
export function randomName(countryId) {
  return pick(NAME_POOLS[culture(countryId)] || NAME_POOLS.eur);
}
export function portraitFor(countryId, gender, age, salt = "") {
  const pool = PORTRAIT_BY_REGION[C(countryId)?.region] || ["eur"];
  const p = pool[Math.floor(hash01(countryId + salt) * pool.length)];
  return `g_${p}_${gender === "f" ? "f" : "m"}${age === "old" ? 2 : 1}`;
}

export function regionName(countryId) {
  return REGIONS[C(countryId)?.region] || "";
}
export const catName = (k) => CATS[k]?.ko || k;
export const outletName = (id) => (id === "player" ? G.meta.outlet : OUTLETS[id]?.short || id);
