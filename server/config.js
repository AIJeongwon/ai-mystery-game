// 서버 설정 — 경로, .env, 모델, 한도. 값을 바꾸는 곳은 여기 하나다.
import path from "node:path";
import { fileURLToPath } from "node:url";

export { TASK_CAPS } from "./tasks.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const NM = path.join(ROOT, "node_modules");
export const USAGE_FILE = process.env.USAGE_FILE || path.join(ROOT, "server", "usage.json");

try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* .env가 없으면 오프라인(규칙 기반) 모드로 동작 */
}

export const PORT = Number(process.env.PORT) || 5173;
export const HOST = "127.0.0.1";

// LLM은 Claude Haiku 5.5 / effort low 하나만 쓴다. 요청으로는 바꿀 수 없다.
export const MODEL = "claude-haiku-5-5";
export const EFFORT = "low";
export const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
// 동시 요청 제한 (요금제 한도 보호)
export const MAX_CONCURRENT = 8;

// ── 공유 한도 (.env로 조정) ──
export const ACCESS_CODE = (process.env.ACCESS_CODE || "").trim();
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
export const LIMITS = {
  dailyBudgetUsd: num(process.env.DAILY_BUDGET_USD, 2), // 원격 접속자 전체가 하루에 쓸 수 있는 금액
  perClientDaily: num(process.env.PER_CLIENT_DAILY_CALLS, 1500), // 한 사람(IP)의 하루 호출 수
  perClientMinute: num(process.env.PER_CLIENT_PER_MINUTE, 45), // 한 사람(IP)의 분당 호출 수
};
// Haiku 5.5 요금 (100K 토큰 이하 프롬프트, 100만 토큰당 달러)
export const PRICE = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };
