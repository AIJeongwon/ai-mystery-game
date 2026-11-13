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
  // 원격: 코드 확인 결과만 알려 준다 (통계·한도는 내보내지 않는다)
  const auth = checkCode(req, who.ip);
  const state = await clientState(who.ip);
  let reason = auth.ok ? null : auth.reason;
  if (auth.ok && state.budget) reason = "budget";
  else if (auth.ok && state.quota) reason = "quota";
  return send(res, 200, { ok: true, llm: Boolean(client) && !reason, model: MODEL, remote: true, reason, needCode: reason === "need_code" || reason === "bad_code" });
}
