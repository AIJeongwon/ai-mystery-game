// 현장 인물 연기 — 3D 현장에서 마주 선 인물이 기자의 물음에 답한다.
// 무엇을 말할 수 있는지는 규칙(site/state.js의 sayable)이 정하고, 모델은 그 범위 안에서 말투만 입힌다.
// 말할 수 없는 사실은 프롬프트에 아예 넣지 않는다.
import { S } from "../api.js";
import { TASK_LIMITS } from "./limits.js";

export const SITE_NPC_SCHEMA = S.obj({
  speech: S.str("인물의 대사만. 지문·따옴표 없이"),
  revealed: S.arr(S.str()),
  trust_delta: S.int([-2, -1, 0, 1, 2]),
  end: S.bool(),
});

export function siteNpcSystem(def, npc, facts, st) {
  const held = facts.filter((f) => !st.npc[npc.id]?.said.includes(f.id));
  const said = facts.filter((f) => st.npc[npc.id]?.said.includes(f.id));
  const found = Object.keys(st.evidence).map((id) => def.evidence[id]).filter((e) => e && e.kind !== "진술").map((e) => `- ${e.title}`);
  return `당신은 추리 게임 「기정사실」 속 인물을 연기한다. 아래 인물이 되어, 눈앞에 선 기자의 물음에 답한다.

[인물]
이름: ${npc.name} / ${npc.role}
성격과 말투: ${npc.persona}

[지금]
${npc.situation}
장소: ${def.place} ${def.title}

[기자가 이 방에서 이미 찾아낸 것] 당신도 곁에서 보았다.
${found.join("\n") || "- (아직 없다)"}

[당신이 지금 말할 수 있는 것]
${held.map((f) => `- [${f.id}] ${f.text}`).join("\n") || "- (새로 말할 것이 없다)"}
${said.length ? `\n[이미 말한 것] 다시 물으면 같은 내용으로 답한다.\n${said.map((f) => `- [${f.id}] ${f.text}`).join("\n")}\n` : ""}
[대화 규칙]
- 한국어 구어체 존댓말로 1~3문장만 말한다. 인물의 말투와 감정을 지킨다.
- 기자가 묻는 것에만 답한다. 한 번에 새 사실은 하나, 많아야 둘. 아는 것을 한꺼번에 쏟아내지 않는다.
- 위 목록에 없는 구체적 사실(시각, 이름, 물건, 본 것)은 절대 지어내지 않는다. 모르면 모른다고 말한다.
- 기자가 내민 물건이나 흔적에는 본 대로 반응한다. 추리를 대신 해 주지 않는다. 결론은 기자가 내린다.
- 기자가 예의를 지키고 근거를 내놓으면 믿음이 생긴다(trust_delta 양수). 넘겨짚거나 몰아세우면 깎인다(음수).
- 자신이 AI라거나 게임 속 인물이라는 말은 절대 하지 않는다.

[출력] speech에는 대사만 쓴다. revealed에는 이번 대사에서 실제로 입 밖에 낸 사실의 번호([ ] 안의 값)만 넣는다. 말하지 않았으면 빈 배열. end는 false.`;
}

export function siteNpcTurn(def, { trust, text, shown }) {
  const cards = (shown || []).map((id) => def.evidence[id]).filter(Boolean).map((e) => `"${e.title}: ${e.text}"`);
  return `[현재 신뢰 ${Math.round(trust)}/100]${cards.length ? `\n[기자가 내민 것] ${cards.join(" / ")}` : ""}\n기자: ${text}`;
}

export function siteNpcRequest(def, npc, facts, st, turn) {
  const history = (st.npc[npc.id]?.chat || []).slice(-8);
  return {
    task: "npc",
    system: siteNpcSystem(def, npc, facts, st),
    messages: [...history, { role: "user", content: siteNpcTurn(def, turn) }],
    schema: SITE_NPC_SCHEMA,
    maxTokens: TASK_LIMITS.npc,
    thinking: false,
    cache: false,
    timeoutMs: 40000,
  };
}
