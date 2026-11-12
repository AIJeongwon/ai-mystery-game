// 오른쪽 패널 — 뉴스 와이어 / 사건 상세 / 국가 상세
import { G } from "../core/store.js";
import { on, emit } from "../core/bus.js";
import { fmtTime, fmtAgo, fmtWon, fmtNum, fmtPct, fmtDuration, fmtDate, dayIndex } from "../core/util.js";
import { h, $, mount, icon, chip, bar, toast, confirmDialog, portraitUrl } from "./dom.js";
import { REGIONS } from "../data/countries.js";
import { CATS, OUTLETS, RIVAL_IDS, HOME } from "../data/world.js";
import { STAGES, SIG_LABEL, STANCE_KO, DEPTH_KO } from "../data/templates.js";
import { C, cd, cname, cfull, audience, presence, playerHere, actorsOf, agendasOf, knownEvents, outletName, actor } from "../sim/world.js";
import {
  notes, factSummary, deskResearch, fieldWork, canField, digInfo, deepDig, travelInfo, travelTo,
  canOpenBureau, openBureau, bureauCost,
} from "../sim/press.js";
import { selectEvent, selectCountry, flyTo, focusCountry, animateTravel, markDirty } from "./map.js";
import { hold, release } from "../sim/clock.js";
import { openInterview } from "./interview.js";
import { openEditor } from "./editor.js";
import { sfx } from "../audio.js";

const side = { mode: "feed", id: null, fresh: new Set() };
export const sideState = side;
const root = () => $("#side");

export function glyphEl(ev) {
  const cat = CATS[ev.cat];
  if (ev.campaign) return h("div.glyph.sq", "定");
  if (ev.stage === 0) return h("div.glyph.rumor", { style: { color: cat.color, borderColor: cat.color } }, "?");
  return h("div.glyph", { style: { background: cat.color } }, cat.glyph);
}
export const stageChip = (ev) => chip(STAGES[ev.stage].ko, "", { color: STAGES[ev.stage].color, borderColor: STAGES[ev.stage].color });

// ═════════ 와이어 ═════════
function feedItem(it) {
  const o = it.outlet && OUTLETS[it.outlet];
  const ev = it.ev && G.world.events[it.ev];
  const clickable = Boolean(ev?.known);
  let src = null;
  if (it.kind === "rival" && o) src = h("span.src", { style: { color: o.color } }, o.short);
  else if (it.kind === "mine") src = h("span.src", { style: { color: "var(--red)" } }, G.meta.outlet);
  else if (it.kind === "canon") src = h("span.src", "記定");
  else if (it.kind === "sys") src = h("span.src", "알림");
  else if (it.kind === "lead") src = h("span.src", { style: { color: "var(--amber)" } }, "제보");
  return h(`div.feed-item.k-${it.kind}${clickable ? ".click" : ""}`, { onclick: clickable ? () => showEvent(ev.id) : null },
    h("time", fmtTime(it.t)),
    h("div", src, it.scoop ? h("span.scoop", "") : null, it.text));
}
function renderFeed() {
  const items = G.world.feed.slice(-90).reverse();
  let lastDay = null;
  const rows = [];
  for (const it of items) {
    const d = dayIndex(it.t);
    if (lastDay !== null && d !== lastDay) rows.push(h("div.feed-item", { style: { color: "var(--text-3)", fontSize: "11px", gridTemplateColumns: "1fr" } }, `— ${fmtDate(it.t, { md: true })} —`));
    lastDay = d;
    rows.push(feedItem(it));
  }
  mount(root(),
    h("div.panel-head", icon("bolt", 18), h("div.grow", h("h3", "뉴스 와이어"), h("div.sub", "세계의 속보와 경쟁사 보도"))),
    h("div.panel-body", { style: { padding: 0, gap: 0 } }, rows.length ? h("div.feed", rows) : h("div.empty", "아직 들어온 소식이 없다.")),
  );
}

// ═════════ 사건 상세 ═════════
function factCard(ev, f, n) {
  const st = n.st;
  const tags = [chip(DEPTH_KO[f.depth], f.depth === 3 ? "red" : f.depth === 2 ? "gold" : f.depth === 1 ? "teal" : "gray")];
  if (st === "confirmed") tags.push(chip("확인", "green"));
  else if (st === "heard") tags.push(chip("전언 · 미확인", "gold"));
  else tags.push(chip("사실 아님", "red"));
  const fresh = side.fresh.has(ev.id + f.id);
  return h(`div.fact.d${f.depth}.${st}${fresh ? ".isnew" : ""}`, h("div.tags", tags), h("div.txt", f.text));
}
function unknownLine(ev) {
  const nb = notes(ev.id);
  const miss = [0, 0, 0, 0];
  for (const f of ev.facts) if (f.true && !nb[f.id]) miss[f.depth]++;
  const parts = miss.map((n, d) => (n ? `${DEPTH_KO[d]} ${n}` : null)).filter(Boolean);
  if (!parts.length) return h("div.fact.unknown", "이 사건의 사실을 모두 확보했다.");
  return h("div.fact.unknown", `아직 모르는 것 — ${parts.join(" · ")}`);
}

async function doTravel(dest, after) {
  const info = travelInfo(dest);
  if (G.outlet.cash < info.cost) return toast(`출장비가 모자란다. (${fmtWon(info.cost)} 필요)`, "bad");
  const ok = await confirmDialog(`${cfull(dest)} ${C(dest).cap}(으)로 이동한다.\n\n거리 ${Math.round(info.km).toLocaleString()}km · 소요 ${fmtDuration(info.mins)} · 비용 ${fmtWon(info.cost)}\n\n이동하는 동안에도 세상은 돌아간다.`, { title: "출장", yes: "출발" });
  if (!ok) return;
  hold();
  const from = G.player.loc;
  const banner = $("#travel-banner");
  mount(banner, icon("plane", 18), `${cname(from)} → ${cname(dest)} 이동 중…`);
  banner.classList.remove("hidden");
  sfx("whoosh");
  await animateTravel(from, dest);
  travelTo(dest);
  banner.classList.add("hidden");
  release();
  focusCountry(dest);
  toast(`${cfull(dest)} ${C(dest).cap}에 도착했다. (${fmtDuration(info.mins)} 경과)`, "gold");
  markDirty();
  after?.();
  render();
}
export { doTravel };

function renderEvent(ev) {
  const cat = CATS[ev.cat];
  const nb = notes(ev.id);
  const sum = factSummary(ev);
  const here = playerHere(ev.country);
  const cf = canField(ev);
  const closed = ev.stage >= 4;
  const rivals = Object.entries(ev.cov).filter(([k]) => k !== "player");

  const head = h("div.detail-head",
    h("div.row.between",
      h("div.row.wrap", chip(cat.ko, "solid", { background: cat.color }), stageChip(ev), chip(`${SIG_LABEL[ev.sig]} 뉴스`, "gray"), ev.campaign ? chip("캠페인", "red") : null),
      h("button.icon-btn", { title: "와이어로 돌아가기 (Esc)", onclick: () => showFeed() }, icon("close"))),
    h("h3", ev.title),
    h("div.where", h("span", icon("pin", 13), ` ${cfull(ev.country)} ${ev.city}`), h("span", `포착 ${fmtAgo(G.time.min, ev.knownAt ?? ev.born)}`),
      h("span.row", { style: { gap: "5px" } }, "관심도", h("div", { style: { width: "70px" } }, bar(ev.heat, 100, ev.heat > 60 ? "red" : "amber")))),
  );

  const body = h("div.panel-body");
  body.append(h("div.summary", ev.summary));
  if (ev.devs?.length) body.append(h("div.sect", h("h4", "경과"), ev.devs.map((d) => h("div.dev", h("time", fmtDate(d.t, { short: true })), h("span", { style: { color: STAGES[d.stage].color, fontWeight: 700 } }, STAGES[d.stage].ko), h("p", d.text)))));
  if (closed && ev.outcome) body.append(h("div.card", h("div.eyebrow", "종결"), h("div", { style: { marginTop: "4px" } }, ev.outcome.text)));

  // 경쟁 보도
  body.append(h("div.sect", h("h4", "경쟁 보도"),
    rivals.length
      ? h("div.cov", rivals.map(([rid, cv]) => h("span.o", { style: { color: OUTLETS[rid].color, borderColor: OUTLETS[rid].color }, title: `${DEPTH_KO[Math.max(0, cv.depth)]}까지 보도` }, OUTLETS[rid].short, "●".repeat(Math.max(1, cv.depth + 1)))))
      : h("div.muted", { style: { fontSize: "12.5px" } }, ev.stage === 0 ? "아직 어느 매체도 모른다. 먼저 쓰면 단독이다." : "아직 보도한 매체가 없다.")));

  // 취재 행동
  if (!closed) {
    const di = digInfo(ev);
    const acts = h("div.actions");
    acts.append(h(`button.act${ev.deskDone ? ".done" : ""}`, {
      onclick: () => {
        const r = deskResearch(ev);
        sfx(r.got.length ? "fact" : "page");
        toast(r.got.length ? `자료 조사: 사실 ${r.got.length}건을 수첩에 적었다. (${fmtDuration(r.mins)})` : `자료 조사: 새로 나온 것이 없다. (${fmtDuration(r.mins)})`, r.got.length ? "good" : "info");
        render();
      },
    }, h("b", icon("search", 15), "자료 조사"), h("small", "공개 자료·온라인 검색 · 45분")));
    if (cf.ok) {
      acts.append(h(`button.act${ev.fieldDone ? ".done" : ""}`, {
        onclick: () => {
          const r = fieldWork(ev);
          sfx(r.got.length ? "fact" : "page");
          toast(`${r.proxy ? "현지 인력의 현장 확인" : "현장 취재"}: 사실 ${r.got.length}건 확보${r.debunked ? " · 떠돌던 소문 하나가 거짓으로 확인됐다" : ""} (${fmtDuration(r.mins)})`, r.got.length ? "good" : "info");
          render();
        },
      }, h("b", icon("eye", 15), cf.proxy ? "현지 인력 투입" : "현장 취재"), h("small", cf.proxy ? "지국·파견 기자가 대신 확인 · 2시간 반" : "직접 보고 듣는다 · 1시간 반")));
    } else {
      const ti = travelInfo(ev.country);
      acts.append(h("button.act", { onclick: () => doTravel(ev.country) }, h("b", icon("plane", 15), `${cname(ev.country)}(으)로 이동`), h("small", `현장 취재에 필요 · ${fmtDuration(ti.mins)} · ${fmtWon(ti.cost)}`)));
    }
    acts.append(h("button.act.wide", {
      disabled: !di.ok || G.outlet.cash < di.cost,
      title: di.ok ? "" : di.left <= 0 ? "이 사건은 더 팔 수 있는 만큼 팠다" : "확인된 사실이 2건 이상(현장 사실 포함) 있어야 한다",
      onclick: () => {
        const r = deepDig(ev);
        if (!r) return;
        sfx(r.got.length ? "fact" : "page");
        toast(r.got.length ? `심층 추적: 문서로 ${r.got.length}건을 확인했다.${r.debunked ? " 소문 하나는 거짓이었다." : ""}` : `심층 추적: 이번에는 결정적인 것을 건지지 못했다.${r.debunked ? " 다만 소문 하나가 거짓임을 확인했다." : ""}`, r.got.length ? "good" : "info");
        render();
      },
    }, h("b", icon("doc", 15), "심층 추적"), h("small", `문서·자금 흐름을 추적해 내부 사정을 확인한다 · ${fmtDuration(di.mins)} · ${fmtWon(di.cost)} · 남은 횟수 ${di.left}`)));
    body.append(h("div.sect", h("h4", "취재"), acts));
  }

  // 취재원
  if (ev.sources.length) {
    body.append(h("div.sect", h("h4", `취재원 ${ev.sources.length}명`),
      ev.sources.map((s) => {
        const onsite = here;
        const blocked = closed || (s.onsiteOnly && !onsite);
        const done = s.turns >= 1 && s.ended;
        return h("div.src-row",
          h("img", { src: portraitUrl(s.portrait, true), alt: "", loading: "lazy" }),
          h("div", h("div.nm", s.name, " ", chip(STANCE_KO[s.stance], s.stance === "friendly" ? "green" : s.stance === "hostile" ? "red" : "gray")), h("div.rl", s.role),
            s.trust != null ? h("div.row", { style: { marginTop: "4px", gap: "6px", fontSize: "11px", color: "var(--text-3)" } }, "신뢰", h("div", { style: { width: "80px" } }, bar(s.trust, 100, "teal"))) : null),
          h("button.btn.small", {
            disabled: blocked, title: blocked && !closed ? "직접 찾아가야만 만나 주는 사람이다" : "",
            onclick: () => openInterview(ev, s, onsite, () => render()),
          }, icon(onsite ? "talk" : "phone", 14), done ? "다시" : onsite ? "인터뷰" : "전화"));
      })));
  }

  // 수첩
  const known = ev.facts.filter((f) => nb[f.id]).sort((a, b) => a.depth - b.depth);
  body.append(h("div.sect", h("h4", `취재 수첩 · ${sum.known}/${sum.total}`),
    known.length ? known.map((f) => factCard(ev, f, nb[f.id])) : h("div.muted", { style: { fontSize: "12.5px" } }, "아직 적은 것이 없다. 자료 조사부터 시작하자."),
    unknownLine(ev)));

  const foot = h("div.detail-foot",
    h("button.btn.ghost", { title: "지도에서 보기", onclick: () => flyTo(ev.lon, ev.lat) }, icon("pin", 15)),
    h("button.btn.primary.grow", {
      id: "btn-write", disabled: closed || !known.length,
      title: closed ? "종결된 사건이다" : !known.length ? "사실을 하나 이상 확보해야 기사를 쓸 수 있다" : "",
      onclick: () => openEditor(ev, () => render()),
    }, icon("pen", 16), "기사 쓰기"));

  mount(root(), head, body, foot);
  side.fresh.clear();
}

// ═════════ 국가 상세 ═════════
function statRow(label, value, cls, note) {
  return h("div", { style: { display: "grid", gridTemplateColumns: "76px 1fr 34px", gap: "8px", alignItems: "center", fontSize: "12.5px" }, title: note || "" },
    h("span.muted", label), bar(value, 100, cls), h("b.num", { style: { textAlign: "right" } }, Math.round(value)));
}
function renderCountry(id) {
  const c = C(id);
  const d = cd(id);
  const p = presence(id);
  const A = audience(id);
  const shares = [["player", d.my], ...RIVAL_IDS.map((r) => [r, d.share[r] || 0])].filter((x) => x[1] > 0.0004).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const acts = actorsOf(id);
  const ags = agendasOf(id);
  const evs = knownEvents().filter((e) => e.country === id && e.stage < 4);
  const here = playerHere(id);
  const ti = here ? null : travelInfo(id);
  const bchk = canOpenBureau(id);

  const head = h("div.detail-head",
    h("div.row.between",
      h("div.row.wrap", chip(REGIONS[c.region], "gray"), here ? chip("현재 위치", "gold") : null, id === HOME ? chip("본사", "red") : G.outlet.bureaus.includes(id) ? chip("지국", "red") : null),
      h("button.icon-btn", { onclick: () => showFeed() }, icon("close"))),
    h("h3", c.ko),
    h("div.where", h("span", `수도 ${c.cap}`), h("span", `인구 ${c.pop >= 1 ? fmtNum(c.pop * 1e6) : fmtNum(c.pop * 1e6)}`), h("span", `뉴스 독자층 ${fmtNum(A)}`)),
  );
  const body = h("div.panel-body",
    h("div.sect", h("h4", "나라 사정"),
      statRow("정치 안정", d.stab, "teal"), statRow("정부 지지", d.appr, "green"), statRow("경기", d.econ, "gold"),
      statRow("대외 긴장", d.tens, "red"), statRow("언론 자유", c.press, "violet"), statRow("세계의 관심", d.attn, "amber")),
    h("div.sect", h("h4", "언론 판도"),
      shares.length ? shares.map(([oid, s]) => h("div", { style: { display: "grid", gridTemplateColumns: "92px 1fr 52px", gap: "8px", alignItems: "center", fontSize: "12.5px" } },
        h("span", { style: { color: oid === "player" ? "var(--red)" : OUTLETS[oid].color, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, outletName(oid)),
        h("div.bar", h("i", { style: { width: `${Math.min(100, s * 320)}%`, background: oid === "player" ? "var(--red)" : OUTLETS[oid].color } })),
        h("b.num", { style: { textAlign: "right" } }, fmtPct(s, s < 0.01 ? 2 : 1))))
        : h("div.muted", { style: { fontSize: "12.5px" } }, "지역 매체가 시장을 나눠 갖고 있다."),
      h("div.dim", { style: { fontSize: "11.5px" } }, `내 독자 ${fmtNum(d.my * A)}명 (${fmtPct(d.my, 3)})`)),
    acts.length ? h("div.sect", h("h4", "주요 행위자"), acts.slice(0, 6).map((a) => h("div.card", { style: { padding: "8px 11px" } },
      h("div.row.between", h("b", a.name), h("span.dim", { style: { fontSize: "11.5px" } }, `평판 ${Math.round(a.rep)}`)), h("div.muted", { style: { fontSize: "12px" } }, a.role)))) : null,
    ags.length ? h("div.sect", h("h4", "의제"), ags.map((ag) => agendaCard(ag))) : null,
    h("div.sect", h("h4", `진행 중인 사건 ${evs.length}`),
      evs.length ? evs.map((ev) => h("div.lead", { onclick: () => showEvent(ev.id) }, glyphEl(ev), h("div", h("div.ttl", ev.title), h("div.meta", stageChip(ev), h("span", ev.city)))))
        : h("div.muted", { style: { fontSize: "12.5px" } }, p >= 1 ? "지금 포착된 사건이 없다." : "이 나라에는 눈과 귀가 없다. 큰 사건만 통신을 타고 들어온다.")),
  );
  const foot = h("div.detail-foot",
    !here ? h("button.btn.grow", { onclick: () => doTravel(id) }, icon("plane", 15), "이동", h("span.sub", `${fmtDuration(ti.mins)} · ${fmtWon(ti.cost)}`)) : null,
    id !== HOME && !G.outlet.bureaus.includes(id)
      ? h("button.btn.grow", {
          disabled: !bchk.ok, title: bchk.ok ? "지국을 열면 이 나라의 소문이 들어오고, 현지 독자에게 기사가 닿는다" : bchk.why,
          onclick: async () => {
            if (await confirmDialog(`${c.ko} ${c.cap}에 지국을 연다.\n\n개설 비용 ${fmtWon(bchk.cost)} · 이후 매일 유지비가 든다.\n이 나라의 소문 단계 사건을 포착하고, 현지 독자에게 기사가 닿으며, 기자를 파견할 수 있다.`, { title: "지국 개설", yes: "개설" })) {
              if (openBureau(id)) {
                sfx("good");
                toast(`${c.ko} 지국을 열었다.`, "good");
                markDirty();
                render();
              }
            }
          },
        }, icon("flag", 15), "지국 개설", h("span.sub", fmtWon(bureauCost(id))))
      : null,
  );
  mount(root(), head, body, foot.children.length ? foot : null);
}
export function agendaCard(ag) {
  const acts = (ag.actors || []).map((id) => actor(id)?.name).filter(Boolean).slice(0, 3);
  return h("div.card", { style: { padding: "9px 11px" } },
    h("div.row.between", h("b", { style: { fontSize: "13.5px" } }, ag.title), chip(CATS[ag.cat].ko, "gray")),
    h("div.muted", { style: { fontSize: "12px", margin: "2px 0 6px" } }, ag.desc),
    h("div", { style: { display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "7px", alignItems: "center", fontSize: "11px" } },
      h("span.dim", ag.poles[1]), h("div.bar.amber", h("i", { style: { width: `${ag.progress}%` } })), h("span.dim", ag.poles[0])),
    ag.resolved ? h("div.gold", { style: { fontSize: "12px", marginTop: "5px" } }, `결착: ${ag.resolved.text}`) : acts.length ? h("div.dim", { style: { fontSize: "11.5px", marginTop: "5px" } }, acts.join(" · ")) : null);
}

// ═════════ 전환 ═════════
function render() {
  if (!G) return;
  const el = root();
  const keep = el.querySelector(".panel-body")?.scrollTop ?? 0;
  if (side.mode === "event" && G.world.events[side.id]) renderEvent(G.world.events[side.id]);
  else if (side.mode === "country" && cd(side.id)) renderCountry(side.id);
  else {
    side.mode = "feed";
    renderFeed();
    return;
  }
  const b = el.querySelector(".panel-body");
  if (b) b.scrollTop = keep;
}
export const renderSide = render;
export function showFeed() {
  side.mode = "feed";
  side.id = null;
  selectEvent(null);
  selectCountry(null);
  render();
  emit("side:changed", side);
}
export function showEvent(id, { fly = true } = {}) {
  const ev = G.world.events[id];
  if (!ev) return;
  const changed = side.id !== id;
  side.mode = "event";
  side.id = id;
  ev.seen = true;
  selectEvent(id);
  selectCountry(null);
  if (changed) {
    sfx("open");
    if (fly) flyTo(ev.lon, ev.lat, undefined, -60);
  }
  render();
  if (changed) root().querySelector(".panel-body").scrollTop = 0;
  emit("side:changed", side);
  emit("event:opened", ev);
}
export function showCountry(id) {
  if (!cd(id)) return;
  side.mode = "country";
  side.id = id;
  selectEvent(null);
  selectCountry(id);
  sfx("open");
  render();
  root().querySelector(".panel-body").scrollTop = 0;
  emit("side:changed", side);
}

let bound = false;
export function bindDetail() {
  if (bound) return;
  bound = true;
  on("map:event", (ev) => showEvent(ev.id, { fly: false }));
  on("map:country", (id) => showCountry(id));
  on("map:blank", () => side.mode !== "feed" && showFeed());
  on("ui:escape", () => side.mode !== "feed" && showFeed());
  on("feed", () => side.mode === "feed" && render());
  on("tick", () => side.mode !== "feed" && render());
  on("fact:new", (ev, f) => side.fresh.add(ev.id + f.id));
  on("fact:up", (ev, f) => side.fresh.add(ev.id + f.id));
  on("event:stage", (ev) => side.mode === "event" && side.id === ev.id && render());
  on("event:closed", (ev) => side.mode === "event" && side.id === ev.id && render());
  on("event:dev", (ev) => side.mode === "event" && side.id === ev.id && render());
  on("article:published", () => side.mode !== "feed" && render());
}
