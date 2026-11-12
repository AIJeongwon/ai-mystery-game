// 지국 — 개설과 폐쇄
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { fmtWon } from "../../core/util.js";
import { HOME } from "../../data/world.js";
import { ECON } from "../../data/progress.js";
import { C, cd, cname, feed } from "../world.js";
import { tierDef } from "./base.js";
import { pay } from "./money.js";

export function bureauCost(id) {
  return Math.round(ECON.bureauCost(C(id).gdp, G.outlet.bureaus.length) / 100000) * 100000;
}
export function canOpenBureau(id) {
  if (id === HOME || G.outlet.bureaus.includes(id) || !cd(id)) return { ok: false, why: "이미 기반이 있는 곳" };
  if (G.outlet.bureaus.length >= tierDef().bureaus) return { ok: false, why: `현재 등급에서는 지국을 ${tierDef().bureaus}곳까지만 둘 수 있다` };
  const cost = bureauCost(id);
  if (G.outlet.cash < cost) return { ok: false, why: `자금 부족 (${fmtWon(cost)} 필요)`, cost };
  return { ok: true, cost };
}
export function openBureau(id) {
  const chk = canOpenBureau(id);
  if (!chk.ok) return false;
  pay(chk.cost, "invest");
  G.outlet.bureaus.push(id);
  cd(id).my = Math.max(cd(id).my, 0.00003);
  feed("sys", `${cname(id)} ${C(id).cap} 지국을 열었다.`);
  emit("bureau", id);
  return true;
}
export function closeBureau(id) {
  const i = G.outlet.bureaus.indexOf(id);
  if (i < 0) return;
  G.outlet.bureaus.splice(i, 1);
  for (const s of G.outlet.staff) if (s.post === id) s.post = HOME;
  emit("bureau", id);
}
