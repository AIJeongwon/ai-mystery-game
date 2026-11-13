// 인터뷰의 신뢰도 초기값과 인내심
import { G } from "../../core/store.js";
import { clamp } from "../../core/util.js";
import { skill } from "./base.js";

export function initTrust(ev, src, onsite) {
  if (src.trust == null) {
    const st = { friendly: 12, neutral: 0, evasive: -6, hostile: -14 }[src.stance] ?? 0;
    src.trust = clamp(28 + G.outlet.cred * 0.25 + G.outlet.tier * 4 + skill("network") * 4 + st + (src.met ? 6 : 0), 5, 80);
  }
  return clamp(src.trust + (onsite ? 10 : -12), 3, 95);
}
export const patience = (src) => 6 + Math.floor((src.trust ?? 40) / 20);
