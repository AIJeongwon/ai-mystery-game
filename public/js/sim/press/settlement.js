// 하루 정산 — 자정마다 구독료·운영비·급여를 정리하고 풍화와 자금난을 처리한다
import { G, blankDay } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { clamp, sum, dayIndex } from "../../core/util.js";
import { ECON } from "../../data/progress.js";
import { C, cd, cname, countryIds, presence, feed, now } from "../world.js";
import { pay, earn } from "./money.js";
import { fire, refreshCandidates } from "./staff.js";
import { closeBureau } from "./bureaus.js";

export function dailySettlement() {
  const o = G.outlet;
  const t = o.today;
  const subRev = Math.floor(o.subs) * ECON.subFeeDaily;
  earn(subRev, "sub");
  const rent = ECON.rentDaily[o.tier - 1];
  const payroll = sum(o.staff, (s) => s.salary);
  const bur = sum(o.bureaus, (id) => ECON.bureauDaily(C(id).gdp));
  pay(rent, "rent");
  pay(payroll, "pay");
  pay(bur, "bureau");
  let interest = 0;
  if (o.cash < 0) {
    interest = Math.round(-o.cash * 0.02);
    pay(interest, "etc");
  }
  const income = t.ad + t.sub + t.plat + (t.otherIncome ?? 0);
  const expense = t.rent + t.pay + t.bureau + t.travel + t.invest + t.legal + t.etc;
  const rec = { day: dayIndex(now()) - 1, ...t, income, expense, net: income - expense, cash: o.cash, subs: Math.floor(o.subs), cred: o.cred };
  o.ledger.push(rec);
  o.today = blankDay();
  // 신뢰는 가만히 두면 닳는다 / 구독 이탈과 독자층 풍화
  if (o.cred > 60) o.cred -= (o.cred - 60) * 0.012;
  o.subs = Math.max(0, o.subs * (1 - (0.004 + Math.max(0, 45 - o.cred) * 0.0004)));
  for (const id of countryIds()) {
    const d = cd(id);
    if (d.my > 0) d.my *= presence(id) >= 1 ? 0.998 : 0.985;
  }
  // 자금난
  const limit = -3_000_000 * Math.pow(4, o.tier - 1);
  if (o.cash < limit) {
    if (o.staff.length) {
      const s = [...o.staff].sort((a, b) => b.salary - a.salary)[0];
      fire(s.id);
      feed("sys", `[자금난] 급여를 감당하지 못해 ${s.name} 기자가 회사를 떠났다.`);
    } else if (o.bureaus.length) {
      const id = o.bureaus[o.bureaus.length - 1];
      closeBureau(id);
      feed("sys", `[자금난] ${cname(id)} 지국을 폐쇄했다.`);
    } else {
      o.cred = clamp(o.cred - 1.5, 1, 99);
      feed("sys", "[자금난] 체불 소문이 돌며 신뢰도가 떨어졌다.");
    }
  }
  refreshCandidates();
  emit("day:settled", rec);
  return rec;
}
