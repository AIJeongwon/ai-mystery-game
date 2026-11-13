// 공유 보호 장치 점검:  node tools/share-check.mjs
// 시험용 서버를 따로 띄우고(포트 5191, 시험용 접속 코드), 터널을 거친 요청처럼 전달 헤더를 붙여 확인한다.
// 실제 API를 열 번쯤 짧게 호출한다(몇 원 수준). 사용량 기록은 시험마다 임시 폴더의 새 파일에 쓴다.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5191;
const BASE = `http://127.0.0.1:${PORT}`;
const CODE = "TESTCODE42";
const results = [];
let phase = 0;
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "✔" : "✖"} ${name}${extra ? `  (${extra})` : ""}`);
};
const start = (env) =>
  new Promise((resolve) => {
    const usageFile = path.join(os.tmpdir(), `gijeong-usage-${process.pid}-${++phase}.json`);
    const p = spawn(process.execPath, ["server/index.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), ACCESS_CODE: CODE, USAGE_FILE: usageFile, ...env }, stdio: "ignore" });
    const t = setInterval(async () => {
      try {
        await fetch(`${BASE}/api/health`);
        clearInterval(t);
        resolve(p);
      } catch { /* 아직 */ }
    }, 150);
  });
const stop = (p) => new Promise((r) => {
  p.on("exit", r);
  p.kill();
});
const remote = (ip, code) => ({ "x-forwarded-for": ip, "cf-connecting-ip": ip, ...(code ? { "x-access-code": code } : {}) });
const health = async (h = {}) => (await fetch(`${BASE}/api/health`, { headers: h })).json();
const NPC = {
  task: "npc", thinking: false, maxTokens: 200,
  system: "한국어로 한 문장만 답한다.",
  messages: [{ role: "user", content: "안녕하세요?" }],
  schema: { type: "object", properties: { speech: { type: "string" } }, required: ["speech"], additionalProperties: false },
};
const llm = async (h, body = NPC) => {
  const r = await fetch(`${BASE}/api/llm`, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
};

// ── 1) 코드와 작업 제한 ──
let srv = await start({});
const hLocal = await health();
check("내 PC(로컬) 접속은 코드 없이 LLM 사용", hLocal.llm === true && hLocal.share?.codeSet === true);
const h0 = await health(remote("203.0.113.5"));
check("바깥 접속 + 코드 없음 → 코드 요구, LLM 꺼짐", h0.remote === true && h0.needCode === true && h0.llm === false && !("stats" in h0) && !("share" in h0));
const r0 = await llm(remote("203.0.113.5"));
check("바깥 접속 + 코드 없음 → LLM 호출 거절", r0.status === 401 && r0.error === "need_code");
const r1 = await llm(remote("203.0.113.5", "WRONG"));
check("틀린 코드 → 거절", r1.status === 401 && r1.error === "bad_code");
const h1 = await health(remote("203.0.113.6", CODE));
check("맞는 코드 → LLM 사용 가능", h1.llm === true && h1.needCode === false);
const r2 = await llm(remote("203.0.113.6", CODE));
check("맞는 코드 → 실제 응답", r2.status === 200 && r2.ok === true && typeof r2.data?.speech === "string", r2.data?.speech?.slice(0, 24) ?? r2.error);
const r3 = await llm(remote("203.0.113.6", CODE), { ...NPC, task: "generic" });
check("허용되지 않은 작업 이름 → 거절", r3.status === 400);
const r4 = await llm(remote("203.0.113.6", CODE), { ...NPC, schema: undefined });
check("스키마 없는 자유 요청 → 거절", r4.status === 400);
const r5 = await llm(remote("203.0.113.6", CODE), { ...NPC, maxTokens: 16000 });
check("출력 상한은 서버가 깎는다 (요청 16000 → 작업 상한)", r5.status === 200);
for (let i = 0; i < 8; i++) await llm(remote("203.0.113.9", `BAD${i}`));
const r6 = await llm(remote("203.0.113.9", CODE));
check("여덟 번 틀리면 맞는 코드도 15분 잠금", r6.status === 401 && r6.error === "locked");
const r7 = await llm(remote("203.0.113.6", CODE));
check("다른 사람의 잠금은 내게 영향 없음", r7.status === 200);
const gz = await fetch(`${BASE}/js/main.js`, { headers: { "accept-encoding": "gzip" } });
check("텍스트 파일은 압축해서 보낸다", gz.headers.get("content-encoding") === "gzip");
const env = await fetch(`${BASE}/.env`);
const srvFile = await fetch(`${BASE}/%2e%2e/server/index.js`);
const envUp = await fetch(`${BASE}/%2e%2e/.env`);
check(".env·서버 코드는 밖에서 받을 수 없다", env.status === 404 && srvFile.status !== 200 && envUp.status !== 200, `${env.status}/${srvFile.status}/${envUp.status}`);
const hu = await health();
check("바깥 사용량만 집계된다", hu.share.usage.calls >= 3 && hu.share.usage.usd > 0, `$${hu.share.usage.usd} · ${hu.share.usage.calls}회`);
await stop(srv);

// ── 2) 분당 한도 ──
srv = await start({ PER_CLIENT_PER_MINUTE: "2" });
const a = [];
for (let i = 0; i < 3; i++) a.push(await llm(remote("198.51.100.7", CODE)));
check("분당 한도를 넘으면 잠시 거절", a[0].status === 200 && a[1].status === 200 && a[2].status === 429 && a[2].error === "rate_limit");
const other = await llm(remote("198.51.100.8", CODE));
check("한도는 사람(IP)별로 따로", other.status === 200);
await stop(srv);

// ── 3) 하루 예산 ──
srv = await start({ DAILY_BUDGET_USD: "0.000001" });
const b1 = await llm(remote("198.51.100.20", CODE));
const b2 = await llm(remote("198.51.100.20", CODE));
const hb = await health(remote("198.51.100.20", CODE));
const mine = await llm({});
check("하루 예산을 넘으면 바깥 접속자는 규칙 모드로", b1.status === 200 && b2.status === 429 && b2.error === "budget" && hb.llm === false && hb.reason === "budget");
check("내 PC(로컬)는 예산과 무관하게 계속 사용", mine.status === 200);
await stop(srv);

// ── 4) 접속 코드를 정하지 않은 서버 ──
srv = await start({ ACCESS_CODE: "" });
const s1 = await llm(remote("198.51.100.30", "ANYTHING"));
check("접속 코드가 없는 서버는 바깥에 LLM을 열지 않는다", s1.status === 401 && s1.error === "share_off");
await stop(srv);

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} / ${results.length} 통과`);
process.exit(failed ? 1 : 0);
