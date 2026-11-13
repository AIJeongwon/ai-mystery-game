// 상단 HUD · 도크 · 지도 도구 · 목표 표시
import { G } from "../core/store.js";
import { on, emit } from "../core/bus.js";
import { fmtDate, fmtTime, fmtWon, fmtNum, clamp } from "../core/util.js";
import { h, $, mount, icon, sealSvg, bar, modalOpen } from "./dom.js";
import { setSpeed, isHeld } from "../sim/clock.js";
import { TIERS } from "../data/progress.js";
import { CATS } from "../data/world.js";
import { cname } from "../sim/world.js";
import { totalReaders } from "../sim/press.js";
import { inkCap } from "../sim/canon.js";
import { llm } from "../llm/api.js";
import { MAP_MODES, setMode, mapState, zoomBy, fitWorld, focusCountry } from "./map.js";
import { DRAWERS } from "./drawers.js";
import { sfx } from "../audio.js";

const refs = {};
let prev = {};

export function buildHud() {
  const hud = $("#hud");
  const speedBtn = (n, ic, title) => h("button", { title, dataset: { sp: n }, onclick: () => { sfx("click"); setSpeed(n); } }, icon(ic, 15));
  refs.name = h("div.name");
  refs.tier = h("div.tier");
  refs.date = h("div.d");
  refs.time = h("div.t");
  refs.speed = h("div.speed", speedBtn(0, "pause", "일시정지 (Space)"), speedBtn(1, "play", "보통 (1)"), speedBtn(2, "ff", "빠르게 (2)"), speedBtn(3, "fff", "매우 빠르게 (3)"));
  refs.llm = h("span.llm-dot", { title: "LLM 연결 상태" });
  const stat = (key, label, title, cls = "") => {
    const b = h("b", "–");
    const el = h(`div.hud-stat.${key} ${cls}`, { title }, h("label", label), b);
    refs[key] = b;
    refs[key + "El"] = el;
    return el;
  };
  refs.inkBar = bar(0, 100, "red");
  const inkEl = stat("ink", "인주 印朱", "도장을 찍는 데 쓰는 인주. 기사가 읽힐수록 차오른다.");
  inkEl.append(refs.inkBar);
  refs.loc = h("span");
  mount(hud,
    h("div.hud-brand", { title: "경영 화면 열기", onclick: () => emit("ui:drawer", "manage") }, h("span.hud-seal", { html: sealSvg(34) }), h("div", refs.name, refs.tier)),
    h("div.hud-clock", h("div.hud-date", refs.date, refs.time), refs.speed, refs.llm),
    h("div.hud-stats",
      stat("cash", "자금", "보유 자금. 자정마다 구독료가 들어오고 운영비가 나간다."),
      stat("subs", "유료 구독", "유료 구독자 수"),
      stat("readers", "독자", "전 세계 고정 독자 수 (나라별 점유율 × 뉴스 독자층)"),
      stat("cred", "신뢰도", "매체 신뢰도 (0~100). 정확한 보도로 오르고 오보로 떨어진다."),
      inkEl,
      stat("lv", "기자 레벨", "기사를 쓰면 경험치가 쌓인다. 레벨이 오르면 역량 점수를 얻는다."),
      h("div.hud-stat", { style: { minWidth: "auto" } }, h("div.hud-loc", { title: "현재 위치로 이동", onclick: () => focusCountry(G.player.loc) }, icon("pin", 14), refs.loc)),
    ),
  );
  buildDock();
  buildMapbar();
  updateHud(true);
}

function buildDock() {
  const dock = $("#dock");
  const btn = (key, ic, label) => {
    const b = h("button.dock-btn", { dataset: { key }, title: label, onclick: () => { sfx("click"); emit("ui:drawer", key); } }, icon(ic, 20), label);
    refs["dock_" + key] = b;
    return b;
  };
  mount(dock, ...DRAWERS.flatMap((d) => (d.bottom ? [h("div.dock-sp"), btn(d.key, d.icon, d.label)] : [btn(d.key, d.icon, d.label)])));
}

function buildMapbar() {
  const barEl = $("#mapbar");
  const seg = h("div.seg", MAP_MODES.map((m) => h("button", { dataset: { mode: m.key }, onclick: () => { sfx("click"); setMode(m.key); } }, m.ko)));
  refs.modes = seg;
  const zoom = h("div.seg",
    h("button", { title: "축소", onclick: () => zoomBy(1 / 1.6) }, icon("minus", 14)),
    h("button", { title: "전체 보기", onclick: () => fitWorld() }, icon("globe", 14)),
    h("button", { title: "확대", onclick: () => zoomBy(1.6) }, icon("plus", 14)));
  refs.legend = h("div.legend");
  mount(barEl, seg, zoom, refs.legend);
  on("map:mode", syncMode);
  syncMode(mapState.mode);
}
function syncMode(mode) {
  for (const b of refs.modes.children) b.classList.toggle("on", b.dataset.mode === mode);
  const lg = refs.legend;
  if (mode === "base") mount(lg, Object.values(CATS).map((c) => h("span", h("i", { style: { background: c.color } }), c.ko)));
  else if (mode === "attn") mount(lg, h("span", "세계의 관심: 어두움 → "), h("span", { style: { color: "#ff5a3c", fontWeight: 700 } }, "뜨거움"));
  else if (mode === "stab") mount(lg, h("span", { style: { color: "#c96a5a" } }, "불안"), h("span", "→"), h("span", { style: { color: "#4bb5a9" } }, "안정"));
  else if (mode === "press") mount(lg, h("span", { style: { color: "#8a6fb0" } }, "통제"), h("span", "→"), h("span", { style: { color: "#56a9c2" } }, "자유"));
  else if (mode === "share") mount(lg, h("span", "나라별 1위 매체의 색"));
  else mount(lg, h("span", "내 독자 비중이 높을수록 "), h("span", { style: { color: "#ff6a4a", fontWeight: 700 } }, "붉게"));
}

function floatDelta(key, diff, fmt) {
  const el = refs[key + "El"];
  if (!el || !diff) return;
  const d = h("span.delta", { style: { color: diff > 0 ? "var(--green)" : "var(--red)" } }, (diff > 0 ? "+" : "") + fmt(diff));
  el.append(d);
  setTimeout(() => d.remove(), 1600);
}

export function updateHud(force) {
  if (!G) return;
  const o = G.outlet;
  refs.name.textContent = G.meta.outlet;
  refs.tier.textContent = TIERS[o.tier - 1].name;
  refs.date.textContent = fmtDate(G.time.min, { dateOnly: true });
  refs.time.textContent = fmtTime(G.time.min);
  const cur = { cash: o.cash, subs: Math.floor(o.subs), cred: Math.round(o.cred * 10) / 10, readers: totalReaders(), ink: Math.floor(G.canon.ink) };
  refs.cash.textContent = fmtWon(cur.cash);
  refs.cash.style.color = cur.cash < 0 ? "var(--red)" : "";
  refs.subs.textContent = fmtNum(cur.subs);
  refs.readers.textContent = fmtNum(cur.readers);
  refs.cred.textContent = cur.cred.toFixed(1);
  refs.cred.style.color = cur.cred >= 60 ? "var(--green)" : cur.cred < 35 ? "var(--red)" : "";
  refs.inkEl.classList.toggle("hidden", !G.canon.unlocked);
  refs.ink.textContent = `${cur.ink} / ${inkCap()}`;
  refs.inkBar.firstChild.style.width = `${clamp((G.canon.ink / inkCap()) * 100, 0, 100)}%`;
  refs.lv.textContent = `Lv.${G.player.level}${G.player.pts ? ` ★${G.player.pts}` : ""}`;
  refs.lv.style.color = G.player.pts ? "var(--gold)" : "";
  refs.loc.textContent = G.player.travel ? "이동 중" : `${cname(G.player.loc)} ${G.player.city}`;
  if (!force && prev.cash != null) {
    if (Math.abs(cur.cash - prev.cash) >= 100000) floatDelta("cash", cur.cash - prev.cash, (v) => fmtWon(v).replace("₩", ""));
    if (Math.abs(cur.cred - prev.cred) >= 0.4) floatDelta("cred", cur.cred - prev.cred, (v) => v.toFixed(1));
    if (cur.subs - prev.subs >= 5 || prev.subs - cur.subs >= 5) floatDelta("subs", cur.subs - prev.subs, (v) => fmtNum(v));
    if (Math.abs(cur.ink - prev.ink) >= 1) floatDelta("ink", cur.ink - prev.ink, (v) => String(v));
  }
  prev = cur;
  syncSpeed();
  // 도크 잠금
  for (const d of DRAWERS) if (d.locked) refs["dock_" + d.key].classList.toggle("locked", d.locked(G));
}
function syncSpeed() {
  const sp = G.time.speed;
  for (const b of refs.speed.children) {
    const on = Number(b.dataset.sp) === sp;
    b.classList.toggle("on", on);
    b.classList.toggle("paused", on && sp === 0);
  }
}
export function setDockActive(key) {
  for (const d of DRAWERS) refs["dock_" + d.key]?.classList.toggle("on", d.key === key);
}
export function setDockBadge(key, n) {
  const b = refs["dock_" + key];
  if (!b) return;
  b.querySelector(".badge")?.remove();
  if (n) b.append(h("span.badge", n > 9 ? "9+" : String(n)));
}

export function renderObjective() {
  const box = $("#objective");
  const ob = G?.campaign.objectives?.[0];
  if (!ob) return box.classList.add("hidden");
  box.classList.remove("hidden");
  mount(box,
    h("div.ch", ob.chapter),
    h("div.tt", ob.title),
    h("ul", ob.items.map((it) => h(`li${it.done ? ".done" : ""}`, it.text))),
    ob.hint ? h("div.hint", ob.hint) : null,
  );
  box.onclick = () => emit("ui:objective", ob);
}

let bound = false;
export function bindHud() {
  if (bound) return;
  bound = true;
  on("time", () => updateHud());
  on("cash", () => updateHud());
  on("travel:end", () => updateHud());
  on("article:published", () => updateHud());
  on("speed", syncSpeed);
  on("hold", syncSpeed);
  on("objective", renderObjective);
  on("llm:status", () => refs.llm?.classList.toggle("on", llm.online));
  on("llm:busy", (n) => refs.llm?.classList.toggle("busy", n > 0));
  refs.llm?.classList.toggle("on", llm.online);
  document.addEventListener("keydown", (e) => {
    if (!G || $("#screen-game").classList.contains("hidden")) return;
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
    if (modalOpen() || isHeld()) return;
    if (e.code === "Space") {
      e.preventDefault();
      setSpeed(G.time.speed ? 0 : G.time.lastSpeed || 1);
    } else if (["Digit1", "Digit2", "Digit3"].includes(e.code)) setSpeed(Number(e.code.slice(5)));
    else if (e.key === "Escape") emit("ui:escape");
  });
  on("speed", (s) => {
    if (s) G.time.lastSpeed = s;
  });
}
