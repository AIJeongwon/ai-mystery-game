// 왼쪽 서랍 — 단서 / 세계(일정·의제) / 내 기사 / 순위 / 메뉴
import { G, saveGame, exportSave, deleteSave } from "../core/store.js";
import { on, emit } from "../core/bus.js";
import { fmtDate, fmtAgo, fmtNum, fmtWon, fmtDuration, by } from "../core/util.js";
import { h, $, mount, icon, chip, bar, modal, toast, confirmDialog } from "./dom.js";
import { CATS, OUTLETS, HOME } from "../data/world.js";
import { STAGES } from "../data/templates.js";
import { knownEvents, cname, cfull, rivalCount, outletName } from "../sim/world.js";
import { factSummary } from "../sim/press.js";
import { ranking } from "../sim/rivals.js";
import { showEvent, glyphEl, stageChip, agendaCard, sideState } from "./detail.js";
import { articlePaper, openEditor } from "./editor.js";
import { setDockActive, setDockBadge } from "./hud.js";
import { renderManage, renderCanon } from "./manage.js";
import { renderCase } from "./casefile.js";
import { setMode, flyTo } from "./map.js";
import { volumes, setVolume, sfx } from "../audio.js";
import { llm } from "../llm/api.js";

// 서랍마다 그리는 함수. 서랍 목록은 ui/drawers.js에 있다. (메뉴는 서랍이 아니라 창으로 열린다)
const RENDER = { leads: renderLeads, world: renderWorld, articles: renderArticles, rank: renderRank, manage: renderManage, canon: renderCanon, case: renderCase };

const dr = { open: null, leadFilter: "all", tab: {} };
export const drawerState = dr;
const root = () => $("#drawer");

export function openDrawer(key) {
  if (key === "menu") return openMenu();
  if (dr.open === key) return closeDrawer();
  dr.open = key;
  root().classList.remove("hidden");
  document.body.classList.add("drawer-open");
  setDockActive(key);
  renderDrawer(true);
}
export function closeDrawer() {
  dr.open = null;
  root().classList.add("hidden");
  document.body.classList.remove("drawer-open");
  setDockActive(null);
}
export function renderDrawer(reset = false) {
  if (!dr.open || !G) return;
  const el = root();
  const keep = reset ? 0 : el.querySelector(".panel-body")?.scrollTop ?? 0;
  const ctx = { tab: dr.tab, rerender: () => renderDrawer(), setTab: (k, v) => { dr.tab[k] = v; renderDrawer(true); } };
  RENDER[dr.open]?.(el, ctx);
  const b = el.querySelector(".panel-body");
  if (b) b.scrollTop = keep;
}
export function head(title, sub, extra) {
  return h("div.panel-head", h("div.grow", h("h3", title), sub ? h("div.sub", sub) : null), extra, h("button.icon-btn", { onclick: closeDrawer, title: "닫기" }, icon("close")));
}

// ═════════ 단서 ═════════
function leadRow(ev) {
  const fs = factSummary(ev);
  const rc = rivalCount(ev);
  return h(`div.lead${sideState.id === ev.id ? ".sel" : ""}${!ev.seen ? ".new" : ""}${ev.campaign ? ".campaign" : ""}`, { onclick: () => { showEvent(ev.id); renderDrawer(); } },
    glyphEl(ev),
    h("div", h("div.ttl", ev.title),
      h("div.meta", stageChip(ev), h("span", `${cname(ev.country)} ${ev.city}`),
        h("span.heat", { title: `관심도 ${Math.round(ev.heat)}` }, bar(ev.heat, 100, ev.heat > 60 ? "red" : "amber")),
        fs.known ? h("span", { style: { color: "var(--teal)" } }, `수첩 ${fs.known}/${fs.total}`) : null,
        rc ? h("span", `경쟁 ${rc}`) : ev.stage <= 1 ? h("span", { style: { color: "var(--amber)" } }, "미보도") : null,
        ev.cov.player ? h("span", { style: { color: "var(--red)" } }, "보도함") : null)));
}
function renderLeads(el) {
  const all = knownEvents().filter((e) => e.stage < 4);
  const filters = [["all", "전체"], ["home", "국내"], ["abroad", "해외"], ["mine", "취재 중"], ["rumor", "소문"]];
  const f = dr.leadFilter;
  let list = all.filter((e) => (f === "home" ? e.country === HOME : f === "abroad" ? e.country !== HOME : f === "mine" ? factSummary(e).known > 0 : f === "rumor" ? e.stage === 0 : true));
  list.sort((a, b) => (b.campaign ? 1e6 : 0) - (a.campaign ? 1e6 : 0) || (a.seen ? 1 : 0) - (b.seen ? 1 : 0) || b.heat - a.heat);
  mount(el,
    head("단서", `포착한 사건 ${all.length}건`),
    h("div.panel-body",
      h("div.filterbar", filters.map(([k, label]) => h(`button${f === k ? ".on" : ""}`, { onclick: () => { dr.leadFilter = k; renderDrawer(true); } }, label))),
      list.length ? list.map(leadRow) : h("div.empty", f === "all" ? "아직 포착한 사건이 없다.\n시간을 흘려보내면 소식이 들어온다." : "해당하는 사건이 없다."),
      h("button.btn.ghost", { onclick: () => openEditor(null) }, icon("pen", 15), "칼럼 쓰기")));
  setDockBadge("leads", all.filter((e) => !e.seen).length);
}

// ═════════ 세계: 일정표 · 의제 · 흐름 ═════════
function renderWorld(el, ctx) {
  const tab = ctx.tab.world || "sched";
  const body = h("div.panel-body");
  if (tab === "sched") {
    const list = G.world.schedule.filter((s) => !s.done && s.at > G.time.min).slice(0, 14);
    body.append(h("div.muted", { style: { fontSize: "12.5px", lineHeight: 1.6 } }, "예고된 일정은 모든 매체가 안다. 미리 현지에 가 있으면 남보다 깊이 취재할 수 있다."));
    if (!list.length) body.append(h("div.empty", "예고된 일정이 없다."));
    for (const s of list) {
      body.append(h("div.card.click", { onclick: () => flyTo(s.city[1], s.city[2]) },
        h("div.row.between", h("b", { style: { fontSize: "13.5px" } }, s.title), chip(CATS[s.cat].ko, "gray")),
        h("div.muted", { style: { fontSize: "12px", marginTop: "3px" } }, `${fmtDate(s.at, { short: true })} · ${cfull(s.country)} ${s.city[0]} · ${fmtDuration(s.at - G.time.min)} 뒤`)));
    }
  } else if (tab === "agenda") {
    const ags = Object.values(G.world.agendas).sort((a, b) => (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0) || (b.country === HOME ? 1 : 0) - (a.country === HOME ? 1 : 0) || b.heat - a.heat);
    const groups = [["국내 의제", ags.filter((a) => a.country === HOME)], ["세계 의제", ags.filter((a) => !a.country)], ["각국 의제", ags.filter((a) => a.country && a.country !== HOME)]];
    for (const [label, list] of groups) body.append(h("div.sect", h("h4", label), list.map((ag) => h("div", ag.country && ag.country !== HOME ? h("div.dim", { style: { fontSize: "11px", marginBottom: "2px" } }, cfull(ag.country)) : null, agendaCard(ag)))));
  } else {
    body.append(h("div.sect", h("h4", "분야별 관심 흐름"),
      Object.entries(CATS).map(([k, c]) => h("div", { style: { display: "grid", gridTemplateColumns: "76px 1fr 44px", gap: "8px", alignItems: "center", fontSize: "13px" } },
        h("span", { style: { color: c.color, fontWeight: 700 } }, c.ko), h("div.bar", h("i", { style: { width: `${((G.world.trends[k] - 0.6) / 1.1) * 100}%`, background: c.color } })), h("b.num", { style: { textAlign: "right" } }, `×${G.world.trends[k].toFixed(2)}`)))),
      h("div.dim", { style: { fontSize: "12px", lineHeight: 1.6 } }, "관심이 몰린 분야의 기사는 더 많이 읽힌다."));
    body.append(h("div.sect", h("h4", "최근 종결된 사건"),
      G.world.history.slice(-10).reverse().map((x) => h("div.card", { style: { padding: "8px 11px" } }, h("div", { style: { fontWeight: 700, fontSize: "13px" } }, x.title), h("div.muted", { style: { fontSize: "12px" } }, `${cname(x.country)} · ${x.out}`)))));
  }
  mount(el, head("세계", "일정표와 의제"),
    h("div.tabs", [["sched", "일정표"], ["agenda", "의제"], ["trend", "흐름"]].map(([k, label]) => h(`button${tab === k ? ".on" : ""}`, { onclick: () => ctx.setTab("world", k) }, label))),
    body);
}

// ═════════ 내 기사 ═════════
function renderArticles(el) {
  const arts = G.outlet.articles.slice(-60).reverse();
  const t = G.outlet.totals;
  mount(el, head("내 기사", `발행 ${t.articles}건 · 단독 ${t.scoops}건`),
    h("div.panel-body",
      h("div.grid3",
        h("div.bigstat", h("label", "누적 조회수"), h("b", fmtNum(t.views))),
        h("div.bigstat", h("label", "누적 매출"), h("b", fmtWon(t.revenue))),
        h("div.bigstat", h("label", "오늘 조회수"), h("b", fmtNum(G.outlet.today.views)))),
      arts.length ? arts.map((a) => h("div.card.click", { onclick: () => openArticle(a) },
        h("div.row.wrap", { style: { marginBottom: "3px" } },
          a.scoop ? chip("단독", "red") : null, a.decree ? chip("記定", "red") : null, a.auto ? chip(`${a.by}`, "gray") : null,
          a.falseClaims?.length && a.settled ? chip("정정", "red") : null, chip(CATS[a.cat].ko, "gray")),
        h("div", { style: { fontWeight: 700, fontSize: "13.5px", lineHeight: 1.4 } }, a.headline),
        h("div.row.between", { style: { marginTop: "5px", fontSize: "12px", color: "var(--text-3)" } },
          h("span", fmtAgo(G.time.min, a.at)), h("span.num", `${fmtNum(a.done)} / ${fmtNum(a.plan)}회`), h("span.num.gold", fmtWon(a.rev))),
        h("div", { style: { marginTop: "4px" } }, bar(a.done, Math.max(1, a.plan), a.tick >= 96 ? "" : "gold"))))
        : h("div.empty", "아직 발행한 기사가 없다.")));
}
function openArticle(a) {
  if (a.auto) return toast(`${a.by} 기자의 단신이다.`, "info");
  modal({
    title: "발행 기사", eyebrow: fmtDate(a.at), cls: "wide",
    body: h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } }, articlePaper(a),
      h("div.grid3",
        h("div.bigstat", h("label", "조회수"), h("b", fmtNum(a.done)), h("small", `예상 ${fmtNum(a.plan)}`)),
        h("div.bigstat", h("label", "수익"), h("b", fmtWon(a.rev)), h("small", `신규 구독 ${fmtNum(a.newSubs)}`)),
        h("div.bigstat", h("label", "종합 품질"), h("b", a.scores.Q.toFixed(1)), h("small", `정확 ${a.scores.acc} · 문장 ${a.scores.wri} · 제목 ${a.scores.head}`))),
      a.comment ? h("div.card", h("div.eyebrow", "데스크 평"), h("div.serif", { style: { marginTop: "4px", lineHeight: 1.7 } }, `"${a.comment}"`)) : null,
      a.settled && a.falseClaims?.length ? h("div.card", { style: { borderColor: "rgba(226,69,47,.5)" } }, h("div.eyebrow", { style: { color: "var(--red)" } }, "사실과 달랐던 대목"), a.falseClaims.map((c) => h("div", { style: { marginTop: "4px" } }, `· ${c}`))) : null),
    buttons: [{ label: "닫기", primary: true }],
  });
}

// ═════════ 순위 ═════════
function renderRank(el) {
  const rows = ranking();
  mount(el, head("언론사 순위", "독자 규모와 신뢰도로 매긴 영향력",
    h("button.btn.small", { onclick: () => setMode("share"), title: "지도에서 나라별 1위 매체 보기" }, icon("layers", 14), "판도")),
    h("div.panel-body",
      h("table.tbl",
        h("thead", h("tr", h("th", "#"), h("th", "매체"), h("th.r", "독자"), h("th.r", "신뢰"), h("th.r", "영향력"))),
        h("tbody", rows.map((r, i) => {
          const o = OUTLETS[r.id];
          return h(`tr${r.id === "player" ? ".me" : ""}`, { style: { cursor: r.id === "player" ? "default" : "pointer" }, onclick: () => r.id !== "player" && openOutlet(r.id) },
            h("td", String(i + 1)),
            h("td", h("span.dotc", { style: { background: o.color } }), h("b", outletName(r.id)), r.id !== "player" ? h("div.dim", { style: { fontSize: "11px", marginLeft: "17px" } }, o.city) : null),
            h("td.r", fmtNum(r.readers)), h("td.r", r.cred.toFixed(0)), h("td.r", fmtNum(r.influence)));
        }))),
      h("div.dim", { style: { fontSize: "12px", lineHeight: 1.6 } }, "영향력 = √독자 × 신뢰도 보정. 매체를 누르면 소개를 볼 수 있다.")));
}
function openOutlet(id) {
  const o = OUTLETS[id];
  const r = G.rivals[id];
  modal({
    title: o.name, eyebrow: `${o.city} 본사`, cls: "small",
    body: h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
      h("div.summary", o.desc),
      h("div.kv", h("dt", "신뢰도"), h("dd", r.cred.toFixed(0)), h("dt", "속보력"), h("dd", "●".repeat(Math.round(o.speed * 5))), h("dt", "심층 취재력"), h("dd", "●".repeat(Math.max(1, Math.round(o.depth * 5)))),
        h("dt", "선정성"), h("dd", "●".repeat(Math.max(1, Math.round(o.tone * 5)))), h("dt", "보도 건수"), h("dd", String(r.articles)), h("dt", "단독"), h("dd", String(r.scoops)))),
    buttons: [{ label: "닫기", primary: true }],
  });
}

// ═════════ 메뉴 ═════════
function openMenu() {
  const v = volumes();
  const slider = (kind, label) => h("div.field", h("label", label), h("input", { type: "range", min: 0, max: 100, value: Math.round(v[kind] * 100), oninput: (e) => { setVolume(kind, e.target.value / 100); if (kind === "sfx") sfx("click"); } }));
  const m = modal({
    title: "메뉴", cls: "small",
    body: h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      h("div.card", h("div.kv", h("dt", "기자"), h("dd", G.meta.reporter), h("dt", "매체"), h("dd", G.meta.outlet), h("dt", "게임 시간"), h("dd", fmtDate(G.time.min)),
        h("dt", "LLM"), h("dd", llm.online ? `${llm.model} 연결됨` : "오프라인 (규칙 모드)"))),
      slider("sfx", "효과음"), slider("music", "배경 음악"),
      h("button.btn.block", { onclick: () => { saveGame() ? toast("저장했다.", "good") : toast("저장에 실패했다.", "bad"); } }, icon("save", 15), "지금 저장"),
      h("button.btn.block", {
        onclick: () => {
          const blob = new Blob([exportSave()], { type: "application/json" });
          const a = h("a", { href: URL.createObjectURL(blob), download: `기정사실_${G.meta.outlet}.json` });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        },
      }, icon("doc", 15), "세이브 파일로 내보내기"),
      h("button.btn.block", { onclick: () => { m.close(); emit("ui:help"); } }, icon("info", 15), "도움말"),
      h("button.btn.block.danger", {
        onclick: async () => {
          if (await confirmDialog("저장하고 타이틀 화면으로 돌아갑니다.", { title: "타이틀로", yes: "돌아가기" })) {
            m.close();
            saveGame();
            emit("ui:title");
          }
        },
      }, icon("home", 15), "저장하고 타이틀로")),
    buttons: [{ label: "계속하기", primary: true }],
  });
  void deleteSave;
  void by;
  void STAGES;
}

let bound = false;
export function bindPanels() {
  if (bound) return;
  bound = true;
  on("ui:drawer", (key) => openDrawer(key));
  on("ui:escape", () => dr.open && sideState.mode === "feed" && closeDrawer());
  on("tick", () => renderDrawer());
  on("lead:new", () => { if (dr.open === "leads") renderDrawer(); else setDockBadge("leads", knownEvents().filter((e) => e.stage < 4 && !e.seen).length); });
  on("side:changed", () => dr.open === "leads" && renderDrawer());
  for (const evt of ["staff", "upgrade", "bureau", "tier", "skill", "canon:enacted", "canon:ended", "canon:upgrade", "canon:reverted", "canon:planted", "evidence", "article:published", "day:settled", "casefile"]) on(evt, () => renderDrawer());
}
