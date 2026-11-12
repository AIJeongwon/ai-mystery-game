// 기정사실(記定事實) — 진입점
import { G, setG, saveGame, newGame } from "./core/store.js";
import { on, emit } from "./core/bus.js";
import { fmtWon, fmtNum } from "./core/util.js";
import { checkHealth, llm, llmReasonText } from "./llm/api.js";
import { $, toast } from "./ui/dom.js";
import { loadMap, initMap, fitWorld, focusCountry, markDirty, ripple } from "./ui/map.js";
import { buildHud, bindHud, updateHud, renderObjective } from "./ui/hud.js";
import { bindDetail, showFeed, showEvent } from "./ui/detail.js";
import { bindPanels, closeDrawer, openDrawer } from "./ui/panels.js";
import { bindCasefile } from "./ui/casefile.js";
import { showTitle, hideTitle, openHelp } from "./ui/title.js";
import { initDirector } from "./sim/director.js";
import { initChronicle } from "./sim/chronicle.js";
import { initPress, refreshCandidates } from "./sim/press.js";
import { startClock, stopClock, setSpeed, skip } from "./sim/clock.js";
import { feed, cname } from "./sim/world.js";
import { startCampaign, stopCampaign } from "./campaign/engine.js";
import { STAGES } from "./data/templates.js";
import { OUTLETS, HOME } from "./data/world.js";
import { music, sfx } from "./audio.js";

let notifBound = false;
let lastLeadToast = 0;

function startGame(g, isNew) {
  setG(g);
  for (const s of g.world.schedule) if (!s.done) s.queued = false; // 불러온 뒤 다시 준비
  initDirector();
  initChronicle();
  initPress();
  if (!g.outlet.candidates?.length) refreshCandidates();
  hideTitle();
  $("#screen-game").classList.remove("hidden");
  closeDrawer();
  buildHud();
  bindHud();
  bindDetail();
  bindPanels();
  bindCasefile();
  initMap();
  fitWorld();
  bindNotifications();
  showFeed();
  renderObjective();
  startClock();
  music("game");
  setTimeout(() => focusCountry(g.player.loc, undefined), 400);
  startCampaign();
  if (isNew && g.campaign.flags.prologueDone) {
    feed("sys", `「${g.meta.outlet}」 창간. 구독자 ${Math.floor(g.outlet.subs)}명.`);
    toast("프롤로그를 건너뛰었다. 도장은 이미 당신 손에 있다.", "canon", 6000);
  }
  saveGame();
}

function bindNotifications() {
  if (notifBound) return;
  notifBound = true;
  on("lead:new", (ev) => {
    if (ev.campaign) return;
    feed("lead", `${ev.stage === 0 ? "[소문]" : "[포착]"} ${cname(ev.country)} ${ev.city} — ${ev.title}`, { ev: ev.id, cat: ev.cat });
    const t = performance.now();
    if (t - lastLeadToast > 1500) {
      lastLeadToast = t;
      sfx("lead");
      toast(`${ev.stage === 0 ? "소문" : "새 사건"}: ${ev.title}`, "lead");
    }
  });
  on("event:stage", (ev) => {
    if (!ev.known || ev.stage >= 4) return;
    if (ev.stage === 1) {
      sfx("breaking");
      feed("world", `[속보] ${ev.title}`, { ev: ev.id, cat: ev.cat });
    } else feed("world", `[${STAGES[ev.stage].ko}] ${ev.title}`, { ev: ev.id, cat: ev.cat });
    markDirty();
  });
  on("feed", (it) => {
    if (it.kind === "rival" && it.scoop && G.notebook[it.ev]) {
      sfx("bad");
      toast(`${OUTLETS[it.outlet].short}이(가) 당신이 쫓던 사건에서 단독을 냈다.`, "bad");
    }
  });
  on("fallout", (a, x) => {
    sfx("bad");
    toast(`정정보도 — 「${a.headline}」 신뢰도 ${x.dc.toFixed(1)} · 법무 비용 ${fmtWon(x.legal)}`, "bad", 7000);
  });
  on("vindicated", (a) => {
    sfx("good");
    toast(`보도 적중 — 「${a.headline}」의 내용이 공식 확인됐다.`, "good", 6000);
  });
  on("levelup", (lv) => {
    sfx("level");
    toast(`기자 레벨 ${lv} — 역량 점수를 얻었다. (경영 → 기자)`, "gold", 6000);
  });
  on("day", (rec) => {
    toast(`하루 정산 — 수입 ${fmtWon(rec.income)} · 지출 ${fmtWon(rec.expense)} · 조회수 ${fmtNum(rec.views)}`, rec.net >= 0 ? "good" : "bad", 5500);
    updateHud();
  });
  on("canon:ended", (cn) => {
    if (cn.ended?.how === "fade") {
      sfx("rift");
      toast(`문장이 바랬다 — 「${cn.belief}」`, "canon", 6000);
    }
  });
  on("canon:reverted", (cn) => ripple(cn.country || HOME, true));
  on("agenda:resolved", (ag) => toast(`의제 결착 — ${ag.title}: ${ag.resolved.text}`, "info", 6000));
  on("tier", () => markDirty());
  on("ui:title", () => {
    stopClock();
    stopCampaign();
    setG(null);
    showTitle(startGame);
  });
  on("ui:help", () => openHelp());
  on("llm:lost", () => G && toast(llmReasonText(), "bad", 8000));
  // 끊긴 연결(하루 한도·네트워크)은 5분마다 다시 확인한다
  setInterval(() => G && !llm.online && checkHealth(), 300_000);
  on("ui:objective", () => G.campaign.flags.caseOpen && openDrawer("case"));
  window.addEventListener("beforeunload", () => G && saveGame());
}

async function boot() {
  const fonts = document.fonts?.ready ?? Promise.resolve();
  await Promise.all([checkHealth(), loadMap(), Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))])]);
  const q = new URLSearchParams(location.search);
  if (q.has("dev")) {
    startGame(newGame({ reporter: "한서진", outlet: "새벽신문", skipPrologue: q.has("skip"), seed: 20310303 }), true);
  } else showTitle(startGame);
  $("#boot").classList.add("out");
  setTimeout(() => $("#boot").remove(), 600);
  // 개발·시험용 손잡이
  window.__dev = { get G() { return G; }, skip, setSpeed, emit, showEvent, saveGame };
}
boot().catch((e) => {
  console.error(e);
  const t = document.querySelector(".boot-text");
  if (t) t.textContent = "불러오는 중 오류가 났습니다. 콘솔을 확인하세요.";
});
