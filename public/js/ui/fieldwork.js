// 현장 취재 모드 — 세계지도 → 국가 지도 → 사건 개요 → 현장(3D)으로 가는 길을 잇는다.
// 세계지도에서는 나라를 고르기만 한다. 조사와 대화는 현장에서 한다. (docs/roadmap/direction-proposal.md)
// 이 파일은 잇기만 한다: 세계지도의 표시는 ui/map.js, 국가 지도는 ui/nation.js, 사건 핀은 data/cases.js, 현장의 저장은 site/state.js.
import { G, saveGame, fieldMode } from "../core/store.js";
import { on } from "../core/bus.js";
import { escapeHtml } from "../core/util.js";
import { h, $, toast, confirmDialog } from "./dom.js";
import { setField, focusCountry, selectCountry, mapState } from "./map.js";
import { setFieldStep } from "./hud.js";
import { openNation, closeNation, nationOpen } from "./nation.js";
import { NATION_MAPS, hasNationMap, HOME_BASE, casesIn, caseCounts } from "../data/cases.js";
import { COUNTRIES } from "../data/countries.js";
import { loadSaved, fmtClock } from "../site/state.js";
import { sfx } from "../audio.js";

let bound = false;
let opening = false;
let hideCaption = null;

// 현장의 저장을 읽어 어디까지 했는지 알아낸다. 본 게임에서 떠난 적이 없으면 새 사건이다.
async function readStatus(c, st) {
  if (!st?.at) return { started: false };
  const { SITES } = await import("../data/sites/index.js"); // 현장의 자료는 필요할 때만 읽는다
  return { started: true, done: Boolean(st.flags?.[`${c.id}_done`]), clock: fmtClock(st.minute), place: SITES[st.at]?.place || "" };
}
const statusOf = (c) => readStatus(c, G.campaign.flags.departed ? loadSaved(c.id) : null);
const siteUrl = (c, restart) => `/site.html?case=${encodeURIComponent(c.id)}${restart ? "&fresh" : ""}`;

function tipOf(feat) {
  const n = caseCounts()[feat.key] || 0;
  const line = hasNationMap(feat.key) ? (n ? `사건 ${n}건 · 눌러서 지도를 편다` : "들어온 사건 없음 · 눌러서 지도를 편다") : "아직 이 나라의 지도가 없다";
  return `<b>${escapeHtml(feat.c.ko)}</b><span>${line}</span>`;
}
function syncWorld() {
  setField({ open: Object.keys(NATION_MAPS), badges: Object.entries(caseCounts()).map(([country, n]) => ({ country, text: `사건 ${n}` })), tip: tipOf });
}

export async function enterNation(id, focus) {
  if (!G || !fieldMode() || opening || nationOpen()) return;
  if (!hasNationMap(id)) {
    sfx("tick");
    return toast(`${COUNTRIES[id]?.ko || "이 나라"}의 지도는 아직 없다. 지금은 대한민국과 일본만 펼 수 있다.`, "info", 3600);
  }
  opening = true;
  try {
    const g = G;
    const cases = await Promise.all(casesIn(id).map(async (c) => ({ ...c, status: await statusOf(c) })));
    if (G !== g) return;
    selectCountry(id);
    focusCountry(id, mapState.kMin * 5.5);
    const ok = await openNation(id, {
      cases, focus,
      me: HOME_BASE.country === id ? HOME_BASE : null,
      onCase: (c) => {
        setFieldStep(c ? "case" : "nation");
        if (!c || G.campaign.flags.caseSeen) return;
        G.campaign.flags.caseSeen = true;
        saveGame();
      },
      // 다시 시작할 때와, 떠난 적이 없는데 이 컴퓨터에 취재 기록이 남아 있을 때는 먼저 묻는다. 돌려주는 값: false(그만둔다) | { restart }
      beforeDepart: async (c, { restart }) => {
        if (restart) return (await confirmDialog("지금까지의 취재 기록을 지우고 처음부터 다시 합니까?", { title: "처음부터 다시", danger: true, yes: "처음부터 다시" })) ? { restart: true } : false;
        if (c.status.started) return { restart: false };
        const old = loadSaved(c.id);
        if (!old?.at) return { restart: true };
        const wipe = await confirmDialog(`이 컴퓨터에 이 사건을 취재하던 기록이 남아 있다 (${fmtClock(old.minute)}). 지우고 처음부터 합니까?`, { title: "남아 있는 취재 기록", danger: true, yes: "지우고 처음부터", no: "이어서 한다" });
        return wipe ? { restart: true } : { restart: false, status: await readStatus(c, old) };
      },
      onDepart: (c, { restart }) => {
        setFieldStep("site");
        G.campaign.flags.departed = true;
        saveGame();
        location.href = siteUrl(c, restart);
      },
      onClose: () => {
        setFieldStep("world");
        selectCountry(null);
        focusCountry(id);
      },
    });
    if (ok) setFieldStep("nation");
    if (ok && cases.length && !G.campaign.flags.nationOpened) {
      G.campaign.flags.nationOpened = true;
      saveGame();
    }
  } catch (e) {
    console.error("[nation]", e);
    toast("국가 지도를 펴지 못했다.", "bad");
  } finally {
    opening = false;
  }
}

// 처음 들어설 때 지도 위에 잠깐 뜨는 글
function caption(small, big, sub, ms = 5200) {
  $(".field-caption")?.remove();
  const el = h("div.field-caption", h("small", small), h("b", big), sub ? h("span", sub) : null);
  $("#screen-game").append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  const t = setTimeout(() => hideCaption?.(), ms);
  hideCaption = () => {
    hideCaption = null;
    clearTimeout(t);
    el.classList.remove("in");
    setTimeout(() => el.remove(), 1200);
  };
}

// 게임을 시작할 때 main.js가 부른다. 현장 취재 모드가 아니면 세계지도를 예전대로 돌려놓는다.
export function startFieldwork(isNew) {
  const field = fieldMode();
  $("#screen-game").classList.toggle("field", field);
  if (nationOpen()) closeNation();
  if (!bound) {
    bound = true;
    on("map:country", (id) => {
      hideCaption?.(); // 나라를 누르면 처음의 글은 걷는다
      enterNation(id);
    });
  }
  hideCaption?.();
  if (!field) return setField(null);
  syncWorld();
  setFieldStep("world");
  const first = casesIn(HOME_BASE.country)[0];
  if (isNew) caption("프롤로그", "수능 다음 날, 금요일 아침", "세계지도에서 대한민국을 누른다");
  // 이미 현장에 다녀온 저장이면 그 사건의 개요까지 바로 편다: 한 번만 누르면 현장으로 돌아간다
  else if (G.campaign.flags.departed && first) setTimeout(() => enterNation(first.country, first.id), 700);
}
