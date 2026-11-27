// 실제 서버를 키 없이 실행해 HTTP 경로와 비공개 파일 보호를 확인한다.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CODE = "http-test-fixture";
let child, base, temp, log = "", spawnError;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const remote = (ip, code) => ({ "x-forwarded-for": ip, ...(code ? { "x-access-code": code } : {}) });
const request = (url, options = {}) => fetch(base + url, { ...options, signal: AbortSignal.timeout(3000) });

async function unusedPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

before(async () => {
  const port = await unusedPort();
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "gijeong-http-test-"));
  base = `http://127.0.0.1:${port}`;
  const env = Object.fromEntries(["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "HOME"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT, windowsHide: true,
    env: { ...env, PORT: String(port), ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", ACCESS_CODE: CODE, USAGE_FILE: path.join(temp, "usage.json") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.on("error", (error) => { spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { log = (log + chunk).slice(-4000); });
  for (let i = 0; i < 100; i++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw Error(`시험 서버가 종료됐습니다: ${log}`);
    let response;
    try { response = await request("/api/health"); } catch { await pause(100); continue; }
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.llm, false, "실제 API가 켜진 서버에서는 HTTP 시험을 진행하지 않는다");
    return;
  }
  throw Error(`시험 서버가 응답하지 않습니다: ${log}`);
}, { timeout: 20000 });

after(async () => {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const closed = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await Promise.race([closed, pause(2000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await closed; }
  }
  if (temp) {
    const resolved = path.resolve(temp);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("gijeong-http-test-")) throw Error("시험 임시 경로가 아닙니다");
    await fs.rm(resolved, { recursive: true, force: true });
  }
});

test("로컬 상태 응답은 키 없는 규칙 모드를 표시한다", async () => {
  const response = await request("/api/health");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.llm, false);
  assert.equal(data.stats.calls, 0);
  assert.ok(data.share);
  assert.equal(JSON.stringify(data).includes(CODE), false);
});

test("원격 상태 응답은 코드를 요구하고 운영 통계를 노출하지 않는다", async () => {
  const data = await (await request("/api/health", { headers: remote("192.0.2.10") })).json();
  assert.equal(data.reason, "need_code");
  assert.equal(data.needCode, true);
  assert.equal(Object.hasOwn(data, "stats"), false);
  assert.equal(Object.hasOwn(data, "share"), false);
});

test("같은 틀린 코드의 자동 조회는 잠기지 않고 올바른 코드로 바꿀 수 있다", async () => {
  for (let i = 0; i < 10; i++) {
    const data = await (await request("/api/health", { headers: remote("192.0.2.11", "wrong") })).json();
    assert.equal(data.reason, "bad_code");
  }
  const data = await (await request("/api/health", { headers: remote("192.0.2.11", CODE) })).json();
  assert.equal(data.reason, null);
  assert.equal(data.llm, false);
});

test("키가 없으면 LLM 요청을 외부로 보내지 않고 거부한다", async () => {
  const response = await request("/api/llm", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "no_api_key");
});

test("시작 페이지와 정적 파일을 올바른 형식으로 제공한다", async () => {
  for (const [url, mime] of [["/", "text/html"], ["/js/main.js", "javascript"], ["/css/main.css", "text/css"], ["/favicon.ico", "image/svg+xml"]]) {
    const response = await request(url);
    assert.equal(response.status, 200, url);
    assert.ok(response.headers.get("content-type").includes(mime), url);
    assert.ok((await response.text()).length > 0, url);
  }
});

test("게임에서 사용하는 지도 라이브러리와 지형 자료가 내려온다", async () => {
  const library = await request("/vendor/d3.min.js");
  assert.equal(library.status, 200);
  assert.ok((await library.text()).length > 0);
  const topology = await (await request("/vendor/world-50m.json")).json();
  assert.equal(topology.type, "Topology");
  assert.ok(topology.objects.countries);
});

test("비공개 파일을 공개 경로로 제공하지 않는다", async () => {
  for (const url of ["/.env", "/package.json", "/package-lock.json", "/server/config.js", "/.git/config", "/docs/game-design.md"]) {
    const response = await request(url);
    assert.equal(response.status, 404, url);
    assert.equal((await response.text()).includes(CODE), false, url);
  }
});

test("상위 경로 접근은 파일을 읽기 전에 차단한다", async () => {
  const response = await request("/..%2fserver%2fconfig.js");
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "forbidden");
});

test("HEAD 요청에는 본문을 넣지 않고 허용하지 않은 메서드는 거부한다", async () => {
  const head = await request("/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const post = await request("/js/main.js", { method: "POST" });
  assert.equal(post.status, 405);
});

test("알 수 없는 API 경로는 404로 응답한다", async () => {
  assert.equal((await request("/api/unknown")).status, 404);
});
