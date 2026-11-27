// 실제 키 대신 로컬 API 대역을 사용해 검사 도구의 성공·실패 처리를 확인한다.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "llm-test-only-secret";
const SECRET_RESPONSE = "비공개-응답-검사표식";
const env = () => Object.fromEntries(["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "HOME"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));

function message(index) {
  if (index === 0) return { speech: "안경은 제가 직접 검사했어요. 회로는 없었어요.", revealed: ["b1"], trust_delta: 0, end: false };
  if (index === 1) return { speech: "시험 날 아침에는 24번이 창 쪽으로 한 칸 붙어 있었어요.", revealed: ["b3"], trust_delta: 1, end: false };
  return { comment: "사실과 일치합니다. 문장 구성은 더 다듬어 주세요.", accuracy: 9, writing: 3, headline: 8, sensational: 1, used: ["check-f1"], false_claims: [], unsupported: 0, on_topic: true };
}

async function exercise({ alter, authError = false, noKey = false, noOptIn = false, stall = false } = {}) {
  const calls = [];
  const api = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    calls.push({ url: req.url, authenticated: req.headers.authorization === `Bearer ${KEY}`, body });
    res.setHeader("content-type", "application/json");
    if (authError) {
      res.writeHead(401);
      return res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: `${KEY} ${SECRET_RESPONSE}` } }));
    }
    if (stall) return;
    const response = {
      id: "msg_llm_test", type: "message", role: "assistant", model: body.model,
      content: [{ type: "text", text: JSON.stringify(message(calls.length - 1)) }],
      stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 30 },
    };
    alter?.(response, calls.length - 1);
    res.end(JSON.stringify(response));
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "gijeong-llm-harness-"));
  const summaryPath = path.join(temp, "summary.md");
  let child;
  try {
    child = spawn(process.execPath, ["tools/llm-live.mjs"], {
      cwd: ROOT, windowsHide: true,
      env: { ...env(), RUN_LIVE_LLM: noOptIn ? "" : "1", ANTHROPIC_API_KEY: noKey ? "" : KEY, ANTHROPIC_BASE_URL: `http://127.0.0.1:${api.address().port}`, GITHUB_STEP_SUMMARY: summaryPath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => { output += data; });
    const timer = setTimeout(() => child.kill("SIGKILL"), stall ? 60000 : 15000);
    let code;
    try { [code] = await once(child, "exit"); } finally { clearTimeout(timer); }
    const summary = await fs.readFile(summaryPath, "utf8");
    for (const text of [output, summary]) {
      assert.equal(text.includes(KEY), false, "검사 결과에 키가 노출됐다");
      assert.equal(text.includes(SECRET_RESPONSE), false, "검사 결과에 외부 응답 본문이 노출됐다");
    }
    return { code, output, summary, calls };
  } finally {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "exit");
      child.kill("SIGKILL");
      await closed;
    }
    api.closeAllConnections();
    await new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
    const resolved = path.resolve(temp);
    assert.ok(path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("gijeong-llm-harness-"));
    await fs.rm(resolved, { recursive: true, force: true });
  }
}

test("실제 LLM 검사 도구는 키 없는 API 대역으로 검증한다", { timeout: 120000 }, async (t) => {
  await t.test("실제 서버를 거쳐 세 요청을 보내고 형식·증언·기사 판정을 검사한다", async () => {
    const result = await exercise();
    assert.equal(result.code, 0, result.output);
    assert.equal(result.calls.length, 3);
    assert.ok(result.calls.every((call) => call.url === "/v1/messages" && call.authenticated));
    assert.equal(result.calls[0].body.thinking.type, "disabled");
    assert.equal(result.calls[2].body.thinking.type, "adaptive");
    assert.equal(result.calls[2].body.output_config.format.type, "json_schema");
    assert.ok(!result.calls[0].body.system.includes("[b3]"));
    assert.ok(result.calls[1].body.system.includes("[b3]"));
    assert.match(result.summary, /요청: 3개 · 입력: 300토큰 · 출력: 90토큰/u);
  });

  for (const [name, options] of [["명시적 호출 허용이 없으면 외부 요청 전에 실패한다", { noOptIn: true }], ["키가 없으면 건너뛰거나 성공 처리하지 않는다", { noKey: true }]]) {
    await t.test(name, async () => {
      const result = await exercise(options);
      assert.equal(result.code, 1);
      assert.equal(result.calls.length, 0);
      assert.match(result.summary, /결과: 실패/u);
    });
  }

  await t.test("인증 오류는 실패하며 외부 오류 본문을 출력하지 않는다", async () => {
    const result = await exercise({ authError: true });
    assert.equal(result.code, 1);
    assert.equal(result.calls.length, 1);
    assert.match(result.output, /HTTP 상태: 401/u);
  });

  const failures = [
    ["깨진 JSON 응답", 0, (response) => { response.content[0].text = SECRET_RESPONSE; }],
    ["형식이 잘못된 NPC 응답", 0, (response) => { response.content[0].text = JSON.stringify({ speech: SECRET_RESPONSE }); }],
    ["비공개 증언 번호", 0, (response) => { response.content[0].text = JSON.stringify({ ...message(0), speech: SECRET_RESPONSE, revealed: ["b3"] }); }],
    ["근거 제시 후 필요한 증언 누락", 1, (response) => { response.content[0].text = JSON.stringify(message(0)); }],
    ["잘못된 기사 점수", 2, (response) => { response.content[0].text = JSON.stringify({ ...message(2), accuracy: 100 }); }],
    ["출력 상한으로 중단된 답변", 0, (response) => { response.stop_reason = "max_tokens"; }],
    ["모델의 응답 거부", 0, (response) => { response.stop_reason = "refusal"; }],
  ];
  for (const [name, at, alter] of failures) {
    await t.test(`${name}: 규칙 응답으로 숨기지 않고 실패한다`, async () => {
      const result = await exercise({ alter: (response, index) => { if (index === at) alter(response); } });
      assert.equal(result.code, 1, result.output);
      assert.equal(result.calls.length, at + 1);
      assert.match(result.summary, /결과: 실패/u);
    });
  }
  await t.test("시간 초과도 실패로 기록하고 검사 서버를 종료한다", async () => {
    const result = await exercise({ stall: true });
    assert.equal(result.code, 1, result.output);
    assert.equal(result.calls.length, 1);
    assert.match(result.output, /검사 시간이 초과됐거나 실행이 중단됐습니다/u);
    assert.match(result.summary, /결과: 실패/u);
  });
});
