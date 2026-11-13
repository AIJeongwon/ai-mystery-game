// 취재·경영 규칙이 함께 쓰는 바탕: 시간 쓰기, 투자·역량 단계, 지금 등급
import { G } from "../../core/store.js";
import { TIERS } from "../../data/progress.js";

// 시간 소모 (clock.skip이 주입된다)
let skipFn = (_min, finishAction) => finishAction?.();
export const bindSkip = (fn) => (skipFn = fn);
export const spend = (min, finishAction) => skipFn(Math.max(0, Math.round(min)), finishAction);

export const upLv = (k) => G.outlet.upgrades[k] || 0;
export const skill = (k) => G.player.skills[k] || 0;
export const gearF = () => 1 - upLv("gear") * 0.12;
export const tierDef = () => TIERS[G.outlet.tier - 1];
