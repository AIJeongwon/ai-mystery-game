// 국면 전개 — 사건이 국면을 넘길 때 '그 뒤 무슨 일이 벌어졌는지'를 여러 사건 묶어 한 번에 받는다
// LLM은 경과 서술, 새 사실, 흐름의 기울기를 제안할 뿐이다. 받아들이는 범위는 sim/chronicle.js가 정한다.
import { CATS } from "../../data/world.js";
import { STAGES } from "../../data/templates.js";
import { cfull } from "../../sim/world.js";
import { commonSense } from "../../sim/lore.js";
import { S } from "../api.js";
import { WORLD_RULES_TEXT } from "../world-rules.js";
import { TASK_LIMITS } from "./limits.js";

export const CHRONICLE_SCHEMA = S.obj({
  items: S.arr(S.obj({
    id: S.str(),
    development: S.str("그 뒤 벌어진 일. 뉴스 문체 한두 문장"),
    new_fact: S.str("새로 드러난 구체적 사실 한 문장"),
    depth: S.int([0, 1]),
    tilt: S.int([-1, 0, 1]),
  })),
});

export function chronicleRequest(evs) {
  const system = `당신은 뉴스 시뮬레이션 게임 「기정사실」의 세계 연출가다. 이미 벌어진 사건들이 다음 국면으로 넘어갔다. 사건마다 '그 뒤 무슨 일이 벌어졌는지'를 이어 쓴다.
${WORLD_RULES_TEXT}

작성 규칙:
- development: 지금 국면에서 새로 벌어진 일을 뉴스 문체 한두 문장으로. 사건의 진상·기존 사실과 모순되지 않게, 구체적으로(누가 무엇을 했다).
- new_fact: 이 국면에서 새로 드러난, 기사에 그대로 쓸 수 있는 구체적 사실 한 문장(수치·이름·날짜 포함). 기존 사실을 되풀이하지 않는다. depth는 0(누구나 아는 공개 사실) 또는 1(현장에 가야 확인되는 사실).
- tilt: 흐름의 기울기. 언론의 압박이 강하고 증거가 드러나는 쪽이면 1(책임 규명 쪽), 당사자가 버티며 관심이 식는 쪽이면 -1(무마 쪽), 팽팽하면 0. '언론 압력' 값을 참고한다.
- 날짜는 "오늘", "이날"처럼만 쓰고 연·월을 쓰지 않는다. 참사·폭력은 절제해서 쓴다.
- items에는 주어진 사건을 모두, 주어진 id 그대로 담는다.`;
  const blocks = evs.map((ev) => {
    const sense = commonSense(ev.country, ev.id, true);
    const thresh = 24 + ev.sig * 9;
    return `[id: ${ev.id}] ${ev.title} (${cfull(ev.country)} ${ev.city}, ${CATS[ev.cat].ko})
지금 국면: ${STAGES[ev.stage].ko}
개요: ${ev.summary}
진상(공개되지 않음): ${ev.truth}
이미 알려진 사실: ${ev.facts.filter((f) => f.true && f.depth <= 1).map((f) => f.text).join(" / ")}
언론 압력: ${Math.round(ev.pressure)} (기준 ${thresh} — 넘으면 책임 규명 쪽으로 기운다) · 세간의 관심 ${Math.round(ev.heat)}/100${ev.devs?.length ? `\n앞선 경과: ${ev.devs.map((d) => d.text).join(" ")}` : ""}${sense.length ? `\n이 세계의 상식(모두가 사실로 믿는다): ${sense.join(" / ")}` : ""}`;
  });
  return { task: "chronicle", system, messages: [{ role: "user", content: blocks.join("\n\n") }], schema: CHRONICLE_SCHEMA, maxTokens: TASK_LIMITS.chronicle, thinking: true, timeoutMs: 60000, retries: 0 };
}
