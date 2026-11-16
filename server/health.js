// 상태 확인 — /api/health
// 내 PC에서 부르면 통계와 한도까지, 바깥에서 부르면 LLM을 쓸 수 있는지와 그 까닭만 알려 준다.
import { MODEL, EFFORT, LIMITS } from "./config.js";
import { send } from "./http.js";
import { whoIs, checkCode, codeSet } from "./access.js";
import { clientState, usageSnapshot } from "./limits.js";
import { client, stats } from "./llm.js";

export async function handleHealth(req, res) {
  const who = whoIs(req);
  if (!who.remote) {
    return send(res, 200, {
      ok: true, llm: Boolean(client), model: MODEL, effort: EFFORT, stats,
      share: { codeSet, limits: LIMITS, usage: await usageSnapshot() },
    });
  }
  // 상태 조회는 시도 횟수와 잠금을 바꾸지 않는다. 실제 LLM 요청에서만 횟수를 센다.
  const auth = checkCode(req, who.ip, { countAttempt: false });
  const state = await clientState(who.ip);
  let reason = auth.ok ? null : auth.reason;
  if (auth.ok && state.budget) reason = "budget";
  else if (auth.ok && state.quota) reason = "quota";
  return send(res, 200, { ok: true, llm: Boolean(client) && !reason, model: MODEL, remote: true, reason, needCode: reason === "need_code" || reason === "bad_code" });
}
