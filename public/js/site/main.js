// 현장 페이지의 시작점: /site.html?site=mokwon_room12  (걸어 다니는 3D 현장)   /site.html?site=mokwon_desk  (책상: 기록을 읽는 화면)
//   &blockout  블록아웃 glb로 연다      &stats  프레임·삼각형·내려받은 크기를 띄운다      &fresh  저장을 지우고 처음부터
import { SITES } from "../data/sites/index.js";
import { checkHealth } from "../llm/api.js";

const q = new URLSearchParams(location.search);
const def = SITES[q.get("site")] || Object.values(SITES)[0];
const root = document.getElementById("site");
const loading = root.querySelector(".s-loading");
document.title = `${def.title} — 기정사실`;

checkHealth(); // AI 연기를 쓸 수 있는지. 못 쓰면 규칙 모드로 간다.
try {
  // 책상은 3D를 쓰지 않는다. 쓰는 쪽만 내려받는다.
  if (def.kind === "desk") window.__site = await (await import("./desk.js")).createDesk(root, def, { fresh: q.has("fresh") });
  else window.__site = await (await import("./engine.js")).createSite(root, def, { stats: q.has("stats"), blockout: q.has("blockout"), fresh: q.has("fresh") });
  loading?.remove();
} catch (e) {
  console.error(e);
  if (loading) loading.textContent = `현장을 열지 못했다: ${e?.message || e}`;
}
