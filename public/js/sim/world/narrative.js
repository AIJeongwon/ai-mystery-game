// 규칙 기반 서사 — LLM이 없을 때 유형별 틀(fb)에 이름과 숫자를 채워 사건을 만든다
import { randInt, hash01, josa } from "../../core/util.js";
import { EVENT_TYPES } from "../../data/templates.js";
import { cname, actor, randomName } from "./query.js";
import { ensureHead, ensureCorp } from "./actors.js";

function fill(tpl, ctx) {
  return tpl.replace(/\{(\w+)\}(은|는|이|가|을|를|과|와|으로|로)?(?=[\s,.·…"'”’)\]]|$)|\{(\w+)\}/g, (m, k1, particle, k2) => {
    const key = k1 || k2;
    const val = ctx[key] ?? "";
    if (!particle) return val;
    const pair = { 은: "은/는", 는: "은/는", 이: "이/가", 가: "이/가", 을: "을/를", 를: "을/를", 과: "과/와", 와: "과/와", 으로: "으로/로", 로: "으로/로" }[particle];
    return josa(val, pair);
  });
}
export function fallbackNarrative(seed) {
  const T = EVENT_TYPES[seed.type];
  const fb = T.fb;
  const act = seed.actor ? actor(seed.actor) : null;
  const corp = act?.kind === "corp" ? act : ensureCorp(seed.country);
  const head = act && act.kind !== "corp" ? act : ensureHead(seed.country);
  const names = [randomName(seed.country), randomName(seed.country), randomName(seed.country), randomName(seed.country), randomName(seed.country)];
  const ctx = {
    actor: head.name, org: corp.name, city: seed.city, country: cname(seed.country),
    n1: randInt(2, 9), n2: randInt(2, 8), p1: names[0], p2: names[1], p3: names[2],
  };
  let title = fill(fb.title, ctx);
  let summary = fill(fb.summary, ctx);
  if (seed.canonText) summary = `${summary} 모두가 아는 대로, ${seed.canonText}`;
  return {
    title, summary,
    truth: fill(fb.facts[fb.facts.length - 1][1], ctx),
    facts: fb.facts.map(([depth, text]) => ({ depth, text: fill(text, ctx) })),
    rumor: fill(fb.rumor, ctx),
    sources: fb.sources.map(([role, stance, knows, persona, lies], i) => ({
      name: names[(i + 2) % names.length], role: fill(role, ctx), stance, knows, persona,
      secret: "자신의 이름이 기사에 나가는 것을 몹시 꺼린다.", spreads_rumor: Boolean(lies),
      gender: hash01(seed.id + i) > 0.5 ? "f" : "m", age: hash01(seed.id + "a" + i) > 0.5 ? "old" : "young",
    })),
    headlines: { dry: title, analytic: `${title} — 무엇이 쟁점인가`, tabloid: `"이럴 수가" ${title}` },
    rule: true,
  };
}
