// 손님 화면 미리보기:  node tools/guest-preview.mjs
// 터널 없이, 내 PC에서 '바깥 접속자'가 보는 화면을 확인한다.
// 시험용 서버(5191)를 따로 띄우고, 그 앞에 전달 헤더를 붙여 주는 작은 중계기(5192)를 둔다.
// 접속 코드는 여기서만 쓰는 시험용 값이다 (.env의 실제 코드와 무관).
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_PORT = 5191;
const PROXY_PORT = 5192;
const CODE = "PREVIEW42";

const server = spawn(process.execPath, ["server/index.js"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(SERVER_PORT), ACCESS_CODE: CODE, USAGE_FILE: path.join(os.tmpdir(), "gijeong-preview-usage.json") },
  stdio: ["ignore", "ignore", "inherit"],
});
const stop = () => {
  try {
    server.kill();
  } catch { /* 이미 끝남 */ }
};
process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("exit", stop);

http
  .createServer((req, res) => {
    const up = http.request(
      { host: "127.0.0.1", port: SERVER_PORT, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${SERVER_PORT}`, "x-forwarded-for": "203.0.113.77" } },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    up.on("error", () => {
      res.writeHead(502);
      res.end("upstream");
    });
    req.pipe(up);
  })
  .listen(PROXY_PORT, "127.0.0.1", () => {
    console.log(`\n  손님 화면 미리보기  →  http://localhost:${PROXY_PORT}`);
    console.log(`  시험용 접속 코드: ${CODE}`);
    console.log("  (Ctrl+C로 끝냅니다)\n");
  });
