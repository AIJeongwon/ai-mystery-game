// LLM 중계 — /api/llm. 모델과 effort를 고정하고, API 키는 서버에만 둔다.
// 바깥 접속이면 접속 코드와 한도를 거치고, 허용한 작업 이름·스키마·출력 상한만 받는다.
import Anthropic from "@anthropic-ai/sdk";
import { MODEL, EFFORT, HAS_KEY, TASK_CAPS, MAX_CONCURRENT } from "./config.js";
import { send, readBody } from "./http.js";
import { whoIs, checkCode } from "./access.js";
import { takeSlot, recordUsage } from "./limits.js";

export const client = HAS_KEY ? new Anthropic({ maxRetries: 2, timeout: 90_000 }) : null;

// 서버를 켠 뒤의 호출 통계 (내 PC의 상태 확인에서만 보인다)
export const stats = { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, byTask: {} };

// 동시 요청 제한 (요금제 한도 보호)
let active = 0;
const waiters = [];
async function withSlot(fn) {
  if (active >= MAX_CONCURRENT) await new Promise((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

function cleanMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = [];
  for (const m of raw.slice(-40)) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return null;
    if (typeof m.content !== "string" || !m.content.trim()) return null;
    out.push({ role: m.role, content: m.content.slice(0, 24_000) });
  }
  if (out[0].role !== "user" || out[out.length - 1].role !== "user") return null;
  return out;
}

async function callLLM(body, who) {
  const task = String(body.task || "generic").slice(0, 40);
  if (who.remote && !TASK_CAPS[task]) throw Object.assign(new Error("허용되지 않은 작업"), { status: 400 });
  const messages = cleanMessages(body.messages);
  if (!messages) throw Object.assign(new Error("messages 형식이 올바르지 않습니다"), { status: 400 });
  const system = typeof body.system === "string" ? body.system.slice(0, 40_000) : undefined;
  const cap = who.remote ? TASK_CAPS[task] : 16_000;
  const maxTokens = Math.max(64, Math.min(Number(body.maxTokens) || 1024, cap));
  const useThinking = body.thinking === true;
  if (who.remote && (!body.schema || typeof body.schema !== "object")) throw Object.assign(new Error("schema가 필요합니다"), { status: 400 });

  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    messages,
    // 사고(thinking)는 effort가 조절한다. 짧은 대화형 응답은 끄고, 생성·판정 작업은 adaptive.
    thinking: useThinking ? { type: "adaptive" } : { type: "disabled" },
    output_config: { effort: EFFORT },
  };
  if (system) {
    params.system = body.cache
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system;
  }
  if (body.schema && typeof body.schema === "object") {
    params.output_config.format = { type: "json_schema", schema: body.schema };
  }

  const t0 = Date.now();
  const response = await withSlot(() => client.messages.create(params));
  const ms = Date.now() - t0;

  const u = response.usage || {};
  stats.calls++;
  stats.inputTokens += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  stats.outputTokens += u.output_tokens || 0;
  stats.cacheRead += u.cache_read_input_tokens || 0;
  const bt = (stats.byTask[task] ||= { calls: 0, ms: 0, out: 0 });
  bt.calls++;
  bt.ms += ms;
  bt.out += u.output_tokens || 0;
  if (who.remote) await recordUsage(u);

  if (response.stop_reason === "refusal") {
    return { ok: false, error: "refusal", ms };
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (params.output_config.format) {
    try {
      return { ok: true, data: JSON.parse(text), ms, stop: response.stop_reason };
    } catch {
      return { ok: false, error: response.stop_reason === "max_tokens" ? "truncated" : "bad_json", ms };
    }
  }
  if (!text) return { ok: false, error: "empty", ms };
  return { ok: true, text, ms, stop: response.stop_reason };
}

export async function handleLLM(req, res) {
  if (!client) return send(res, 503, { ok: false, error: "no_api_key" });
  const who = whoIs(req);
  if (who.remote) {
    const auth = checkCode(req, who.ip);
    if (!auth.ok) return send(res, 401, { ok: false, error: auth.reason });
    const blocked = await takeSlot(who.ip);
    if (blocked) return send(res, 429, { ok: false, error: blocked });
  }
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return send(res, e.status || 400, { ok: false, error: e.message });
  }
  try {
    const result = await callLLM(body, who);
    return send(res, 200, result);
  } catch (error) {
    stats.errors++;
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("[llm] 인증 실패: API 키를 확인하세요.");
      return send(res, 401, { ok: false, error: "auth" });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return send(res, 429, { ok: false, error: "rate_limit" });
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("[llm] 잘못된 요청:", error.message);
      return send(res, 400, { ok: false, error: "bad_request", ...(who.remote ? {} : { detail: error.message }) });
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return send(res, 502, { ok: false, error: "network" });
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`[llm] API 오류 ${error.status}:`, error.message);
      return send(res, 502, { ok: false, error: "api_error", status: error.status });
    }
    if (error?.status === 400) return send(res, 400, { ok: false, error: "bad_request" });
    console.error("[llm] 알 수 없는 오류:", error?.message);
    return send(res, 500, { ok: false, error: "internal" });
  }
}
