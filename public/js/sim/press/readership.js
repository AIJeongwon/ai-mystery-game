// 조회수 정산 — 발행한 기사가 48시간에 걸쳐 읽히며 수익·구독·독자층이 쌓인다
import { G } from "../../core/store.js";
import { clamp } from "../../core/util.js";
import { ECON } from "../../data/progress.js";
import { cd, audience, now } from "../world.js";
import { upLv } from "./base.js";
import { earn } from "./money.js";
import { shareCap } from "./reach.js";

// 기사 조회수는 48시간에 걸쳐 풀린다
const REL = (() => {
  const w = [];
  let s = 0;
  for (let i = 0; i < 96; i++) {
    const v = Math.exp(-i / 16);
    w.push(v);
    s += v;
  }
  return w.map((v) => v / s);
})();
export function pressTick() {
  const o = G.outlet;
  for (let i = o.articles.length - 1; i >= 0; i--) {
    const a = o.articles[i];
    if (a.tick >= 96) {
      if (now() - a.at > 4 * 1440) break;
      continue;
    }
    const ev = a.ev && G.world.events[a.ev];
    const live = ev && ev.stage < 4 ? 0.75 + ev.heat / 160 : 0.8;
    const v = a.plan * REL[a.tick] * live;
    a.tick++;
    a.done += v;
    const ad = (v / 1000) * ECON.cpm * a.cpmF * (1 + upLv("site") * 0.2);
    const plat = v * ECON.platformRate;
    earn(ad, "ad");
    earn(plat, "plat");
    a.rev += ad + plat;
    o.today.views += v;
    o.totals.views += v;
    // 구독·독자층
    const credF = 0.5 + o.cred / 100;
    const conv = 0.0012 * Math.pow(a.scores.Q / 6, 1.5) * credF * (1 + upLv("site") * 0.15) * (a.scoop ? 1.6 : 1) * (1 - a.scores.sens * 0.04);
    const ns = v * conv;
    o.subs += ns;
    a.newSubs += ns;
    o.today.newSubs += ns;
    const keep = 0.04 * (a.scores.Q / 6) * credF;
    for (const [id, share] of Object.entries(a.dist)) {
      const d = cd(id);
      const A = audience(id);
      if (!d || A <= 0) continue;
      const room = Math.max(0, 1 - d.my / shareCap(id));
      d.my = clamp(d.my + (((v * share) / a.total) * keep * Math.pow(room, 1.4)) / A, 0, 0.5);
    }
  }
}
