// 엔진 장기 구동·경제 밸런스 점검:  node tools/balance.mjs [일수]
// 브라우저 없이 규칙 엔진만 돌린다 (LLM 미연결 → 규칙 기반 서사·판정). 자동 플레이 봇이 하루 몇 건씩 취재·발행한다.
import { setG, newGame } from "../public/js/core/store.js";
import { on } from "../public/js/core/bus.js";
import { advance } from "../public/js/sim/clock.js";
import { initDirector } from "../public/js/sim/director.js";
import {
  initPress, deskResearch, fieldWork, canField, deepDig, digInfo, publish, notes, tierCheck, tierUp, buyUpgrade, upgradeCost,
  hire, refreshCandidates, openBureau, canOpenBureau, tierDef, totalReaders,
} from "../public/js/sim/press.js";
import { knownEvents, activeEvents, cname } from "../public/js/sim/world.js";
import { ranking } from "../public/js/sim/rivals.js";
import { fmtWon, fmtNum, dayIndex } from "../public/js/core/util.js";

const DAYS = Number(process.argv[2]) || 30;
const g = newGame({ reporter: "봇", outlet: "시험신문", skipPrologue: true, seed: 42 });
setG(g);
initDirector();
initPress();
refreshCandidates();

const log = [];
let errors = 0;
on("fallout", () => log.push("정정보도"));
on("tier", (t) => log.push(`승격→${t}`));
on("canon:enacted", (c) => log.push(`기정:${c.belief.slice(0, 14)}`));

async function botAct() {
  const o = g.outlet;
  // 경영
  if (tierCheck()?.ok) tierUp();
  for (const k of ["site", "marketing", "gear", "factcheck", "legal"]) {
    const c = upgradeCost(k);
    if (c != null && o.cash > c * 2.2) buyUpgrade(k);
  }
  if (o.staff.length < tierDef().staff) {
    const c = [...o.candidates].sort((a, b) => b.skill - a.skill)[0];
    if (c && o.cash > c.cost * 3) hire(c.id);
  }
  for (const id of ["392", "840", "826", "156", "276", "356"]) {
    const chk = canOpenBureau(id);
    if (chk.ok && o.cash > chk.cost * 1.8) openBureau(id);
  }
  // 취재: 아직 안 쓴(또는 단계가 바뀐) 사건 가운데 가장 뜨거운 것
  const cands = knownEvents().filter((e) => e.stage < 4 && (e.cov.player?.stage ?? -1) < e.stage);
  if (!cands.length) return false;
  cands.sort((a, b) => (canField(b).ok ? 40 : 0) + b.heat - ((canField(a).ok ? 40 : 0) + a.heat));
  const ev = cands[0];
  if (!ev.deskDone) deskResearch(ev);
  if (!ev.fieldDone && canField(ev).ok) fieldWork(ev);
  const di = digInfo(ev);
  if (di.ok && o.cash > di.cost * 6 && Math.random() < 0.5) deepDig(ev);
  const nb = notes(ev.id);
  const facts = ev.facts.filter((f) => nb[f.id]?.st === "confirmed");
  if (!facts.length) return false;
  const body = facts.map((f) => f.text).join(" ");
  const art = await publish({ ev, headline: ev.title, body });
  return Boolean(art);
}

console.log(`일 | 자금 | 구독 | 독자 | 신뢰 | 등급 | 기사 | 직원 | 지국 | 사건(활성/포착) | 순위 | 비고`);
let day = dayIndex(g.time.min);
let lastAct = 0;
try {
  while (dayIndex(g.time.min) - 0 < DAYS) {
    advance(30);
    // 봇은 하루 4번쯤 기사를 쓴다 (6시간 간격)
    if (g.time.min - lastAct >= 330) {
      lastAct = g.time.min;
      try {
        await botAct();
      } catch (e) {
        errors++;
        console.error("봇 오류:", e);
        if (errors > 3) break;
      }
    }
    const d = dayIndex(g.time.min);
    if (d !== day) {
      day = d;
      const o = g.outlet;
      const rank = ranking().findIndex((r) => r.id === "player") + 1;
      const act = activeEvents();
      console.log([
        String(d).padStart(2), fmtWon(o.cash).padStart(9), fmtNum(o.subs).padStart(7), fmtNum(totalReaders()).padStart(7), o.cred.toFixed(1).padStart(5), o.tier,
        String(o.totals.articles).padStart(3), o.staff.length, o.bureaus.map(cname).join(",") || "-",
        `${act.length}/${act.filter((e) => e.known).length}`, `${rank}위`, log.splice(0).join(" "),
      ].join(" | "));
    }
  }
} catch (e) {
  console.error("엔진 오류:", e);
  errors++;
}
const o = g.outlet;
console.log("\n요약:", { 일수: DAYS, 자금: fmtWon(o.cash), 구독: Math.round(o.subs), 신뢰: +o.cred.toFixed(1), 등급: o.tier, 기사: o.totals.articles, 단독: o.totals.scoops, 누적조회: fmtNum(o.totals.views), 누적매출: fmtWon(o.totals.revenue), 종결사건: g.world.history.length, 오류: errors });
const arts = o.articles.filter((a) => !a.auto).slice(-8).map((a) => `${fmtNum(a.plan)}뷰 Q${a.scores.Q.toFixed(1)} X${a.X.toFixed(2)} ${a.scoop ? "단독" : ""}`);
console.log("최근 기사:", arts.join(" / "));
process.exit(errors ? 1 : 0);
