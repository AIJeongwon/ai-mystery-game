// 접속자 구분과 접속 코드
// 터널을 거친 요청에는 전달 헤더가 붙는다. 접속자가 이 헤더를 지울 수는 없다(터널이 항상 붙인다).
// 헤더가 있으면 '바깥' 접속이고, 바깥 접속은 접속 코드가 맞아야 LLM을 쓸 수 있다.
import crypto from "node:crypto";
import { ACCESS_CODE } from "./config.js";

export function whoIs(req) {
  const h = req.headers;
  const fwd = h["cf-connecting-ip"] || h["x-forwarded-for"] || h["x-real-ip"] || (h["cf-ray"] ? "tunnel" : "");
  if (!fwd) return { remote: false, ip: "local" };
  return { remote: true, ip: String(fwd).split(",")[0].trim().slice(0, 64) || "tunnel" };
}

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const CODE_HASH = ACCESS_CODE ? sha(ACCESS_CODE) : null;
export const codeSet = Boolean(CODE_HASH);

const fails = new Map(); // ip → { n, until }
export function checkCode(req, ip) {
  if (!CODE_HASH) return { ok: false, reason: "share_off" }; // 접속 코드를 정하지 않았으면 원격 LLM은 꺼 둔다
  const f = fails.get(ip);
  if (f && f.until > Date.now()) return { ok: false, reason: "locked" };
  const given = String(req.headers["x-access-code"] || "").trim();
  if (!given) return { ok: false, reason: "need_code" };
  if (crypto.timingSafeEqual(sha(given), CODE_HASH)) {
    fails.delete(ip);
    return { ok: true };
  }
  const n = (f?.n || 0) + 1;
  fails.set(ip, n >= 8 ? { n: 0, until: Date.now() + 15 * 60_000 } : { n, until: 0 }); // 여덟 번 틀리면 15분 잠금
  return { ok: false, reason: "bad_code" };
}
