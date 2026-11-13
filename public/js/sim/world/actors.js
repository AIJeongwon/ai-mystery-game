// 행위자 — 고정 행위자가 없는 나라에서는 그 자리에서 수반과 기업을 만든다
import { G } from "../../core/store.js";
import { rand, chance, pick, uid } from "../../core/util.js";
import { HEAD_TITLE } from "../../data/world.js";
import { C, cname, actorsOf, randomName } from "./query.js";

export function ensureHead(countryId) {
  const found = Object.values(G.world.actors).find((a) => a.country === countryId && a.kind === "gov");
  if (found) return found;
  const c = C(countryId);
  const a = {
    id: `gov_${countryId}`, name: randomName(countryId), role: HEAD_TITLE[c.region] || "대통령",
    country: countryId, kind: "gov", rep: Math.round(35 + rand(25)), power: Math.round(30 + rand(30)), gen: true,
  };
  G.world.actors[a.id] = a;
  return a;
}
const CORP_SUFFIX = ["중공업", "은행", "통신", "에너지", "식품", "건설", "항공", "제약", "물산", "테크", "해운", "전력"];
export function ensureCorp(countryId) {
  const list = Object.values(G.world.actors).filter((a) => a.country === countryId && a.kind === "corp");
  if (list.length && (list.length >= 2 || chance(0.7))) return pick(list);
  const c = C(countryId);
  const stem = c.short.length <= 3 ? c.short : c.cap || c.short;
  const name = `${stem} ${pick(CORP_SUFFIX)}`;
  const dup = list.find((a) => a.name === name);
  if (dup) return dup;
  const a = { id: uid("corp"), name, role: `${cname(countryId)}의 대기업`, country: countryId, kind: "corp", rep: Math.round(45 + rand(20)), power: Math.round(25 + rand(30)), gen: true };
  G.world.actors[a.id] = a;
  return a;
}
export function pickActor(countryId, kind) {
  if (kind === "corp") {
    const list = actorsOf(countryId).filter((a) => a.kind === "corp");
    return list.length && chance(0.8) ? pick(list) : ensureCorp(countryId);
  }
  const list = actorsOf(countryId).filter((a) => a.kind === "gov" || a.kind === "opp");
  return list.length ? pick(list) : ensureHead(countryId);
}
