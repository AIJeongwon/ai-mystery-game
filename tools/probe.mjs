// LLM 프록시 동작 확인용 개발 도구:  node tools/probe.mjs
const BASE = process.env.BASE || "http://127.0.0.1:5173";

async function call(body) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/llm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  return { status: r.status, wall: Date.now() - t0, ...j };
}

const health = await (await fetch(`${BASE}/api/health`)).json();
console.log("health:", { llm: health.llm, model: health.model, effort: health.effort });

// 1) NPC 대사 (사고 끔, 구조화 출력, speech가 첫 필드)
const npc = await call({
  task: "npc",
  system:
    "당신은 서울 을지로에서 40년째 인쇄소를 하는 60대 여성 '권미옥'이다. 말투는 투박하지만 정이 많다. 한국어로 1~3문장만 말한다.",
  messages: [{ role: "user", content: "기자입니다. 재개발 퇴거 통보를 받으셨다고 들었습니다." }],
  schema: {
    type: "object",
    properties: {
      speech: { type: "string" },
      revealed: { type: "array", items: { type: "string" } },
      trust_delta: { type: "integer", enum: [-2, -1, 0, 1, 2] },
      end: { type: "boolean" },
    },
    required: ["speech", "revealed", "trust_delta", "end"],
    additionalProperties: false,
  },
  maxTokens: 600,
  thinking: false,
});
console.log("npc:", JSON.stringify(npc, null, 1));

// 2) 생성 작업 (adaptive thinking)
const gen = await call({
  task: "director",
  system: "당신은 뉴스 시뮬레이션 게임의 세계 연출가다. 모든 인물과 단체는 허구로 만든다. 한국어로 쓴다.",
  messages: [
    {
      role: "user",
      content:
        "케냐 나이로비에서 '수도 요금 인상 반대 시위' 사건을 만들어라. 사실 4개(깊이 0~3)와 취재원 2명.",
    },
  ],
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      facts: {
        type: "array",
        items: {
          type: "object",
          properties: { text: { type: "string" }, depth: { type: "integer", enum: [0, 1, 2, 3] } },
          required: ["text", "depth"],
          additionalProperties: false,
        },
      },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, role: { type: "string" }, secret: { type: "string" } },
          required: ["name", "role", "secret"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "summary", "facts", "sources"],
    additionalProperties: false,
  },
  maxTokens: 4000,
  thinking: true,
});
console.log("director:", JSON.stringify(gen, null, 1));

const h2 = await (await fetch(`${BASE}/api/health`)).json();
console.log("stats:", h2.stats);
