// 이동 — 거리로 시간과 비용을 정하고, 가는 동안 세계가 흐른다
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { geoDistKm } from "../../core/util.js";
import { ECON } from "../../data/progress.js";
import { C, now } from "../world.js";
import { spend, skill } from "./base.js";
import { pay } from "./money.js";

export function travelInfo(dest) {
  const a = C(G.player.loc), b = C(dest);
  const km = geoDistKm(a.lon, a.lat, b.lon, b.lat);
  const f = 1 - skill("mobility") * 0.1;
  return { km, mins: Math.round(ECON.travelMin(km) * f), cost: Math.round((ECON.travelCost(km) * f) / 1000) * 1000 };
}
export function travelTo(dest) {
  if (dest === G.player.loc) return false;
  const info = travelInfo(dest);
  if (G.outlet.cash < info.cost) return false;
  pay(info.cost, "travel");
  const from = G.player.loc;
  G.player.travel = { from, to: dest, depart: now(), arrive: now() + info.mins };
  emit("travel:start", G.player.travel);
  return spend(info.mins, () => {
    G.player.loc = dest;
    G.player.city = C(dest).cap;
    G.player.travel = null;
    emit("travel:end", dest, from);
    return true;
  });
}
