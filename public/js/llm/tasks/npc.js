// 인물 연기 — 인터뷰에서 취재원으로 답한다
// 스키마의 속성 순서 = 생성 순서이므로 대사(speech)를 맨 앞에 둔다.
import { cfull } from "../../sim/world.js";
import { commonSense } from "../../sim/lore.js";
import { S } from "../api.js";
import { WORLD_RULES_TEXT } from "../world-rules.js";
import { TASK_LIMITS } from "./limits.js";

export const NPC_SCHEMA = S.obj({
  speech: S.str("인물의 대사만. 지문·따옴표 없이"),
  revealed: S.arr(S.str()),
  trust_delta: S.int([-2, -1, 0, 1, 2]),
  end: S.bool(),
});

const STANCE_DESC = {
  friendly: "기자에게 우호적이다. 하고 싶은 말이 많다.",
  neutral: "중립적이다. 물으면 아는 만큼 답한다.",
  evasive: "말을 아끼고 빠져나가려 한다. 믿음이 생기기 전에는 핵심을 피한다.",
  hostile: "방어적이다. 자기 쪽에 불리한 것은 인정하지 않고 공식 입장만 되풀이한다.",
};
export function trustGate(src, depth) {
  const base = [0, 25, 50, 70][depth] ?? 70;
  const adj = { friendly: -10, neutral: 0, evasive: 5, hostile: 15 }[src.stance] ?? 0;
  return Math.max(0, base + adj);
}

export function npcSystem(ev, src) {
  const sense = commonSense(ev.country, ev.id);
  const factLines = [];
  for (const id of src.knows) {
    const f = ev.facts.find((x) => x.id === id);
    if (!f) continue;
    const gate = trustGate(src, f.depth);
    const cond = f.cond ? f.cond : gate <= 0 ? "물으면 바로 말한다" : `신뢰도 ${gate} 이상일 때, 또는 기자가 이와 관련된 근거를 제시했을 때만 말한다`;
    factLines.push(`- [${id}] (${cond}) ${f.text}`);
  }
  for (const id of src.lies || []) {
    const f = ev.facts.find((x) => x.id === id);
    if (f) factLines.push(`- [${id}] (당신은 이 말이 사실이라고 믿거나, 자기에게 유리해서 퍼뜨린다. 기회가 오면 사실처럼 말한다) ${f.text}`);
  }
  const ageKo = src.age === "old" ? "50~60대" : "20~30대";
  return `당신은 뉴스 게임 「기정사실」 속 인물을 연기한다. 아래 인물이 되어, 찾아온 기자의 질문에 답한다.
${WORLD_RULES_TEXT}

[인물]
이름: ${src.name} / ${src.role} / ${ageKo} ${src.gender === "f" ? "여성" : "남성"}
사는 곳: ${cfull(ev.country)} ${ev.city}
성격과 말투: ${src.persona}
기자를 대하는 태도: ${STANCE_DESC[src.stance]}
남에게 숨기는 사정: ${src.secret || "없음"}

[지금 벌어진 일]
${ev.title} — ${ev.summary}
${sense.length ? `\n[세상의 상식] 당신을 포함해 세상 모두가 원래부터 당연한 사실로 알고 있는 것. 당신은 이것을 한 번도 의심한 적이 없고, 언제부터 알았는지도 굳이 따져 본 적 없다:\n${sense.map((s) => `- ${s}`).join("\n")}\n` : ""}
[당신이 아는 것]
${factLines.join("\n") || "- (공개된 개요 말고는 아는 것이 없다)"}
${src.script ? `\n[연기 지침]\n${src.script}\n` : ""}
[대화 규칙]
- 한국어 구어체로 1~3문장만 말한다. 인물의 말투와 감정을 유지한다.
- 기자가 묻는 것에만 답한다. 한 번에 새 사실은 많아야 한두 가지. 아는 것을 한꺼번에 쏟아내지 않는다.
- [당신이 아는 것]에 없는 구체적 사실(수치, 이름, 문서)은 지어내지 않는다. 모르면 모른다고 하거나 다른 사람에게 물어보라고 한다.
- 조건이 충족되지 않은 사실은 말하지 않는다. 얼버무리거나 화제를 돌린다. 단, 뭔가 더 있다는 낌새는 풍겨도 된다.
- 기자가 공감하거나, 근거를 내놓거나, 익명을 약속하면 믿음이 생긴다(trust_delta 양수). 무례하거나 넘겨짚거나 협박하면 믿음이 깎인다(음수).
- 같은 질문을 되풀이하거나 더 할 말이 없으면 end를 true로 해서 대화를 마무리한다.
- 자신이 AI라거나 게임 속 인물이라는 말은 절대 하지 않는다.

[출력] speech에는 대사만 쓴다. revealed에는 이번 대사에서 실제로 입 밖에 낸 사실의 번호([ ] 안의 값)만 넣는다. 말하지 않았으면 빈 배열.`;
}

export function npcUserTurn({ trust, onsite, text, shown, opening }) {
  const head = `[현재 신뢰도 ${Math.round(trust)}/100 · ${onsite ? "직접 만나서" : "전화로"}]`;
  if (opening) return `${head}\n(기자가 ${onsite ? "찾아와 명함을 내밀며" : "전화를 걸어"} 자신을 소개하고 이 일에 대해 묻고 싶다고 한다. 인물의 첫 반응을 한두 문장으로.)`;
  const ev = shown?.length ? `\n[기자가 제시한 근거] ${shown.map((s) => `"${s}"`).join(" / ")}` : "";
  return `${head}${ev}\n기자: ${text}`;
}

export function npcRequest(ev, src, history, turn) {
  const messages = [];
  for (const h of history) messages.push({ role: h.role, content: h.content });
  messages.push({ role: "user", content: turn });
  return { task: "npc", system: npcSystem(ev, src), messages, schema: NPC_SCHEMA, maxTokens: TASK_LIMITS.npc, thinking: false, cache: true, timeoutMs: 40000 };
}
