// 일정표 — 의제에서 예고된 일정을 잡고, 임박하면 사건 서사를 미리 청한다
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { rand, chance, pick, pickWeighted, uid, DAY } from "../../core/util.js";
import { HOME, SCHEDULE_KINDS } from "../../data/world.js";
import { now, presence } from "./query.js";
import { pickCity, makeSeed } from "./seeds.js";

const HOST_CITIES = [["756", "제네바", 6.14, 46.2], ["840", "뉴욕", -74.0, 40.71], ["404", "나이로비", 36.82, -1.29], ["702", "싱가포르", 103.82, 1.35], ["250", "파리", 2.35, 48.86], ["784", "두바이", 55.27, 25.2], ["076", "브라질리아", -47.88, -15.79]];
export function scheduleTick() {
  const sched = G.world.schedule;
  const t = now();
  const upcoming = sched.filter((s) => !s.done && s.at > t);
  if (upcoming.length < 9 && chance(0.6)) {
    const taken = new Set(upcoming.map((s) => s.agenda));
    const cands = Object.values(G.world.agendas).filter((a) => !a.resolved && !taken.has(a.id));
    if (cands.length) {
      const ag = pickWeighted(cands, (a) => (a.country === HOME ? 3 : a.country && presence(a.country) ? 2 : 1) * (0.5 + a.heat / 60));
      const kind = pick(ag.kinds);
      let country = ag.country, city;
      if (!country) {
        const host = ag.id === "g_climate" ? HOST_CITIES[2] : pick(HOST_CITIES);
        country = host[0];
        city = [host[1], host[2], host[3]];
      } else city = pickCity(country);
      const at = Math.ceil((t + rand(1.2, 6.5) * DAY) / 60) * 60;
      sched.push({ id: uid("sc"), at, kind, agenda: ag.id, country, city, title: `${ag.title} — ${SCHEDULE_KINDS[kind].label}`, cat: ag.cat, done: false, queued: false });
      sched.sort((a, b) => a.at - b.at);
    }
  }
  // 임박한 일정은 서사를 미리 준비한다
  for (const s of sched) {
    if (s.done || s.queued || s.at - t > 150) continue;
    s.queued = true;
    const ag = G.world.agendas[s.agenda];
    const seed = makeSeed({
      type: SCHEDULE_KINDS[s.kind].evType, country: s.country, city: s.city, agenda: s.agenda,
      sig: ag && !ag.country ? 4 : 3, start: 1, fireAt: s.at, schedId: s.id, cat: s.cat,
      hintExtra: `예고된 일정이다: 「${s.title}」. 의제 설명: ${ag?.desc ?? ""}`,
    });
    emit("seed", seed);
  }
  while (sched.length && sched[0].done && t - sched[0].at > 2 * DAY) sched.shift();
}
