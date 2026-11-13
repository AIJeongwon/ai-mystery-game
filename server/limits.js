// 바깥 접속자의 한도 집계 — 하루 예산(금액), 사람별 하루 호출 수, 사람별 분당 호출 수
// 지금은 메모리에 세고 하루 합계만 파일(usage.json)에 남긴다.
// 집계를 다른 저장소(예: 캐시 서버)로 옮길 때는 이 파일의 네 함수만 다시 짜면 된다. 그래서 모두 비동기로 열어 둔다.
import fs from "node:fs";
import fsp from "node:fs/promises";
import { LIMITS, PRICE, USAGE_FILE } from "./config.js";

const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD (PC 현지 날짜)
let usage = { day: today(), usd: 0, calls: 0, clients: 0 };
try {
  const saved = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
  if (saved.day === today()) usage = { ...usage, ...saved };
} catch { /* 첫 실행 */ }
const perClient = new Map(); // ip → { calls, recent: [ms] }
let saveTimer = null;

function rollDay() {
  if (usage.day !== today()) {
    usage = { day: today(), usd: 0, calls: 0, clients: 0 };
    perClient.clear();
  }
}
function persistUsage() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fsp.writeFile(USAGE_FILE, JSON.stringify(usage)).catch(() => {}), 1500);
}
const overBudget = () => usage.usd >= LIMITS.dailyBudgetUsd;

// 호출 한 번의 자리를 잡는다. 막히면 그 까닭("budget" | "quota" | "rate_limit"), 통과하면 null.
export async function takeSlot(ip) {
  rollDay();
  if (overBudget()) return "budget";
  let c = perClient.get(ip);
  if (!c) {
    c = { calls: 0, recent: [] };
    perClient.set(ip, c);
    usage.clients = perClient.size;
  }
  if (c.calls >= LIMITS.perClientDaily) return "quota";
  const now = Date.now();
  c.recent = c.recent.filter((t) => now - t < 60_000);
  if (c.recent.length >= LIMITS.perClientMinute) return "rate_limit";
  c.recent.push(now);
  c.calls++;
  return null;
}

// 호출이 끝난 뒤 쓴 토큰을 금액으로 바꿔 더한다. u는 Claude 응답의 usage.
export async function recordUsage(u) {
  usage.calls++;
  usage.usd += ((u.input_tokens || 0) * PRICE.input + (u.cache_read_input_tokens || 0) * PRICE.cacheRead + (u.cache_creation_input_tokens || 0) * PRICE.cacheWrite + (u.output_tokens || 0) * PRICE.output) / 1e6;
  persistUsage();
}

// 그 접속자가 지금 한도에 걸려 있는지 (상태 확인용. 자리를 잡지는 않는다)
export async function clientState(ip) {
  rollDay();
  const c = perClient.get(ip);
  return { budget: overBudget(), quota: Boolean(c && c.calls >= LIMITS.perClientDaily) };
}

// 오늘의 합계 (내 PC에서 보는 상태 확인용)
export async function usageSnapshot() {
  rollDay();
  return { ...usage, usd: +usage.usd.toFixed(4) };
}
