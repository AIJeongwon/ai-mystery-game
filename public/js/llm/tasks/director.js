// 사건 연출 — 규칙 엔진이 낸 사건 씨앗에 서사를 입힌다
import { G } from "../../core/store.js";
import { fmtDate } from "../../core/util.js";
import { CATS } from "../../data/world.js";
import { EVENT_TYPES, SIG_LABEL } from "../../data/templates.js";
import { C, cd, cfull, actor, regionName } from "../../sim/world.js";
import { commonSense } from "../../sim/lore.js";
import { S } from "../api.js";
import { WORLD_RULES_TEXT } from "../world-rules.js";
import { TASK_LIMITS } from "./limits.js";

export const DIRECTOR_SCHEMA = S.obj({
  title: S.str("신문 제목처럼 28자 이내"),
  summary: S.str("공개된 개요 2문장"),
  truth: S.str("이 사건의 숨은 진상 2문장 (플레이어에게는 보이지 않음)"),
  facts: S.arr(S.obj({ text: S.str(), depth: S.int([0, 1, 2, 3]) })),
  rumor: S.str("그럴듯하지만 거짓인 소문 한 문장"),
  sources: S.arr(
    S.obj({
      name: S.str(), role: S.str("직함·처지 20자 이내"), gender: S.en(["m", "f"]), age: S.en(["young", "old"]),
      stance: S.en(["friendly", "neutral", "evasive", "hostile"]),
      persona: S.str("성격과 말투 한 문장"), secret: S.str("숨기고 싶은 개인 사정 한 문장"),
      knows: S.arr({ type: "integer" }), spreads_rumor: S.bool(),
    }),
  ),
  headlines: S.obj({ dry: S.str(), analytic: S.str(), tabloid: S.str() }),
});

export function directorRequest(seed) {
  const T = EVENT_TYPES[seed.type];
  const c = C(seed.country);
  const d = cd(seed.country);
  const act = seed.actor ? actor(seed.actor) : null;
  const ag = seed.agenda ? G.world.agendas[seed.agenda] : null;
  const sense = commonSense(seed.country, null, true);
  const recent = [...Object.values(G.world.events).filter((e) => e.country === seed.country).slice(-4).map((e) => e.title), ...(seed.avoid || [])];

  const system = `당신은 뉴스 시뮬레이션 게임 「기정사실」의 세계 연출가다. 주어진 뼈대로 기자가 '취재할 수 있는 사건' 하나를 설계한다.
${WORLD_RULES_TEXT}

작성 규칙:
- facts는 정확히 6개. depth 0(누구나 아는 공개 사실) 2개, depth 1(현장에 가야 확인되는 사실) 2개, depth 2(내부자만 아는 사정) 1개, depth 3(사건의 핵심 진상) 1개. 순서는 depth 오름차순.
- 각 fact는 기사에 그대로 옮겨 쓸 수 있는 완결된 한 문장이며, 구체적인 수치·날짜·고유명사가 들어간다. 서로 모순되지 않고 truth와 일치한다.
- rumor는 facts와 모순되는 거짓 소문이다.
- sources는 정확히 3명, 입장이 서로 다르다. knows에는 그 사람이 아는 facts의 번호(0~5)를 적는다. depth 3 사실은 한 명만 알고, 그 사람은 friendly가 아니다. hostile(방어적)인 취재원은 depth 0 사실만 안다. spreads_rumor는 한 명만 true(거짓 소문을 사실처럼 말하는 사람).
- 참사·폭력은 절제해 쓰고, 혐오·선정적 내용은 넣지 않는다. 사건은 그 나라 사정에 맞게 구체적으로.
- title과 summary에는 연도·날짜를 쓰지 않는다("3일" 같은 표현 금지). facts 안에서만 필요한 날짜를 쓴다.
- rumor는 사실처럼 들리지만 명백히 틀린 단정문 한 문장이다(예: "대표가 이미 해외로 도피했다"). '~라는 소문이 돈다' 같은 꼬리를 붙이지 않는다.
- headlines: dry는 통신사식 건조체, analytic은 분석 기사 제목, tabloid는 자극적인 제목.`;

  const lines = [
    `사건 유형: ${T.label} (${CATS[seed.cat].ko})`,
    `장소: ${cfull(seed.country)} ${seed.city} · ${regionName(seed.country)}`,
    `규모: ${SIG_LABEL[seed.sig]} 수준의 뉴스 (1 지역 ~ 5 세계적 중 ${seed.sig})`,
    `시점: ${fmtDate(G.time.min, { dateOnly: true })}`,
    `그 나라 사정: 정치 안정 ${Math.round(d.stab)}/100, 정부 지지 ${Math.round(d.appr)}/100, 경기 ${Math.round(d.econ)}/100, 언론 자유 ${c.press}/100`,
  ];
  if (act) lines.push(`반드시 등장시킬 행위자: ${act.name} (${act.role})`);
  if (ag) lines.push(`연관 의제: 「${ag.title}」 — ${ag.desc} (쟁점의 양쪽: ${ag.poles[0]} / ${ag.poles[1]})`);
  lines.push(`서사 지침: ${T.hint}`);
  if (seed.hintExtra) lines.push(`추가 지침: ${seed.hintExtra}`);
  if (seed.canonText) lines.push(`핵심 전제: 세상 모든 사람이 「${seed.canonText}」를 원래부터 당연한 사실로 알고 있다. 이 사건은 그 전제 위에서 벌어지는 후속 사태다. 등장인물 누구도 이 전제를 의심하지 않는다.`);
  if (sense.length) lines.push(`이 세계의 상식(등장인물 모두가 사실로 믿는다):\n${sense.map((s) => `- ${s}`).join("\n")}`);
  if (recent.length) lines.push(`최근 같은 나라에서 이미 있었던 사건(겹치지 않게): ${recent.join(" / ")}`);

  return { task: "director", system, messages: [{ role: "user", content: lines.join("\n") }], schema: DIRECTOR_SCHEMA, maxTokens: TASK_LIMITS.director, thinking: true, timeoutMs: 75000 };
}
