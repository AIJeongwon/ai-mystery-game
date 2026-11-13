// 기정사실(記定事實) — 게임 서버 (진입점)
// 역할: (1) 정적 파일 제공  (2) Claude API 중계 (API 키는 서버에만 존재)
// LLM은 Claude Haiku 5.5 / effort low 하나만 사용한다.
//
// 공유(터널) 접속 보호:
//   서버는 언제나 127.0.0.1에만 묶인다. 바깥에서 오는 요청은 터널(cloudflared)을 거쳐 들어오며,
//   그때는 전달 헤더(cf-connecting-ip 등)가 붙는다. 그런 '원격' 요청은 접속 코드가 맞아야만 LLM을 쓸 수 있고,
//   사람별 분당·일일 호출 수와 하루 전체 비용에 한도가 걸린다. 코드가 없거나 한도를 넘으면 게임은 규칙 모드로 돌아간다.
//
// 파일:
//   config.js   경로, .env, 모델, 한도 값
//   tasks.js    바깥 접속자가 쓸 수 있는 LLM 작업과 출력 상한
//   static.js   정적 파일 (public/, /vendor/*)
//   access.js   내 PC와 바깥 접속의 구분, 접속 코드
//   limits.js   하루 예산과 사람별 호출 수 집계
//   llm.js      /api/llm
//   health.js   /api/health
//   http.js     JSON 응답, 요청 본문
import http from "node:http";
import { PORT, HOST, MODEL, EFFORT, LIMITS } from "./config.js";
import { send } from "./http.js";
import { serveStatic } from "./static.js";
import { codeSet } from "./access.js";
import { client, handleLLM } from "./llm.js";
import { handleHealth } from "./health.js";

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const p = decodeURIComponent(url.pathname);
    if (p === "/api/health" && req.method === "GET") return await handleHealth(req, res);
    if (p === "/api/llm" && req.method === "POST") return await handleLLM(req, res);
    if (p.startsWith("/api/")) return send(res, 404, { error: "not found" });
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method not allowed" });
    return await serveStatic(req, res, p === "/favicon.ico" ? "/assets/ui/favicon.svg" : p);
  } catch (e) {
    console.error("[server]", e?.message);
    if (!res.headersSent) send(res, 500, { error: "internal" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  기정사실(記定事實)  →  http://localhost:${PORT}`);
  console.log(`  LLM: ${client ? `${MODEL} (effort ${EFFORT})` : "키 없음 — 오프라인 규칙 모드"}`);
  console.log(`  공유 접속: ${codeSet ? `접속 코드 설정됨 · 하루 $${LIMITS.dailyBudgetUsd} · 1인 하루 ${LIMITS.perClientDaily}회` : "접속 코드 없음 — 바깥 접속자는 LLM을 쓸 수 없음"}\n`);
});
