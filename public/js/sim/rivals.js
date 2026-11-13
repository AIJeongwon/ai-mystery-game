// 경쟁 언론사 — 사건을 보도하고, 특종을 가로채고, 독자를 나눠 갖는다.
import { G } from "../core/store.js";
import { clamp, rand, chance, sum } from "../core/util.js";
import { OUTLETS, RIVAL_IDS } from "../data/world.js";
import { activeEvents, registerCoverage, feed, cd, C, audience, countryIds, now } from "./world.js";

function regionWeight(rid, countryId) {
  const share = cd(countryId)?.share[rid] ?? 0;
  const o = OUTLETS[rid];
  let w = clamp(share / 0.05, 0.08, 2.4);
  if (o.hq === countryId) w *= 1.5;
  if (rid === "atlas") w = Math.max(w, 0.9); // 통신사는 어디든 간다
  return w;
}

function rivalHeadline(ev, rid, depth, first) {
  const o = OUTLETS[rid];
  const h = ev.headlines?.[o.style] || ev.title;
  if (depth >= 2) return `[단독] ${ev.headlines?.analytic || ev.title}`;
  if (first) return h;
  const tails = { dry: ["후속", "종합", "2보"], analytic: ["쟁점 정리", "남은 질문들", "심층 분석"], tabloid: ["충격 전말", "현장 반응 폭발", "지금 난리난 이유"] }[o.style];
  return `${ev.title} — ${tails[Math.min(tails.length - 1, ev.stage - 1)]}`;
}

export function rivalsTick() {
  const t = now();
  for (const ev of activeEvents()) {
    if (ev.stage < 1 || ev.noRivals) continue;
    for (const rid of RIVAL_IDS) {
      const o = OUTLETS[rid];
      const cov = ev.cov[rid];
      if (cov && cov.stage === ev.stage) continue;
      const sigF = [0, 0.35, 0.7, 1, 1.25, 1.5][ev.sig];
      const p = o.speed * (o.cats[ev.cat] || 1) * regionWeight(rid, ev.country) * (0.05 + ev.heat / 220) * sigF * 0.5;
      if (!chance(clamp(p, 0, 0.6))) continue;
      // 취재 깊이: 단계가 진행될수록 깊이 팔 수 있다
      let depth = 0;
      const cap = Math.min(3, ev.stage);
      while (depth < cap && chance(o.depth * (depth === 0 ? 0.75 : 0.42))) depth++;
      const quality = clamp(3.5 + o.depth * 4 + rand(-1, 1.5), 2, 9.5);
      const reach = clamp(Math.sqrt((cd(ev.country)?.share[rid] || 0.002) * 100) * 2.2, 0.6, 6);
      const prevMax = Math.max(-1, ...Object.values(ev.cov).map((c) => c.depth));
      registerCoverage(ev, rid, depth, quality, reach);
      ev.cov[rid].stage = ev.stage;
      const r = G.rivals[rid];
      r.articles++;
      r.lastAt = t;
      const scoop = depth >= 2 && depth > prevMax;
      if (scoop) r.scoops++;
      if (ev.known) feed("rival", rivalHeadline(ev, rid, depth, !cov), { outlet: rid, ev: ev.id, cat: ev.cat, scoop });
      // 보도한 나라에서 독자를 조금 얻는다
      const d = cd(ev.country);
      if (d) d.share[rid] = clamp((d.share[rid] || 0) + 0.0004 * quality * (scoop ? 2 : 1), 0, 0.45);
    }
  }
}

export function rivalsHourly() {
  // 점유율은 기본값 쪽으로 천천히 돌아간다
  for (const id of countryIds()) {
    const d = cd(id);
    const c = C(id);
    for (const rid of RIVAL_IDS) {
      const o = OUTLETS[rid];
      const base = o.countries?.[id] ?? o.regions?.[c.region] ?? 0;
      if (!base && !d.share[rid]) continue;
      const cur = d.share[rid] || 0;
      d.share[rid] = clamp(cur + (base - cur) * 0.003, 0, 0.45);
    }
    // 전체 점유율 합이 0.92를 넘지 않게 (나머지는 지역 군소 매체)
    const total = sum(Object.values(d.share)) + d.my;
    if (total > 0.92) {
      const k = (0.92 - d.my) / (total - d.my);
      for (const rid of Object.keys(d.share)) d.share[rid] *= k;
    }
  }
  for (const rid of RIVAL_IDS) {
    const r = G.rivals[rid];
    r.cred += ((r.base ?? OUTLETS[rid].cred) - r.cred) * 0.002;
  }
}

// 순위표용 집계
export function outletStats(id) {
  let readers = 0;
  for (const cid of countryIds()) {
    const d = cd(cid);
    readers += (id === "player" ? d.my : d.share[id] || 0) * audience(cid);
  }
  const cred = id === "player" ? G.outlet.cred : G.rivals[id].cred;
  return { id, readers, cred, influence: Math.sqrt(readers) * (0.4 + cred / 100) };
}
export function ranking() {
  return ["player", ...RIVAL_IDS].map(outletStats).sort((a, b) => b.influence - a.influence);
}
