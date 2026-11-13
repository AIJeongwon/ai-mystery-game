// 독자 도달 — 기사 한 건이 어느 나라에서 얼마나 읽힐지
import { G } from "../../core/store.js";
import { sum } from "../../core/util.js";
import { HOME } from "../../data/world.js";
import { C, cd, audience, countryIds, presence } from "../world.js";
import { upLv, tierDef } from "./base.js";

const REL_HOME = [0, 0.12, 0.3, 0.55, 0.8, 1];
const REL_WORLD = [0, 0, 0.03, 0.12, 0.3, 0.55];
function access(id) {
  if (id === HOME) return 1;
  const p = presence(id);
  const base = p >= 2 && G.outlet.bureaus.includes(id) ? 0.6 : p >= 1 ? 0.22 : 0.03;
  return Math.min(1, base + (G.outlet.tier >= 4 ? 0.1 : 0) + (G.outlet.tier >= 5 ? 0.15 : 0));
}
// 한 나라에서 차지할 수 있는 독자 비중의 한도 — 매체 등급과 현지 기반에 달렸다
const SHARE_CAP = [0.012, 0.04, 0.09, 0.16, 0.26];
export const shareCap = (id) => SHARE_CAP[G.outlet.tier - 1] * (id === HOME ? 1 : access(id) * 0.5);
// 나라별 '이 기사에 관심 가질 수 있는 독자' 가중치
function relevance(id, evCountry, sig) {
  if (id === evCountry) return 1;
  if (id === HOME) return REL_HOME[sig];
  return REL_WORLD[sig] * (C(id).region === C(evCountry).region ? 2 : 1);
}

export function estimateViews({ evCountry, sig, heat, Q, X, sens, cat }) {
  const cred = G.outlet.cred;
  const credF = 0.5 + cred / 100;
  const open = (0.22 + 0.06 * Q) * (0.6 + heat / 110);
  const viralRate = 2.6e-4 * (1 + upLv("marketing") * 0.15) * tierDef().reach * credF * Math.pow(Math.max(Q, 0.5) / 5, 2.2)
    * (0.3 + Math.pow(heat / 40, 1.3)) * X * (1 + sens * 0.07) * (G.world.trends[cat] || 1);
  const dist = {};
  let total = 0;
  for (const id of countryIds()) {
    const rel = relevance(id, evCountry, sig);
    if (rel <= 0) continue;
    const A = audience(id);
    const loyal = cd(id).my * A * rel * open;
    const viral = A * rel * access(id) * viralRate;
    const v = loyal + viral;
    if (v < 1) continue;
    dist[id] = v;
    total += v;
  }
  return { total, dist };
}

export const totalReaders = () => sum(countryIds(), (id) => cd(id).my * audience(id));
