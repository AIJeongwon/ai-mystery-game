// 돈 — 지출과 수입을 오늘 장부의 항목별로 적는다
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";

export function pay(amount, kind = "etc") {
  G.outlet.cash -= amount;
  if (kind in G.outlet.today) G.outlet.today[kind] += amount;
  emit("cash");
}
export function earn(amount, kind = "etc") {
  G.outlet.cash += amount;
  if (kind === "etc") G.outlet.today.otherIncome = (G.outlet.today.otherIncome ?? 0) + amount;
  else if (kind in G.outlet.today) G.outlet.today[kind] += amount;
  G.outlet.totals.revenue += amount;
}
