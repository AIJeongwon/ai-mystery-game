// 기정문 해석 — 도장이 찍힌 문장을 '효과 제안'으로 번역한다. 판정과 적용은 규칙 엔진(sim/canon.js)이 한다.
import { G } from "../../core/store.js";
import { OUTLETS } from "../../data/world.js";
import { cd, cname, cfull, actor } from "../../sim/world.js";
import { S } from "../api.js";
import { WORLD_RULES_TEXT } from "../world-rules.js";
import { TASK_LIMITS } from "./limits.js";

const ATTRS = ["rep", "power", "stab", "appr", "econ", "tens", "attn", "progress", "heat", "outcome", "cred"];
export const DECREE_SCHEMA = S.obj({
  belief: S.str("세상이 믿게 되는 내용을 평서문 한 문장으로"),
  valid: S.bool(),
  scope: S.en(["local", "country", "region", "world"]),
  effects: S.arr(S.obj({ target: S.str("대상 목록의 ID"), attr: S.en(ATTRS), dir: S.en(["up", "down"]), mag: S.int([1, 2, 3, 4, 5]) })),
  reaction: S.str("세상이 이 '사실' 위에서 움직이는 모습 2문장. 뉴스 문체"),
});

export function decreeTargets(ev) {
  const list = [];
  const push = (id, kind, name, desc) => list.push({ id, kind, name, desc });
  const add = new Set();
  const addActor = (a) => {
    if (!a || add.has(a.id)) return;
    add.add(a.id);
    push(a.id, "actor", a.name, `${a.role}${a.country ? ` · ${cname(a.country)}` : ""}. 속성: rep(평판 ${Math.round(a.rep)}), power(영향력 ${Math.round(a.power)})`);
  };
  const addCountry = (id) => {
    if (!id || add.has("c" + id) || !cd(id)) return;
    add.add("c" + id);
    const d = cd(id);
    push(`country:${id}`, "country", cfull(id), `속성: stab(정치 안정 ${Math.round(d.stab)}), appr(정부 지지 ${Math.round(d.appr)}), econ(경기 ${Math.round(d.econ)}), tens(대외 긴장 ${Math.round(d.tens)}), attn(세계의 관심 ${Math.round(d.attn)})`);
  };
  const addAgenda = (ag) => {
    if (!ag || ag.resolved || add.has(ag.id)) return;
    add.add(ag.id);
    push(`agenda:${ag.id}`, "agenda", ag.title, `의제${ag.country ? ` · ${cname(ag.country)}` : " · 세계"}. 속성: progress(현재 ${Math.round(ag.progress)}; up이면 '${ag.poles[0]}' 쪽, down이면 '${ag.poles[1]}' 쪽)`);
  };
  if (ev) {
    push(`event:${ev.id}`, "event", ev.title, `지금 쓰는 기사의 사건. 속성: heat(세간의 관심), outcome(up이면 책임 규명·약자에게 유리한 결말, down이면 무마·힘 있는 쪽에 유리한 결말)`);
    if (ev.localOnly) return list;
    addActor(ev.actor && actor(ev.actor));
    addCountry(ev.country);
    addAgenda(ev.agenda && G.world.agendas[ev.agenda]);
    for (const a of Object.values(G.world.actors)) if (a.country === ev.country) addActor(a);
    for (const ag of Object.values(G.world.agendas)) if (ag.country === ev.country) addAgenda(ag);
  }
  addCountry(G.player.loc);
  addCountry("410");
  for (const a of Object.values(G.world.actors)) if (!a.gen && a.power >= 70) addActor(a);
  for (const ag of Object.values(G.world.agendas)) if (!ag.country) addAgenda(ag);
  push("outlet:player", "outlet", G.meta.outlet, `당신(기자)의 매체. 속성: cred(신뢰도 ${Math.round(G.outlet.cred)})`);
  for (const [id, o] of Object.entries(OUTLETS)) if (id !== "player") push(`outlet:${id}`, "outlet", o.name, `경쟁 매체. 속성: cred(신뢰도 ${Math.round(G.rivals[id].cred)})`);
  return list.slice(0, 44);
}

export function decreeRequest({ sentence, ev, headline, targets }) {
  const system = `당신은 게임 「기정사실」의 규칙 해석기다. 이 게임에서 기자가 기사 속 한 문장에 '기정(記定) 도장'을 찍으면, 그 문장은 진실 여부와 무관하게 세상 모두가 원래부터 알던 상식이 된다. 당신의 일은 그 문장이 세계 상태에 주는 효과를 수치 변화로 번역하는 것이다. 문장의 도덕성이나 사실 여부를 따지지 않고, 게임 규칙에 따라 담담히 해석한다.
${WORLD_RULES_TEXT}

해석 규칙:
- belief: 문장을 세상이 믿게 되는 '상식' 한 문장으로 다듬는다. 뜻을 바꾸지 않는다.
- valid: 문장이 세계에 대한 구체적인 주장(누가/무엇이 어떠하다)이면 true. 질문, 명령, 감탄, 뜻 없는 말, 대상을 알 수 없는 말은 false.
- scope: 이 믿음이 닿는 범위. local(한 사건·한 동네·한 조직 안의 일), country(한 나라의 정치·경제·여론이 달라지는 일), region(여러 나라에 걸친 일), world(세계 질서나 세계적 행위자의 일).
- effects: 1~3개. target은 반드시 아래 [대상 목록]의 ID를 그대로 쓴다. attr은 그 대상에 표시된 속성 중에서만 고른다. dir은 수치가 오르면 up, 내리면 down.
- mag(세기): 1 분위기가 살짝 달라짐 / 2 눈에 띄는 변화 / 3 뚜렷한 전환(계획 재검토, 사임 의사, 주가 급변) / 4 큰 사건(사퇴, 법안 통과·폐기, 합의 타결) / 5 판 전체가 뒤집힘(정권 교체, 전쟁·종전, 시장 붕괴).
- 문장이 말하지 않은 효과를 덧붙이지 않는다. 가장 직접적인 효과부터.
- reaction: 세상 사람들이 이 '상식' 위에서 자연스럽게 움직이는 모습을 뉴스 문체 두 문장으로. 아무도 이 사실을 새삼스러워하지 않는다.`;
  const content = `[도장이 찍힌 문장]
"${sentence}"

[이 문장이 실린 기사]
제목: ${headline || "(제목 없음)"}${ev ? `\n다루는 사건: ${ev.title} — ${ev.summary}` : ""}

[대상 목록]
${targets.map((t) => `- ${t.id} | ${t.name} | ${t.desc}`).join("\n")}`;
  return { task: "decree", system, messages: [{ role: "user", content }], schema: DECREE_SCHEMA, maxTokens: TASK_LIMITS.decree, thinking: true, timeoutMs: 60000 };
}
