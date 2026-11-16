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

const fails = new Map(); // 접속자별 실제 실패 횟수·잠금 시각·상태 조회 코드 해시와 확인 시각
export function checkCode(req, ip, { countAttempt = true } = {}) {
  if (!CODE_HASH) return { ok: false, reason: "share_off" }; // 접속 코드를 정하지 않았으면 원격 LLM은 꺼 둔다
  const f = fails.get(ip);
  if (f && f.until > Date.now()) return { ok: false, reason: "locked" };
  const given = String(req.headers["x-access-code"] || "").trim();
  if (!given) return { ok: false, reason: "need_code" };
  const digest = sha(given);
  if (!countAttempt) {
    // 같은 저장 코드의 상태 조회는 반복 허용하되 새 코드 대입은 15분에 여덟 개로 제한한다.
    const checks = (f?.checks || []).filter((entry) => entry.at > Date.now() - 15 * 60_000);
    const hash = digest.toString("hex");
    if (!checks.some((entry) => entry.hash === hash)) {
      if (checks.length >= 8) return { ok: false, reason: "rate_limit" };
      checks.push({ hash, at: Date.now() });
    }
    fails.set(ip, { n: f?.n || 0, until: f?.until || 0, checks });
  }
  if (crypto.timingSafeEqual(digest, CODE_HASH)) {
    if (countAttempt) fails.delete(ip);
    return { ok: true };
  }
  if (countAttempt) {
    const n = (f?.n || 0) + 1;
    fails.set(ip, { checks: f?.checks || [], ...(n >= 8 ? { n: 0, until: Date.now() + 15 * 60_000 } : { n, until: 0 }) }); // 여덟 번 틀리면 15분 잠금
  }
  return { ok: false, reason: "bad_code" };
}
