// 초안 보조 — 확보한 사실만으로 기사 초안을 잡는다 (편집 데스크 투자 후)
import { cfull } from "../../sim/world.js";
import { S } from "../api.js";
import { WORLD_RULES_TEXT } from "../world-rules.js";
import { TASK_LIMITS } from "./limits.js";

export const DRAFT_SCHEMA = S.obj({ headline: S.str("제목 후보 28자 이내"), body: S.str("기사 초안 4~6문장") });
export function draftRequest({ ev, facts }) {
  const system = `당신은 신문사 편집 데스크의 보조다. 기자가 확보한 사실만으로 스트레이트 기사 초안을 잡아 준다.
${WORLD_RULES_TEXT}
- 주어진 사실에 없는 내용은 한 글자도 보태지 않는다. '전해 들음' 표시가 있는 사실은 "~라는 증언이 나왔다"처럼 출처를 한정해 쓴다.
- 리드 한 문장에 핵심을 담고, 4~6문장으로 간결하게. 평가나 수식은 쓰지 않는다. 기자가 고쳐 쓸 밑그림이다.`;
  const content = `[사건] ${ev.title} (${cfull(ev.country)} ${ev.city})
[확보한 사실]
${facts.map((f) => `- (${f.st === "confirmed" ? "확인함" : "전해 들음"}) ${f.text}`).join("\n")}`;
  return { task: "draft", system, messages: [{ role: "user", content }], schema: DRAFT_SCHEMA, maxTokens: TASK_LIMITS.draft, thinking: false, timeoutMs: 40000 };
}
