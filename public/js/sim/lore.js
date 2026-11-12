// 세계의 '상식' — 현재 유효한 기정문(記定文) 가운데 특정 장소·사건에 적용되는 것
import { G } from "../core/store.js";
import { COUNTRIES } from "../data/countries.js";

export function canonApplies(cn, countryId, evId) {
  if (!cn.active) return false;
  if (cn.scope === "world") return true;
  if (cn.scope === "region") return COUNTRIES[countryId]?.region === cn.region;
  if (cn.scope === "country") return cn.country === countryId;
  return cn.ev ? cn.ev === evId : cn.country === countryId;
}

// NPC와 연출가가 '당연한 사실'로 받아들이는 믿음 목록
export function commonSense(countryId, evId, forDirector = false) {
  return G.canon.list.filter((cn) => canonApplies(cn, countryId, evId) && !(forDirector && cn.ancient)).map((cn) => cn.belief);
}

export const activeCanon = () => G.canon.list.filter((cn) => cn.active);
export const myCanon = () => G.canon.list.filter((cn) => cn.active && cn.by === "player");
