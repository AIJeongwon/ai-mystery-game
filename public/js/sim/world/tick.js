// 세계 틱 — 30분마다 사건을 굴리고, 1시간마다 나라·의제·분야별 흐름을 갱신한다
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { clamp, rand, chance } from "../../core/util.js";
import { CAT_KEYS } from "../../data/world.js";
import { C, cd, now, countryIds, baseAttn, activeEvents } from "./query.js";
import { feed } from "./feed.js";
import { checkDiscovery, advanceStage } from "./events.js";
import { scheduleTick } from "./schedule.js";

let pendingSeeds = 0;
export const seedPending = (n) => (pendingSeeds = Math.max(0, pendingSeeds + n));

export function worldTick() {
  const t = now();
  const act = activeEvents();
  for (const ev of act) {
    if (!ev.known) checkDiscovery(ev);
    const decay = [0.994, 0.986, 0.979, 0.955][ev.stage] ?? 0.95;
    ev.heat = clamp(ev.heat * decay + (ev._boost || 0), 0, 100);
    ev._boost = 0;
    if (t >= ev.nextAt && !ev.hold) advanceStage(ev);
  }
  // 새 사건
  if (!G.campaign.flags.quietWorld) {
    const target = 11 + G.outlet.tier * 2;
    if (act.length + pendingSeeds < target && chance(act.length < target * 0.6 ? 0.9 : 0.5)) emit("need:event");
  }
  scheduleTick();
}

export function worldHourly() {
  const act = activeEvents();
  // 국가 수치: 기준값으로 천천히 회귀 + 관심도 갱신
  const heatBy = {};
  for (const ev of act) if (ev.stage >= 1) heatBy[ev.country] = (heatBy[ev.country] || 0) + ev.heat * (0.4 + ev.sig * 0.15);
  for (const id of countryIds()) {
    const c = C(id);
    const d = cd(id);
    d.stab += (c.stab - d.stab) * 0.006 + rand(-0.15, 0.15);
    d.appr += (46 - d.appr) * 0.004 + rand(-0.2, 0.2);
    d.econ += (38 + c.gdp * 8 - d.econ) * 0.004 + rand(-0.12, 0.12);
    d.tens += ((100 - c.stab) * 0.45 - d.tens) * 0.006;
    const target = clamp(baseAttn(id) + (heatBy[id] || 0) * 0.35, 0, 100);
    d.attn += (target - d.attn) * 0.25;
  }
  // 의제
  for (const ag of Object.values(G.world.agendas)) {
    if (ag.resolved) continue;
    ag.progress = clamp(ag.progress + ag.momentum * 0.12 + rand(-0.25, 0.25), 0, 100);
    ag.momentum *= 0.985;
    ag.heat = clamp(ag.heat * 0.992, 4, 100);
    if (ag.progress >= 100 || ag.progress <= 0) {
      const win = ag.progress >= 100 ? 0 : 1;
      ag.resolved = { t: now(), text: ag.poles[win], win };
      feed("world", `[의제 결착] ${ag.title}: ${ag.poles[win]}`, { cat: ag.cat });
      if (ag.country && cd(ag.country)) cd(ag.country).appr = clamp(cd(ag.country).appr + (win === 0 ? 3 : -3), 3, 95);
      emit("agenda:resolved", ag);
    }
  }
  // 분야별 관심 흐름
  const catHeat = {};
  for (const ev of act) catHeat[ev.cat] = (catHeat[ev.cat] || 0) + ev.heat * ev.sig;
  for (const k of CAT_KEYS) {
    const pull = clamp((catHeat[k] || 0) / 900, 0, 0.6);
    G.world.trends[k] = clamp(G.world.trends[k] + (1 + pull - G.world.trends[k]) * 0.08 + rand(-0.025, 0.025), 0.6, 1.7);
  }
}
