// 성장 — 경험치와 역량, 매체 등급, 설비 투자
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { TIERS, UPGRADES, SKILLS, XP_PER_LEVEL } from "../../data/progress.js";
import { feed } from "../world.js";
import { upLv } from "./base.js";
import { pay } from "./money.js";

export function gainXp(n) {
  const p = G.player;
  p.xp += n;
  let up = 0;
  while (p.xp >= XP_PER_LEVEL(p.level)) {
    p.xp -= XP_PER_LEVEL(p.level);
    p.level++;
    p.pts++;
    up++;
  }
  if (up) emit("levelup", p.level);
}
export function raiseSkill(key) {
  const p = G.player;
  if (p.pts <= 0 || p.skills[key] >= SKILLS[key].max) return false;
  p.pts--;
  p.skills[key]++;
  emit("skill", key);
  return true;
}

export function tierCheck() {
  const o = G.outlet;
  const next = TIERS[o.tier];
  if (!next) return null;
  const need = next.need;
  const state = {
    subs: { need: need.subs ?? 0, have: Math.floor(o.subs) },
    cred: { need: need.cred ?? 0, have: Math.floor(o.cred) },
    bureaus: { need: need.bureaus ?? 0, have: o.bureaus.length },
    cash: { need: next.cost, have: o.cash },
  };
  const ok = Object.values(state).every((s) => s.have >= s.need);
  return { next, state, ok };
}
export function tierUp() {
  const chk = tierCheck();
  if (!chk?.ok) return false;
  pay(chk.next.cost, "invest");
  G.outlet.tier++;
  feed("sys", `「${G.meta.outlet}」이(가) ${chk.next.name}(으)로 승격했다.`);
  emit("tier", G.outlet.tier);
  return true;
}

export function upgradeCost(key) {
  const lv = upLv(key);
  return lv >= UPGRADES[key].max ? null : UPGRADES[key].cost[lv];
}
export function buyUpgrade(key) {
  const cost = upgradeCost(key);
  if (cost == null || G.outlet.cash < cost) return false;
  pay(cost, "invest");
  G.outlet.upgrades[key] = upLv(key) + 1;
  emit("upgrade", key);
  return true;
}
