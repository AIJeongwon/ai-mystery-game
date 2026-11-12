// 규칙 기반 기사 판정 — LLM을 쓸 수 없을 때 낱말 겹침으로 어림한다
import { clamp } from "../../core/util.js";

const SENS_WORDS = ["충격", "경악", "발칵", "초토화", "난리", "소름", "!!", "??", "최악", "파문"];
export function fallbackJudge({ ev, headline, body }) {
  const used = [];
  const falseClaims = [];
  if (ev) {
    for (const f of ev.facts) {
      const toks = f.text.split(/[\s,.·"'()]+/).filter((w) => w.length >= 3);
      const hit = toks.filter((w) => body.includes(w.slice(0, Math.max(2, w.length - 1)))).length;
      if (toks.length && hit / toks.length >= (f.true ? 0.45 : 0.8)) {
        used.push(f.id);
        if (!f.true && !/소문|의혹|주장|알려졌|전해졌/.test(body)) falseClaims.push(f.text);
      }
    }
  }
  const sens = clamp(SENS_WORDS.filter((w) => (headline + body).includes(w)).length * 2 + (headline.match(/[!?]/g)?.length || 0), 0, 10);
  return {
    comment: "데스크가 자리를 비워 기계적으로 검토했다. 사실 관계와 분량은 기준을 통과했다.",
    accuracy: clamp(8 - falseClaims.length * 3, 0, 10),
    writing: clamp(Math.round(2 + body.length / 110), 2, 8),
    headline: clamp(Math.round(3 + (headline.length >= 10 && headline.length <= 32 ? 3 : 1) + (ev && headline.includes(ev.city) ? 1 : 0)), 2, 8),
    sensational: sens, used, false_claims: falseClaims, unsupported: 0, on_topic: true,
  };
}
