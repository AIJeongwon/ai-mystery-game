// 상태 조회와 실제 인증 시도를 구분한다. 유료 API는 부르지 않는다.
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
process.env.ACCESS_CODE = "test-access-fixture";
process.env.ANTHROPIC_API_KEY = "";
process.env.ANTHROPIC_AUTH_TOKEN = "";
process.env.USAGE_FILE = path.join(os.tmpdir(), `gijeong-access-test-${process.pid}.json`);
const { checkCode } = await import("../server/access.js");
const { handleHealth } = await import("../server/health.js");
const req = (code, ip) => ({ headers: { "x-access-code": code, "x-forwarded-for": ip } });
async function health(code, ip) {
  let body;
  await handleHealth(req(code, ip), { writeHead() {}, end(data) { body = JSON.parse(data); } });
  return body;
}

test("틀린 코드로 상태를 반복 조회해도 잠금 횟수가 늘지 않는다", async () => {
  const ip = "health-only";
  for (let i = 0; i < 20; i++) assert.equal((await health("wrong", ip)).reason, "bad_code");
  assert.equal((await health("test-access-fixture", ip)).reason, null);
  assert.equal(checkCode(req("test-access-fixture", ip), ip).ok, true);
});

test("상태 조회는 기존 실패를 지우지 않고 실제 오류 8회는 15분 잠근다", async (t) => {
  const ip = "real-attempts", start = Date.now();
  t.mock.method(Date, "now", () => start);
  for (let i = 0; i < 7; i++) assert.equal(checkCode(req("wrong", ip), ip).reason, "bad_code");
  assert.equal((await health("test-access-fixture", ip)).reason, null);
  assert.equal(checkCode(req("wrong", ip), ip).reason, "bad_code");
  assert.equal((await health("test-access-fixture", ip)).reason, "locked");
  assert.equal(checkCode(req("test-access-fixture", ip), ip).reason, "locked");
  Date.now.mock.mockImplementation(() => start + 15 * 60_000 + 1);
  assert.equal(checkCode(req("test-access-fixture", ip), ip).ok, true);
});

test("코드가 없으면 상태 조회와 실제 시도 모두 코드를 요구한다", async () => {
  assert.equal((await health("", "no-code")).reason, "need_code");
  assert.equal(checkCode(req("", "no-code"), "no-code").reason, "need_code");
});

test("자동 조회를 허용해도 다른 코드의 반복 대입은 제한한다", async (t) => {
  const ip = "code-guessing", start = Date.now();
  t.mock.method(Date, "now", () => start);
  for (let i = 0; i < 8; i++) assert.equal((await health(`wrong-${i}`, ip)).reason, "bad_code");
  assert.equal((await health("another-code", ip)).reason, "rate_limit");
  assert.equal((await health("wrong-0", ip)).reason, "bad_code");
  Date.now.mock.mockImplementation(() => start + 15 * 60_000 + 1);
  assert.equal((await health("test-access-fixture", ip)).reason, null);
});
