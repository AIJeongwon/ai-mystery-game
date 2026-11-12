// LLM 호출 클라이언트 (서버 프록시 경유). 실패하면 ok:false를 돌려주고, 호출부가 규칙 기반 대안을 쓴다.
import { sleep } from "../core/util.js";
import { emit } from "../core/bus.js";

// remote: 공유 주소로 들어온 접속 / needCode: 접속 코드가 필요함 / reason: LLM을 못 쓰는 까닭
export const llm = { online: false, checked: false, model: "", calls: 0, fails: 0, busy: 0, remote: false, needCode: false, reason: null };

// ── 접속 코드 (공유 주소로 들어온 사람이 AI 연기를 쓰려면 필요) ──
const CODE_KEY = "gijeongsasil.code";
export function getCode() {
  try {
    return localStorage.getItem(CODE_KEY) || "";
  } catch {
    return "";
  }
}
export function setCode(v) {
  const code = String(v || "").replace(/[^\x21-\x7e]/g, "").slice(0, 64); // 헤더에 실을 수 있는 글자만
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch { /* 무시 */ }
  return code;
}
function headers(json = false) {
  const h = json ? { "Content-Type": "application/json" } : {};
  const code = getCode();
  if (code) h["X-Access-Code"] = code;
  return h;
}

const REASON_TEXT = {
  need_code: "접속 코드를 넣으면 AI가 인물을 연기합니다. 코드 없이도 규칙 모드로 플레이할 수 있습니다.",
  bad_code: "접속 코드가 맞지 않습니다.",
  locked: "코드를 여러 번 틀려 잠시 잠겼습니다. 15분 뒤에 다시 시도하세요.",
  budget: "오늘 준비된 AI 사용량이 모두 소진됐습니다. 규칙 모드로 플레이됩니다.",
  quota: "오늘 쓸 수 있는 AI 호출 수를 모두 썼습니다. 규칙 모드로 플레이됩니다.",
  share_off: "이 공유 주소에서는 AI 연기가 꺼져 있습니다. 규칙 모드로 플레이됩니다.",
  no_api_key: "서버에 API 키가 없습니다. 규칙 모드로 플레이됩니다.",
  auth: "서버의 API 키가 올바르지 않습니다. 규칙 모드로 플레이됩니다.",
  network: "서버에 연결하지 못했습니다. 규칙 모드로 플레이됩니다.",
};
export const llmReasonText = () => REASON_TEXT[llm.reason] || "AI에 연결되지 않았습니다. 규칙 모드로 플레이됩니다.";
// 이 오류가 오면 다시 확인될 때까지 LLM을 꺼 둔다
const STOP = new Set(["no_api_key", "auth", "need_code", "bad_code", "locked", "budget", "quota", "share_off"]);

export async function checkHealth() {
  try {
    const r = await fetch("/api/health", { cache: "no-store", headers: headers() });
    const j = await r.json();
    llm.online = Boolean(j.llm);
    llm.model = j.model || "";
    llm.remote = Boolean(j.remote);
    llm.needCode = Boolean(j.needCode);
    llm.reason = j.llm ? null : j.reason || (j.remote ? null : "no_api_key");
  } catch {
    llm.online = false;
    llm.reason = "network";
  }
  llm.checked = true;
  emit("llm:status", llm);
  return llm.online;
}

export async function ask({ task, system, messages, schema, maxTokens = 1024, thinking = false, cache = false, timeoutMs = 60000, retries = 1 }) {
  if (!llm.online) return { ok: false, error: "offline" };
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    llm.busy++;
    emit("llm:busy", llm.busy);
    try {
      const r = await fetch("/api/llm", {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ task, system, messages, schema, maxTokens, thinking, cache }),
        signal: ctrl.signal,
      });
      const j = await r.json().catch(() => ({ ok: false, error: "bad_response" }));
      llm.calls++;
      if (j.ok) return j;
      llm.fails++;
      if (STOP.has(j.error)) {
        if (llm.online) {
          llm.online = false;
          llm.reason = j.error;
          llm.needCode = j.error === "need_code" || j.error === "bad_code";
          emit("llm:status", llm);
          emit("llm:lost", j.error);
        }
        return j;
      }
      const retryable = ["rate_limit", "network", "api_error", "truncated", "bad_json", "empty"].includes(j.error);
      if (!retryable || attempt >= retries) return j;
      await sleep(j.error === "rate_limit" ? 2500 : 700);
    } catch (e) {
      llm.fails++;
      if (attempt >= retries) return { ok: false, error: e?.name === "AbortError" ? "timeout" : "network" };
      await sleep(800);
    } finally {
      clearTimeout(timer);
      llm.busy--;
      emit("llm:busy", llm.busy);
    }
  }
}

// JSON 스키마 도우미
export const S = {
  str: (description) => (description ? { type: "string", description } : { type: "string" }),
  int: (values) => ({ type: "integer", enum: values }),
  en: (values) => ({ type: "string", enum: values }),
  bool: () => ({ type: "boolean" }),
  arr: (items) => ({ type: "array", items }),
  obj: (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false }),
};
