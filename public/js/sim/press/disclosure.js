// 인터뷰 공개 조건 — 질문·신뢰도·확보한 근거만으로 판정하며 모델 응답은 조건을 바꾸지 못한다.
import { G } from "../../core/store.js";

export function trustGate(src, depth) {
  const base = [0, 25, 50, 70][depth] ?? 70;
  const adj = { friendly: -10, neutral: 0, evasive: 5, hostile: 15 }[src.stance] ?? 0;
  return Math.max(0, base + adj);
}

function matches(rule, context) {
  if (rule.trust != null && context.trust < rule.trust) return false;
  if (rule.evidence && !rule.evidence.every((id) => G.casefile.evidence[id])) return false;
  if (rule.ask && !rule.ask.every((group) => group.some((word) => context.text.includes(word)))) return false;
  return Boolean(rule.ask || rule.evidence || rule.trust != null || rule.always);
}

export function canDisclose(ev, src, fact, context = {}) {
  if (!fact || ![...src.knows, ...(src.lies || [])].includes(fact.id) || context.opening) return false;
  const ctx = { trust: 0, text: "", ...context };
  // 이미 이 취재원에게 들은 사실은 신뢰도가 낮아져도 반복해서 말할 수 있다.
  if (ctx.said?.has(fact.id)) return true;
  const rule = ctx.rules?.[fact.id] ?? fact.disclosure;
  if (rule) return rule.some((option) => matches(option, ctx));
  // 설명문만 있고 판정 규칙이 없는 조건부 사실은 임의로 공개하지 않는다.
  if (fact.cond) return false;
  return src.lies?.includes(fact.id) || ctx.trust >= trustGate(src, fact.depth);
}

export function disclosedFacts(ev, src, context) {
  return ev.facts.filter((fact) => canDisclose(ev, src, fact, context));
}

export function acceptReply(ev, src, context, data) {
  if (!data || typeof data.speech !== "string" || !Array.isArray(data.revealed)) return null;
  const revealed = [...new Set(data.revealed.map((id) => String(id).replace(/[\[\]\s]/g, "")))];
  const allowed = new Set(disclosedFacts(ev, src, context).map((fact) => fact.id));
  // 공개할 수 없는 사실을 포함한 답은 대사까지 버리고 규칙 응답으로 다시 만든다.
  if (revealed.some((id) => !allowed.has(id))) return null;
  return { ...data, revealed };
}
