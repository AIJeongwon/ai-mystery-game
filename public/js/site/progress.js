// 사건의 마지막 현장, 장 사이의 인계, 처음부터 다시 취재하는 범위.
import { SITES, CASES } from "../data/sites/index.js";
import { loadSaved, loadSite, carryInto, saveKeyOf, runIdOf } from "./state.js";
import { loadPhotos } from "./photos.js";
import { SITE_PREFIX, PHOTO_PREFIX, writeStorage } from "../core/field-save.js";

function following(def, st) {
  const ids = st.nextSite ? [st.nextSite] : [];
  // 이전 저장에는 다음 현장 이름이 없다. 실제로 사용했던 인계 지점과 도착 기록으로 찾는다.
  for (const spot of def.allSpots || def.spots || []) if (spot.goto?.carry && st.seen[spot.id]) ids.push(spot.goto.site);
  return [...new Set(ids)].map((id) => SITES[id]).filter(Boolean);
}

export function loadCaseProgress(id) {
  const kase = CASES[id];
  if (!kase) return null;
  let def = SITES[kase.first], st = loadSite(def);
  if (!st) return null;
  def = SITES[st.at] || def;
  const visited = new Set([st.site]);
  for (;;) {
    const next = following(def, st).map((d) => ({ def: d, state: loadSite(d) })).find(({ state }) => state && !visited.has(state.site) && state.carried === st.site && runIdOf(state) === runIdOf(st));
    if (!next) return { def, state: st };
    def = SITES[next.state.at] || next.def;
    st = next.state;
    visited.add(st.site);
  }
}

export function transferSite(def, sourceKey) {
  const raw = loadSaved(sourceKey);
  const sourceDef = SITES[raw?.at];
  if (!sourceDef || saveKeyOf(sourceDef) !== sourceKey) throw new Error("이전 현장의 취재 기록을 읽지 못했습니다.");
  const from = loadSite(sourceDef);
  if (!from) throw new Error("이전 현장의 취재 기록을 읽지 못했습니다.");
  if (saveKeyOf(def) === from.site) throw new Error("같은 현장으로 취재 기록을 인계할 수 없습니다.");
  const existing = loadSite(def);
  const reuse = existing && existing.carried === from.site && runIdOf(existing) === runIdOf(from);
  const next = reuse ? existing : carryInto(def, from);
  const entries = [[SITE_PREFIX + from.site, JSON.stringify({ ...from, nextSite: def.id })]];
  if (!reuse) entries.unshift([SITE_PREFIX + next.site, JSON.stringify(next)], [PHOTO_PREFIX + next.site, JSON.stringify(loadPhotos(from.site))]);
  writeStorage(entries);
  return next;
}

export function restartCase(id) {
  const kase = CASES[id];
  if (!kase) return;
  const queue = [...kase.sites], visited = new Set(), keys = new Set();
  while (queue.length) {
    const site = queue.shift();
    if (visited.has(site) || !SITES[site]) continue;
    visited.add(site);
    const def = SITES[site];
    keys.add(saveKeyOf(def));
    for (const spot of def.spots || []) if (spot.goto?.carry) queue.push(spot.goto.site);
  }
  writeStorage([...keys].flatMap((key) => [[SITE_PREFIX + key, null], [PHOTO_PREFIX + key, null]]));
}

// 주소 해석을 화면 초기화와 분리해 실제 재진입 경로를 검사한다.
export function prepareSite(q) {
  const kase = CASES[q.get("case")];
  const fresh = q.has("fresh");
  if (kase && fresh) restartCase(kase.id);
  const def = (kase ? (!fresh && loadCaseProgress(kase.id)?.def) || SITES[kase.first] : SITES[q.get("site")]) || SITES.mokwon_room12;
  if (q.has("carry") && def.kind !== "desk") transferSite(def, q.get("carry"));
  q.delete("carry");
  if (kase && fresh) q.delete("fresh");
  return { def, fresh };
}
