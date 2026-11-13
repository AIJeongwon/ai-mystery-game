// 사건이 끝난 뒤의 정산 — 정정보도와 보도 적중
import { G } from "../../core/store.js";
import { on, emit } from "../../core/bus.js";
import { clamp, fmtWon } from "../../core/util.js";
import { feed } from "../world.js";
import { addInk } from "../canon.js";
import { upLv } from "./base.js";
import { pay } from "./money.js";

let bound = false;
export function initPress() {
  if (bound) return;
  bound = true;
  on("event:closed", (ev) => {
    const o = G.outlet;
    for (const a of o.articles) {
      if (a.ev !== ev.id || a.settled) continue;
      a.settled = true;
      if (a.auto) continue;
      if (a.falseClaims.length) {
        const n = a.falseClaims.length;
        const soften = upLv("factcheck") >= 2 ? 0.5 : 1;
        const dc = -2.6 * n * soften;
        o.cred = clamp(o.cred + dc, 1, 99);
        const legal = Math.round(400_000 * n * o.tier * (1 - upLv("legal") * 0.25));
        pay(legal, "legal");
        o.subs = Math.max(0, o.subs * (1 - 0.015 * n * soften));
        feed("sys", `[정정보도] 「${a.headline}」의 일부 내용이 사실과 다른 것으로 드러났다. 신뢰도 ${dc.toFixed(1)}, 법무 비용 ${fmtWon(legal)}`, { art: a.id });
        emit("fallout", a, { dc, legal });
      } else if (a.maxDepth >= 2 && ev.outcome?.hi) {
        o.cred = clamp(o.cred + 1.2 * (1 - o.cred / 115), 1, 99);
        const ink = addInk(2);
        feed("sys", `[보도 적중] 「${a.headline}」의 내용이 공식 확인됐다. 신뢰도가 올랐다.`, { art: a.id });
        emit("vindicated", a, { ink });
      }
    }
  });
}
