// 현장 페이지: ?case=prologue 는 마지막 현장, ?site=mokwon_room12 는 지정한 현장을 연다.
// &carry=prologue 는 이전 사건의 기록을 인계하되, 같은 취재의 기존 기록이 있으면 이어 간다.
// &blockout 블록아웃 모델 / &stats 성능 표시 / &fresh 처음부터 다시 취재.
import { checkHealth } from "../llm/api.js";
import { prepareSite } from "./progress.js";

const q = new URLSearchParams(location.search);
const root = document.getElementById("site");
const loading = root.querySelector(".s-loading");

checkHealth(); // AI 연기를 쓸 수 있는지 확인한다. 연결되지 않으면 규칙 모드로 진행한다.
try {
  const { def, fresh } = prepareSite(q);
  // 새로 고침이 인계나 초기화를 되풀이하지 않도록 처리한 표시를 주소에서 지운다.
  history.replaceState(null, "", `${location.pathname}?${q}`);
  document.title = `${def.title} — 기정사실`;
  // 책상은 3D를 쓰지 않는다. 쓰는 쪽만 내려받는다.
  if (def.kind === "desk") window.__site = await (await import("./desk.js")).createDesk(root, def, { fresh });
  else window.__site = await (await import("./engine.js")).createSite(root, def, { stats: q.has("stats"), blockout: q.has("blockout"), fresh });
  loading?.remove();
} catch (e) {
  console.error(e);
  if (loading) loading.textContent = `현장을 열지 못했습니다: ${e?.message || e}`;
}
