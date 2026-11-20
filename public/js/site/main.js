// 현장 페이지의 시작점: /site.html?site=mokwon_room12  (걸어 다니는 3D 현장)   /site.html?site=mokwon_desk  (책상: 기록을 읽는 화면)
//   /site.html?case=prologue  여러 장소를 오가는 사건. 저장이 있으면 마지막에 있던 장소에서 잇는다.
//   &carry=prologue  앞 사건의 저장을 이 현장의 처음 상태에 얹는다 (프롤로그 → 제1장)
//   &blockout  블록아웃 glb로 연다      &stats  프레임·삼각형·내려받은 크기를 띄운다      &fresh  저장을 지우고 처음부터
import { SITES, CASES } from "../data/sites/index.js";
import { checkHealth } from "../llm/api.js";
import { loadSaved, carryInto, saveSite, clearSite } from "./state.js";
import { loadPhotos, savePhotos } from "./photos.js";

const q = new URLSearchParams(location.search);
const kase = CASES[q.get("case")];
const fresh = q.has("fresh");
if (kase && fresh) {
  clearSite(kase.def);
  q.delete("fresh"); // 새로 고침했을 때 또 지우지 않게 주소에서 떼어 둔다
  history.replaceState(null, "", `${location.pathname}?${q}`);
}
const def = (kase ? SITES[(!fresh && loadSaved(kase.def.save)?.at) || kase.first] : SITES[q.get("site")]) || SITES.mokwon_room12;
// 앞 사건에서 넘어왔다: 카드와 판과 수첩을 얹어 저장해 두면, 현장은 저장을 읽듯이 연다
if (q.has("carry") && def.kind !== "desk") {
  const from = loadSaved(q.get("carry"));
  if (from?.evidence) {
    saveSite(carryInto(def, from));
    savePhotos(def.id, { ...loadPhotos(q.get("carry")) });
  }
  q.delete("carry");
  history.replaceState(null, "", `${location.pathname}?${q}`);
}
const root = document.getElementById("site");
const loading = root.querySelector(".s-loading");
document.title = `${def.title} — 기정사실`;

checkHealth(); // AI 연기를 쓸 수 있는지. 못 쓰면 규칙 모드로 간다.
try {
  // 책상은 3D를 쓰지 않는다. 쓰는 쪽만 내려받는다.
  if (def.kind === "desk") window.__site = await (await import("./desk.js")).createDesk(root, def, { fresh });
  else window.__site = await (await import("./engine.js")).createSite(root, def, { stats: q.has("stats"), blockout: q.has("blockout"), fresh });
  loading?.remove();
} catch (e) {
  console.error(e);
  if (loading) loading.textContent = `현장을 열지 못했다: ${e?.message || e}`;
}
