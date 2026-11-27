// 명시적으로 허용한 실제 API 검사다. 일반 자동 시험에서는 실행하지 않는다.
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CheckFailure, requireCheck, liveCases } from "./llm-live-cases.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
let model = "미확인", stats, failure;

async function unusedPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, "exit");
  child.kill("SIGTERM");
  let timer;
  try { await Promise.race([closed, new Promise((resolve) => { timer = setTimeout(resolve, 2000); })]); }
  finally { clearTimeout(timer); }
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await closed; }
}

async function run() {
  requireCheck(process.env.RUN_LIVE_LLM === "1", "실제 호출을 허용하려면 RUN_LIVE_LLM=1을 설정해야 합니다.");
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  requireCheck(Boolean(key), "ANTHROPIC_API_KEY가 없습니다. GitHub 시크릿을 등록해야 합니다.");
  const endpoint = new URL(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com");
  requireCheck(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash, "API 주소에는 인증 정보나 질의 문자열을 넣을 수 없습니다.");
  requireCheck(endpoint.protocol === "https:" || (endpoint.protocol === "http:" && endpoint.hostname === "127.0.0.1"), "API 주소는 HTTPS를 사용해야 합니다. 로컬 시험 서버만 HTTP를 허용합니다.");

  const port = await unusedPort();
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "gijeong-llm-test-"));
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 240000);
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  let child, spawnError;
  const base = `http://127.0.0.1:${port}`;
  const request = (url, timeout, options = {}) => fetch(base + url, { ...options, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]) });
  try {
    const env = Object.fromEntries(["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "HOME"].filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
    child = spawn(process.execPath, ["server/index.js"], {
      cwd: ROOT, windowsHide: true,
      env: { ...env, PORT: String(port), ANTHROPIC_API_KEY: key, ANTHROPIC_AUTH_TOKEN: "", ANTHROPIC_BASE_URL: endpoint.href, ACCESS_CODE: "", USAGE_FILE: path.join(temp, "usage.json") },
      // 서버나 SDK의 오류 본문에는 민감한 값이 포함될 수 있어 그대로 출력하지 않는다.
      stdio: "ignore",
    });
    child.on("error", () => { spawnError = true; });
    let health;
    for (let i = 0; i < 50; i++) {
      requireCheck(!spawnError && child.exitCode === null && !controller.signal.aborted, "검사 서버가 시작되지 않았거나 중단됐습니다.");
      try {
        const response = await request("/api/health", 500);
        if (response.ok) { health = await response.json(); break; }
      } catch { /* 아직 준비되지 않은 서버는 다시 확인한다. 모델 요청은 재시도하지 않는다. */ }
      await pause(100);
    }
    requireCheck(health?.ok && health.llm === true && health.stats?.calls === 0, "API가 활성화된 새 검사 서버를 확인하지 못했습니다.");
    requireCheck(typeof health.model === "string" && /^[a-zA-Z0-9._:-]{1,80}$/u.test(health.model), "서버의 모델 이름을 확인하지 못했습니다.");
    model = health.model;

    for (const entry of liveCases()) {
      const row = { name: entry.name, ok: false, ms: 0 };
      results.push(row);
      const start = performance.now();
      try {
        const { timeoutMs, ...body } = entry.request;
        const response = await request("/api/llm", timeoutMs, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        requireCheck(response.ok, `API 요청이 실패했습니다. HTTP 상태: ${response.status}`);
        let reply;
        try { reply = await response.json(); } catch { throw new CheckFailure("서버의 응답이 JSON이 아닙니다."); }
        requireCheck(reply?.ok === true, "모델 응답이 거부됐거나 구조화 출력에 실패했습니다.");
        requireCheck(reply.stop === "end_turn", "모델이 정상적으로 답변을 마치지 않았습니다.");
        entry.validate(reply.data);
        row.ok = true;
      } finally { row.ms = Math.round(performance.now() - start); }
      console.log(`${row.name}: 통과 (${row.ms}ms)`);
    }
    const response = await request("/api/health", 3000);
    requireCheck(response.ok, "최종 호출 통계를 읽지 못했습니다.");
    stats = (await response.json()).stats;
    requireCheck(stats?.calls === 3 && stats.errors === 0 && stats.byTask?.npc?.calls === 2 && stats.byTask?.judge?.calls === 1, "실제 서버의 작업별 호출 통계가 검사 요청과 다릅니다.");
    requireCheck([stats.inputTokens, stats.outputTokens].every((value) => Number.isSafeInteger(value) && value > 0), "모델의 토큰 사용량을 확인하지 못했습니다.");
    console.log(`검사 완료: 요청 3개, 입력 ${stats.inputTokens}토큰, 출력 ${stats.outputTokens}토큰`);
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    await stop(child);
    const resolved = path.resolve(temp);
    requireCheck(path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("gijeong-llm-test-"), "검사 임시 경로가 아닙니다.");
    await fs.rm(resolved, { recursive: true, force: true });
  }
}

try {
  await run();
} catch (error) {
  // 외부 오류의 메시지·본문·스택은 출력하지 않는다.
  failure = error instanceof CheckFailure ? error.message : error?.name === "TimeoutError" || error?.name === "AbortError" ? "검사 시간이 초과됐거나 실행이 중단됐습니다." : "검사 도구 실행에 실패했습니다.";
  console.error(`실제 LLM 검사 실패: ${failure}`);
  process.exitCode = 1;
} finally {
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ["## 실제 LLM 검사", "", `결과: ${failure ? "실패" : "통과"}`, `모델: ${model}`, "", "| 검사 | 결과 | 지연 |", "|---|---|---|"];
    for (const row of results) lines.push(`| ${row.name} | ${row.ok ? "통과" : "실패"} | ${row.ms}ms |`);
    if (failure) lines.push("", failure);
    if (!failure) lines.push("", `논리 요청: 3개 · 입력: ${stats.inputTokens}토큰 · 출력: ${stats.outputTokens}토큰`);
    lines.push("", "서버 SDK는 요청당 최대 두 번 재시도할 수 있습니다. 별도의 품질 재시도나 규칙 응답은 사용하지 않습니다.", "증언 번호·응답 형식을 검사한 결과이며 대사의 자연스러움이나 모든 표현의 비밀 누설 방지를 보장하지 않습니다.", "");
    try { await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n")); }
    catch { console.error("검사 요약 저장 실패"); process.exitCode = 1; }
  }
}
