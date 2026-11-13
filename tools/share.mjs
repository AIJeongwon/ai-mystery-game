// 내 PC에서 임시 공유 주소 열기:  node tools/share.mjs   (또는 share-game.bat)
// 게임 서버를 공유용 포트로 띄우고, cloudflared 빠른 터널로 바깥 주소를 만든다.
// 이 창을 닫으면 공유가 끝난다. 주소는 켤 때마다 바뀐다.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV = path.join(ROOT, ".env");
const PORT = Number(process.env.SHARE_PORT) || 5180;
const HIDE_CODE = process.env.SHARE_HIDE_CODE === "1"; // 화면 녹화·시험용: 코드를 화면에 찍지 않는다

// ── 1) 접속 코드: .env에 없으면 만들어 적는다 (다른 값은 건드리지도 출력하지도 않는다) ──
const envText = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";
let code = /^ACCESS_CODE=(.*)$/m.exec(envText)?.[1]?.trim();
if (!code) {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 헷갈리는 글자(0·O·1·I·L) 제외
  code = Array.from(crypto.randomBytes(8), (b) => abc[b % abc.length]).join("");
  fs.appendFileSync(ENV, `${envText && !envText.endsWith("\n") ? "\n" : ""}ACCESS_CODE=${code}\n`);
  console.log("  접속 코드를 새로 만들어 .env에 적었습니다. (.env의 ACCESS_CODE 값을 바꾸면 코드가 바뀝니다)");
}
const hasKey = /^ANTHROPIC_API_KEY=\S+/m.test(envText);

// ── 2) cloudflared 찾기 ──
const local = path.join(ROOT, "tools", "bin", process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
let cloudflared = fs.existsSync(local) ? local : null;
if (!cloudflared && spawnSync("cloudflared", ["--version"], { stdio: "ignore" }).status === 0) cloudflared = "cloudflared";
if (!cloudflared) {
  console.error(`
  cloudflared를 찾지 못했습니다.
  Cloudflare 공식 릴리스에서 받아 아래 위치에 두세요.
    https://github.com/cloudflare/cloudflared/releases/latest
    → ${local}
`);
  process.exit(1);
}

// ── 3) 게임 서버 ──
const children = [];
function stopAll() {
  for (const c of children) {
    try {
      c.kill();
    } catch { /* 이미 끝남 */ }
  }
}
process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});
process.on("exit", stopAll);

const health = async () => {
  try {
    return await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
  } catch {
    return null;
  }
};
if (await health()) {
  console.error(`\n  포트 ${PORT}을 이미 다른 프로그램이 쓰고 있습니다. 이전 공유 창이 열려 있으면 닫고 다시 실행하세요.\n`);
  process.exit(1);
}
const server = spawn(process.execPath, ["server/index.js"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), ACCESS_CODE: code }, stdio: ["ignore", "ignore", "inherit"] });
children.push(server);
server.on("exit", (c) => {
  console.error(`\n  게임 서버가 멈췄습니다 (코드 ${c}). 공유를 끝냅니다.`);
  stopAll();
  process.exit(1);
});
let up = null;
for (let i = 0; i < 40 && !up; i++) {
  await new Promise((r) => setTimeout(r, 250));
  up = await health();
}
if (!up) {
  console.error("\n  게임 서버가 뜨지 않았습니다.");
  process.exit(1);
}

// ── 4) 터널 ──
console.log("\n  바깥 주소를 만드는 중… (10~20초)");
const cf = spawn(cloudflared, ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });
children.push(cf);
let announced = false;
const onData = (buf) => {
  const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(String(buf));
  if (!m || announced) return;
  announced = true;
  const L = up.share.limits;
  console.log(`
  ┌─────────────────────────────────────────────────────────────
  │  기정사실(記定事實) — 공유 중
  │
  │  주소       ${m[0]}
  │  접속 코드  ${HIDE_CODE ? "(.env의 ACCESS_CODE)" : code}
  │
  │  · 주소와 접속 코드를 함께 알려 주세요. 코드를 넣어야 AI가 인물을 연기합니다.
  │  · 코드 없이 들어온 사람은 규칙 모드로만 플레이됩니다.
  │  · 한도: 하루 전체 $${L.dailyBudgetUsd} · 한 사람 하루 ${L.perClientDaily}회 · 분당 ${L.perClientMinute}회
  │    (.env의 DAILY_BUDGET_USD / PER_CLIENT_DAILY_CALLS / PER_CLIENT_PER_MINUTE 로 조정)
  │  · 이 창을 닫으면 공유가 끝납니다. 주소는 켤 때마다 바뀝니다.
  │  · PC가 절전에 들어가면 접속이 끊깁니다.
  │  · 나는 http://localhost:${PORT} 로 접속하면 코드 없이 플레이할 수 있습니다.
  └─────────────────────────────────────────────────────────────
${hasKey ? "" : "\n  ※ .env에 ANTHROPIC_API_KEY가 없습니다. 모든 접속자가 규칙 모드로 플레이됩니다.\n"}`);
};
cf.stdout.on("data", onData);
cf.stderr.on("data", onData);
cf.on("exit", (c) => {
  console.error(`\n  터널이 끊겼습니다 (코드 ${c}). 다시 실행하면 새 주소가 만들어집니다.`);
  stopAll();
  process.exit(1);
});
setTimeout(() => {
  if (!announced) console.log("  아직 주소가 나오지 않았습니다. 인터넷 연결이나 방화벽을 확인하세요…");
}, 45_000);

// ── 5) 사용량 알림 (5분마다, 변화가 있을 때만) ──
let last = "";
setInterval(async () => {
  const h = await health();
  const u = h?.share?.usage;
  if (!u) return;
  const line = `  [${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}] 오늘 바깥 접속 사용량: $${u.usd.toFixed(3)} / $${h.share.limits.dailyBudgetUsd} · 호출 ${u.calls}회 · 접속자 ${u.clients}명`;
  const key = `${u.calls}:${u.clients}`;
  if (key !== last) {
    last = key;
    console.log(line);
  }
}, 300_000);
