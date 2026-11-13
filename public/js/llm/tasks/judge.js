// 기사 판정 — 편집 데스크가 기사를 사건의 실제 사실과 대조해 채점한다
import { CATS } from "../../data/world.js";
import { cfull } from "../../sim/world.js";
import { S } from "../api.js";
import { WORLD_RULES_TEXT } from "../world-rules.js";
import { TASK_LIMITS } from "./limits.js";

export const JUDGE_SCHEMA = S.obj({
  comment: S.str("데스크의 한두 문장 총평. 선배 기자의 말투"),
  accuracy: S.int([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  writing: S.int([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  headline: S.int([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  sensational: S.int([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  used: S.arr(S.str()),
  false_claims: S.arr(S.str()),
  unsupported: S.int([0, 1, 2, 3, 4, 5]),
  on_topic: S.bool(),
});

export function judgeRequest({ ev, headline, body, decree, known, extra }) {
  const system = `당신은 뉴스 게임 「기정사실」의 편집 데스크이자 팩트체커다. 기자(플레이어)가 직접 쓴 기사를 사건의 실제 사실 목록과 대조해 채점한다. 엄격하되 공정하게.
${WORLD_RULES_TEXT}

채점 기준(0~10):
- accuracy 정확성: 기사 내용이 실제 사실과 일치하는가. 사실 목록과 모순되거나 거짓 소문을 사실로 단정하면 크게 깎는다. 틀린 곳이 없으면 8 이상.
- writing 문장력: 리드가 분명한가, 육하원칙, 구성, 문장의 간결함. 두세 문장짜리 메모 수준이면 3 이하, 평범하면 5, 잘 짜인 기사는 8 이상.
- headline 제목: 핵심을 정확히 담으면서 읽고 싶게 만드는가. 본문과 다른 낚시 제목은 깎는다.
- sensational 선정성: 과장, 단정, 감정적 수사, 낚시성이 강할수록 높다. 차분한 스트레이트 기사는 2 이하.
- used: 기사 본문에 실질적으로 반영된 사실의 번호 목록 (표현이 달라도 내용이 같으면 포함).
- false_claims: 기사가 사실로 단정했지만 실제와 다른 주장을 짧게 인용 (없으면 빈 배열). 거짓 소문을 "~라는 소문이 있다"고 소개만 했으면 넣지 않는다.
- unsupported: 사실 목록 어디에도 근거가 없는 구체적 주장(수치, 발언, 사건)의 개수. 0~5.
- on_topic: 기사가 이 사건을 다루고 있는가.
- 〔 〕로 감싼 문장은 '기정문'이다. 채점에서 완전히 제외하고 false_claims나 unsupported에 넣지 않는다.
- comment: 기자에게 건네는 데스크의 총평 한두 문장. 잘한 점 하나와 아쉬운 점 하나. 단, '기자가 아직 모름'으로 표시된 사실의 내용은 절대 언급하거나 암시하지 않는다(취재가 더 필요하다는 정도로만 말한다). 진상 항목의 내용도 누설하지 않는다.`;

  let content;
  if (ev) {
    const facts = ev.facts.map((f) => `- [${f.id}] ${f.true ? "사실" : "거짓 소문"} · ${["공개", "현장", "내부", "핵심"][f.depth]}${known?.[f.id] ? ` · 기자가 ${known[f.id].st === "confirmed" ? "확인함" : "전해 들음"}` : " · 기자가 아직 모름"}: ${f.text}`);
    for (const [i, t] of (extra || []).entries()) facts.push(`- [x${i}] 사실 · 핵심 · 기자가 확인함: ${t}`);
    content = `[사건] ${ev.title} (${cfull(ev.country)} ${ev.city}, ${CATS[ev.cat].ko})
개요: ${ev.summary}
진상: ${ev.truth}

[사실 목록]
${facts.join("\n")}

[기자가 쓴 기사]
제목: ${headline}
본문:
${markDecree(body, decree)}`;
  } else {
    content = `[칼럼·기획 기사] 특정 사건에 매이지 않은 글이다. 사실 대조 대신 논리와 문장을 본다. accuracy는 논리적 타당성으로 채점하고 used와 false_claims는 빈 배열, on_topic은 true.

[기자가 쓴 글]
제목: ${headline}
본문:
${markDecree(body, decree)}`;
  }
  return { task: "judge", system, messages: [{ role: "user", content }], schema: JUDGE_SCHEMA, maxTokens: TASK_LIMITS.judge, thinking: true, timeoutMs: 70000 };
}
function markDecree(body, decree) {
  if (!decree) return body;
  return body.includes(decree) ? body.replace(decree, `〔${decree}〕`) : `${body}\n〔${decree}〕`;
}
