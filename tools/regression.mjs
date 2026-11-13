// 회귀 지문:  node tools/regression.mjs [--update]
// 규칙 엔진을 정해진 씨앗과 정해진 행동으로 30일 돌린 뒤, 게임 상태 전체의 지문(SHA-256)을 낸다.
// 구조만 바꾸는 작업(리팩터링) 전후에 지문이 같으면 규칙 엔진의 동작이 그대로라는 뜻이다.
// 밸런스나 규칙을 일부러 바꿨다면 지문이 달라지는 것이 정상이다. 그때는 --update로 기준선을 새로 적는다.
// LLM은 쓰지 않는다(규칙 기반 서사·판정).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setG, newGame } from "../public/js/core/store.js";
import { on } from "../public/js/core/bus.js";
import { dayIndex } from "../public/js/core/util.js";
import { advance } from "../public/js/sim/clock.js";
import { initDirector } from "../public/js/sim/director.js";
import { initChronicle } from "../public/js/sim/chronicle.js";
import {
  initPress, deskResearch, fieldWork, canField, deepDig, digInfo, publish, notes, tierCheck, tierUp, buyUpgrade, upgradeCost,
  hire, assign, refreshCandidates, openBureau, canOpenBureau, tierDef, travelTo, travelInfo, raiseSkill,
} from "../public/js/sim/press.js";
import { knownEvents, spawnScripted } from "../public/js/sim/world.js";
import { resolveDecree, plantCanon, retract, revertCanon, upgradeStamp, stampUpgradeCost } from "../public/js/sim/canon.js";
import { myCanon } from "../public/js/sim/lore.js";
import { decreeTargets } from "../public/js/llm/prompts.js";
import { MORO_CANON } from "../public/js/campaign/chapter1.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "tests", "fixtures", "regression-baseline.json");
const DAYS = 30;
const SEED = 7;

// 엔진 바깥의 무작위(Math.random)도 고정한다
let lcg = 20310303;
const fixed = () => ((lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0) / 4294967296);
Math.random = fixed;

const g = newGame({ reporter: "회귀", outlet: "기준신문", skipPrologue: true, seed: SEED });
setG(g);
initDirector();
initChronicle();
initPress();
refreshCandidates();
plantCanon(MORO_CANON); // 캠페인이 시작할 때 심는 것과 같다

const counts = { articles: 0, decrees: 0, retracts: 0, digs: 0, travels: 0, errors: 0 };
on("canon:enacted", () => counts.decrees++);

// 각본 사건 하나 (증언 조건이 붙은 사실 포함)
spawnScripted({
  id: "rg_scene", type: "whistle", cat: "med", country: "410", city: "서울", lon: 126.98, lat: 37.57, sig: 2, start: 2,
  fixed: { hold: true, noRivals: true, localOnly: true, heat: 20 },
  nar: {
    title: "회귀용 각본 사건", summary: "회귀 점검에 쓰는 각본 사건이다.", truth: "숨은 사정이 있다.",
    facts: [
      { id: "a0", depth: 0, text: "공개된 사실 하나가 있다." },
      { id: "a1", depth: 1, text: "현장에서 확인되는 사실 하나가 있다." },
      { id: "a2", depth: 2, cond: "물으면 말한다", text: "증언으로만 얻는 사실 하나가 있다." },
    ],
    rumor: "근거 없는 소문 하나가 돈다.",
    sources: [{ id: "w", name: "증인", role: "관계자", stance: "neutral", gender: "f", age: "old", persona: "차분하다.", secret: "", knows: ["a0", "a2"] }],
  },
});

async function act(n) {
  const o = g.outlet;
  if (tierCheck()?.ok) tierUp();
  for (const k of ["site", "marketing", "gear", "factcheck", "legal", "desk"]) {
    const c = upgradeCost(k);
    if (c != null && o.cash > c * 2.2) buyUpgrade(k);
  }
  if (o.staff.length < tierDef().staff) {
    const c = [...o.candidates].sort((a, b) => b.skill - a.skill)[0];
    if (c && o.cash > c.cost * 3) hire(c.id);
  }
  for (const id of ["392", "840", "826", "156"]) {
    const chk = canOpenBureau(id);
    if (chk.ok && o.cash > chk.cost * 1.8) {
      openBureau(id);
      const s = o.staff.find((x) => x.post === "410");
      if (s) assign(s.id, id);
    }
  }
  for (const k of ["research", "network", "mobility", "sense"]) if (g.player.pts > 0) raiseSkill(k);
  for (const k of ["power", "hold", "scope", "veil", "slots"]) {
    const c = stampUpgradeCost(k);
    if (c != null && g.canon.ink >= c + 12) upgradeStamp(k);
  }
  // 출장: 5일째 일본, 9일째 귀국
  const day = dayIndex(g.time.min);
  if (day === 5 && g.player.loc === "410" && o.cash > travelInfo("392").cost * 3) counts.travels += travelTo("392") ? 1 : 0;
  if (day === 9 && g.player.loc === "392" && o.cash > travelInfo("410").cost * 2) counts.travels += travelTo("410") ? 1 : 0;
  // 오래된 내 문장 거두기
  const mine = myCanon();
  if (n % 9 === 0 && mine.length) {
    retract(mine[0]);
    counts.retracts++;
  }
  // 취재
  const cands = knownEvents().filter((e) => e.stage < 4 && (e.cov.player?.stage ?? -1) < e.stage);
  if (!cands.length) return;
  cands.sort((a, b) => (canField(b).ok ? 40 : 0) + b.heat - ((canField(a).ok ? 40 : 0) + a.heat) || (a.id < b.id ? -1 : 1));
  const ev = cands[0];
  if (!ev.deskDone) deskResearch(ev);
  if (!ev.fieldDone && canField(ev).ok) fieldWork(ev);
  const di = digInfo(ev);
  if (di.ok && o.cash > di.cost * 6 && fixed() < 0.5) {
    deepDig(ev);
    counts.digs++;
  }
  const nb = notes(ev.id);
  const facts = ev.facts.filter((f) => nb[f.id]?.st === "confirmed");
  if (!facts.length) return;
  let body = facts.map((f) => f.text).join(" ");
  // 세 번에 한 번은 도장을 찍어 본다 (감정은 규칙 엔진의 판정만 거친다)
  let appraisal = null;
  if (n % 3 === 0) {
    const sentence = `${ev.title}의 책임자는 물러났다.`;
    const targets = decreeTargets(ev);
    const ap = resolveDecree(sentence, { belief: sentence, valid: true, scope: "local", effects: [{ target: `event:${ev.id}`, attr: "outcome", dir: "up", mag: 2 }], reaction: "" }, targets, ev, "rule");
    if (ap.ok) {
      appraisal = ap;
      body += ` ${sentence}`;
    }
  }
  const art = await publish({ ev, headline: ev.title, body, appraisal });
  if (art) counts.articles++;
}

let last = 0;
let n = 0;
let reverted = false;
while (dayIndex(g.time.min) < DAYS) {
  advance(30);
  if (g.time.min - last >= 330) {
    last = g.time.min;
    try {
      await act(++n);
    } catch (e) {
      counts.errors++;
      console.error("행동 오류:", e);
      if (counts.errors > 3) break;
    }
  }
  if (!reverted && dayIndex(g.time.min) >= 20) {
    reverted = true;
    revertCanon(g.canon.list.find((c) => c.id === MORO_CANON.id));
  }
}

const snap = JSON.parse(JSON.stringify(g));
delete snap.meta.started;
delete snap.meta.realSeconds;
const digest = crypto.createHash("sha256").update(JSON.stringify(snap)).digest("hex");
const o = g.outlet;
const summary = {
  days: DAYS, seed: SEED, digest,
  cash: Math.round(o.cash), subs: Math.round(o.subs), cred: +o.cred.toFixed(3), tier: o.tier, staff: o.staff.length, bureaus: o.bureaus.length,
  events: Object.keys(g.world.events).length, closed: g.world.history.length, canon: g.canon.list.length, ink: +g.canon.ink.toFixed(3),
  level: g.player.level, ...counts,
};

if (process.argv.includes("--update")) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(summary, null, 2) + "\n");
  console.log("기준선을 새로 적었다:", summary);
  process.exit(0);
}
let base = null;
try {
  base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
} catch { /* 기준선 없음 */ }
if (!base) {
  console.log("기준선이 없다. --update로 만든다.", summary);
  process.exit(2);
}
if (base.digest === digest && !counts.errors) {
  console.log(`✔ 지문 일치 (${DAYS}일, 기사 ${counts.articles}건, 도장 ${counts.decrees}회, 등급 ${o.tier})`);
  process.exit(0);
}
console.log("✖ 지문이 기준선과 다르다. 규칙 엔진의 동작이 바뀌었다.");
for (const k of Object.keys(summary)) if (JSON.stringify(base[k]) !== JSON.stringify(summary[k])) console.log(`  ${k}: 기준 ${JSON.stringify(base[k])} → 지금 ${JSON.stringify(summary[k])}`);
process.exit(1);
