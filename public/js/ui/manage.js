// 경영 화면과 記定 장부
import { G } from "../core/store.js";
import { emit } from "../core/bus.js";
import { fmtWon, fmtNum, fmtDuration, fmtDate, sum, clamp } from "../core/util.js";
import { h, mount, icon, chip, bar, toast, confirmDialog } from "./dom.js";
import { TIERS, UPGRADES, SKILLS, STAMP, ECON, BEATS, SLOT_COUNT, XP_PER_LEVEL, SCOPES } from "../data/progress.js";
import { HOME, OUTLETS } from "../data/world.js";
import { C, cname, cfull } from "../sim/world.js";
import { tierCheck, tierUp, upgradeCost, buyUpgrade, upLv, hire, fire, assign, raiseSkill, tierDef, closeBureau, refreshCandidates } from "../sim/press.js";
import { inkCap, stampUpgradeCost, upgradeStamp, retract, effectText, canonWhere } from "../sim/canon.js";
import { head } from "./panels.js";
import { focusCountry } from "./map.js";
import { sfx } from "../audio.js";

const pips = (n, max, cls = "") => h(`span.pips ${cls}`, Array.from({ length: max }, (_, i) => h(`i${i < n ? ".on" : ""}`)));

function spark(values) {
  if (values.length < 2) return h("div.dim", { style: { fontSize: "12px" } }, "하루가 지나면 장부가 쌓인다.");
  const w = 340, hh = 64, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${pad + (i / (values.length - 1)) * (w - pad * 2)},${hh - pad - ((v - min) / span) * (hh - pad * 2)}`);
  const el = h("div");
  el.innerHTML = `<svg class="spark" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none"><polyline points="${pts.join(" ")}" fill="none" stroke="#d2a95a" stroke-width="2" vector-effect="non-scaling-stroke"/><polygon points="${pad},${hh} ${pts.join(" ")} ${w - pad},${hh}" fill="rgba(210,169,90,.12)"/></svg>`;
  return el;
}
const lrow = (label, v, cls = "") => h(`div.ledger-row ${cls}`, h("span.muted", label), h("b", { style: { color: v < 0 ? "var(--red)" : "" } }, fmtWon(v)));

export function renderManage(el, ctx) {
  const tab = ctx.tab.manage || "over";
  const o = G.outlet;
  const body = h("div.panel-body");

  if (tab === "over") {
    const chk = tierCheck();
    const need = (label, s, fmt = fmtNum) => h("div.row.between", { style: { fontSize: "12.5px" } }, h("span", { style: { color: s.have >= s.need ? "var(--green)" : "var(--text-2)" } }, s.have >= s.need ? "✓ " : "· ", label), h("span.num.dim", `${fmt(s.have)} / ${fmt(s.need)}`));
    body.append(h("div.card",
      h("div.row.between", h("div", h("div.eyebrow", `등급 ${o.tier} / 5`), h("div.serif", { style: { fontSize: "19px", fontWeight: 900 } }, tierDef().name)), pips(o.tier, 5)),
      h("div.muted", { style: { fontSize: "12.5px", margin: "4px 0 8px" } }, tierDef().desc),
      chk ? h("div", { style: { borderTop: "1px solid var(--line)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "3px" } },
        h("div", { style: { fontSize: "12px", color: "var(--gold)", fontWeight: 700 } }, `다음: ${chk.next.name} — 기자 ${chk.next.staff}명 · 지국 ${chk.next.bureaus}곳 · 확산력 ×${chk.next.reach}`),
        chk.state.subs.need ? need("유료 구독", chk.state.subs) : null, chk.state.cred.need ? need("신뢰도", chk.state.cred) : null,
        chk.state.bureaus.need ? need("지국", chk.state.bureaus) : null, need("승격 비용", chk.state.cash, fmtWon),
        h("button.btn.gold.block", { style: { marginTop: "6px" }, disabled: !chk.ok, onclick: () => { if (tierUp()) { sfx("level"); toast(`${chk.next.name}(으)로 승격했다!`, "gold"); } } }, "승격"))
        : h("div.gold", { style: { fontSize: "13px" } }, "더 오를 곳이 없다.")));

    const t = o.today;
    const fixed = ECON.rentDaily[o.tier - 1] + sum(o.staff, (s) => s.salary) + sum(o.bureaus, (id) => ECON.bureauDaily(C(id).gdp));
    const subDaily = Math.floor(o.subs) * ECON.subFeeDaily;
    body.append(h("div.sect", h("h4", "오늘의 장부"),
      h("div.card", lrow("광고", t.ad), lrow("플랫폼 조회수 정산", t.plat), lrow("구독료 (자정 정산 예정)", subDaily),
        lrow("운영비·급여·지국 (자정 정산 예정)", -fixed), t.travel ? lrow("출장비", -t.travel) : null, t.invest ? lrow("투자·취재비", -t.invest) : null, t.legal ? lrow("법무 비용", -t.legal) : null,
        lrow("오늘 예상 손익", t.ad + t.plat + subDaily - fixed - t.travel - t.invest - t.legal, "total"))));
    const last = o.ledger.slice(-14);
    body.append(h("div.sect", h("h4", "자금 추이 (최근 14일)"), h("div.card", spark(last.map((r) => r.cash)),
      last.length ? h("div.row.between", { style: { fontSize: "12px", marginTop: "4px" } }, h("span.dim", `어제 손익 ${fmtWon(last[last.length - 1].net)}`), h("span.dim", `어제 조회수 ${fmtNum(last[last.length - 1].views)}`)) : null)));
    body.append(h("div.sect", h("h4", `지국 ${o.bureaus.length} / ${tierDef().bureaus}`),
      h("div.card", { style: { padding: "8px 11px" } }, h("div.row.between", h("b", "서울 본사"), h("span.dim", { style: { fontSize: "12px" } }, `운영비 ${fmtWon(ECON.rentDaily[o.tier - 1])}/일`))),
      o.bureaus.map((id) => h("div.card", { style: { padding: "8px 11px" } }, h("div.row.between",
        h("b", { style: { cursor: "pointer" }, onclick: () => focusCountry(id) }, `${cfull(id)} ${C(id).cap}`),
        h("div.row", h("span.dim", { style: { fontSize: "12px" } }, `${fmtWon(ECON.bureauDaily(C(id).gdp))}/일`),
          h("button.btn.small.ghost", { onclick: async () => { if (await confirmDialog(`${cfull(id)} 지국을 폐쇄합니까? 개설 비용은 돌려받지 못한다.`, { danger: true, yes: "폐쇄" })) { closeBureau(id); ctx.rerender(); } } }, "폐쇄"))))),
      tierDef().bureaus ? h("div.dim", { style: { fontSize: "12px", lineHeight: 1.6 } }, "지도에서 나라를 눌러 지국을 열 수 있다.") : h("div.dim", { style: { fontSize: "12px" } }, "'인터넷 신문' 등급부터 해외 지국을 열 수 있다.")));
  } else if (tab === "staff") {
    const cap = tierDef().staff;
    if (!o.candidates.length) refreshCandidates();
    body.append(h("div.muted", { style: { fontSize: "12.5px", lineHeight: 1.6 } }, "기자는 담당 지역의 사건을 스스로 취재해 단신을 내고, 공개·현장 사실을 수첩에 채워 준다. 지국이 있는 나라로 파견할 수 있다."));
    body.append(h("div.sect", h("h4", `소속 기자 ${o.staff.length} / ${cap}`),
      o.staff.length ? o.staff.map((s) => h("div.card",
        h("div.row.between", h("div", h("b", s.name), " ", chip(BEATS[s.beat], "gray")), pips(Math.round(s.skill * 5), 5)),
        h("div.row.between", { style: { marginTop: "6px" } },
          h("select.input", { style: { width: "auto", padding: "4px 8px", fontSize: "12.5px" }, onchange: (e) => assign(s.id, e.target.value) },
            [HOME, ...o.bureaus].map((id) => h("option", { value: id, selected: s.post === id }, id === HOME ? "서울 본사" : `${cname(id)} 지국`))),
          h("span.dim.num", { style: { fontSize: "12px" } }, `${fmtWon(s.salary)}/일 · 단신 ${s.filed}건`),
          h("button.btn.small.ghost", { onclick: async () => { if (await confirmDialog(`${s.name} 기자를 내보냅니까?`, { danger: true, yes: "해고" })) fire(s.id); } }, "해고"))))
        : h("div.empty", cap ? "아직 고용한 기자가 없다." : "'인터넷 신문' 등급부터 기자를 고용할 수 있다.")));
    if (cap) body.append(h("div.sect", h("h4", "지원자 (매일 바뀐다)"),
      o.candidates.map((c) => h("div.card", h("div.row.between", h("div", h("b", c.name), " ", chip(BEATS[c.beat], "gray")), pips(Math.round(c.skill * 5), 5)),
        h("div.row.between", { style: { marginTop: "6px" } }, h("span.dim.num", { style: { fontSize: "12px" } }, `계약금 ${fmtWon(c.cost)} · 급여 ${fmtWon(c.salary)}/일`),
          h("button.btn.small", { disabled: o.staff.length >= cap || o.cash < c.cost, onclick: () => { if (hire(c.id)) { sfx("good"); toast(`${c.name} 기자가 합류했다.`, "good"); } } }, "고용"))))));
  } else if (tab === "invest") {
    for (const [key, u] of Object.entries(UPGRADES)) {
      const lv = upLv(key);
      const cost = upgradeCost(key);
      body.append(h("div.card", h("div.upg", h("div.ic", icon(u.icon, 20)),
        h("div", h("div.nm", u.name, pips(lv, u.max)), h("div.ds", u.desc), lv ? h("div", { style: { fontSize: "12px", color: "var(--green)", marginTop: "2px" } }, `현재: ${u.eff(lv)}`) : null),
        cost == null ? chip("최대", "gold") : h("button.btn.small", { disabled: o.cash < cost, onclick: () => { if (buyUpgrade(key)) { sfx("cash"); toast(`${u.name} ${lv + 1}단계`, "good"); } } }, fmtWon(cost)))));
    }
  } else {
    const p = G.player;
    const needXp = XP_PER_LEVEL(p.level);
    body.append(h("div.card", h("div.row.between", h("div", h("div.eyebrow", "기자"), h("div.serif", { style: { fontSize: "19px", fontWeight: 900 } }, G.meta.reporter)), h("b", { style: { fontSize: "18px", color: "var(--gold)" } }, `Lv.${p.level}`)),
      h("div", { style: { margin: "8px 0 3px" } }, bar(p.xp, needXp, "gold")), h("div.row.between", { style: { fontSize: "12px" } }, h("span.dim", `경험치 ${Math.floor(p.xp)} / ${needXp}`), h("span", { style: { color: p.pts ? "var(--gold)" : "var(--text-3)", fontWeight: 700 } }, `역량 점수 ${p.pts}`))));
    for (const [key, s] of Object.entries(SKILLS)) {
      const lv = p.skills[key];
      body.append(h("div.card", h("div.row.between", h("div.grow", h("div.nm", { style: { fontWeight: 700 } }, s.name, pips(lv, s.max)), h("div.muted", { style: { fontSize: "12px", lineHeight: 1.5 } }, s.desc), lv ? h("div", { style: { fontSize: "12px", color: "var(--green)" } }, s.eff(lv)) : null),
        h("button.btn.small.gold", { disabled: !p.pts || lv >= s.max, onclick: () => { if (raiseSkill(key)) sfx("good"); } }, icon("plus", 14)))));
    }
  }
  mount(el, head("경영", `${G.meta.outlet} · ${tierDef().name}`),
    h("div.tabs", [["over", "개요"], ["staff", "인력"], ["invest", "투자"], ["me", "기자"]].map(([k, label]) => h(`button${tab === k ? ".on" : ""}`, { onclick: () => ctx.setTab("manage", k) }, label, k === "me" && G.player.pts ? " ★" : ""))),
    body);
}

// ═════════ 記定 장부 ═════════
export function renderCanon(el, ctx) {
  const cn = G.canon;
  const cap = inkCap();
  const mine = cn.list.filter((c) => c.by === "player" && c.active);
  const others = cn.list.filter((c) => c.by !== "player" && c.known && c.active);
  const past = cn.list.filter((c) => !c.active && c.known).slice(-6).reverse();
  const tab = ctx.tab.canon || "book";
  const body = h("div.panel-body");
  if (tab === "book") {
    body.append(h("div.card",
      h("div.gauge", h("div.lb", h("span", "인주 印朱"), h("b.num", { style: { color: "#ff8b78" } }, `${Math.floor(cn.ink)} / ${cap}`)), bar(cn.ink, cap, "red thick")),
      h("div.gauge", { style: { marginTop: "9px" } }, h("div.lb", h("span", "세계의 왜곡"), h("b.num", { style: { color: cn.distortion > 35 ? "var(--amber)" : "" } }, `${cn.distortion.toFixed(0)} / 100`)), bar(cn.distortion, 100, cn.distortion > 60 ? "red thick" : "violet thick")),
      h("div.dim", { style: { fontSize: "12px", lineHeight: 1.6, marginTop: "7px" } }, "인주는 기사가 읽힐수록 차오른다. 왜곡이 쌓이면 사람들의 기억에 '잔향'이 남고, 도장을 가진 다른 이들의 눈에 띈다.")));
    body.append(h("div.sect", h("h4", `내가 찍은 문장 ${mine.length} / ${SLOT_COUNT[cn.lv.slots - 1]}`),
      mine.length ? mine.map((c) => h("div.canon-card", h("div.sent", `「${c.belief}」`),
        h("div.fx", h("span", canonWhere(c)), h("span", `세기 ${c.mag}단`), h("span", c.expires == null ? "영구" : `${fmtDuration(Math.max(0, c.expires - G.time.min))} 남음`)),
        h("div.fx", c.effects.map((e) => h("span", effectText(e)))),
        h("div.row", { style: { justifyContent: "flex-end" } }, h("button.btn.small.ghost", {
          onclick: async () => { if (await confirmDialog(`「${c.belief}」\n\n이 문장을 거둡니까? 세상은 그런 일이 있었는지조차 잊고, 수치는 원래대로 돌아간다. 쓴 인주는 돌아오지 않는다.`, { title: "문장 거두기", yes: "거둔다" })) { retract(c); sfx("rift"); } },
        }, "거두기"))))
        : h("div.empty", "지금 유지 중인 문장이 없다.\n기사를 쓸 때 한 문장에 도장을 찍을 수 있다.")));
    if (others.length) {
      body.append(h("div.sect", h("h4", "남이 찍은 문장"),
        others.map((c) => h("div.canon-card.other", h("div.sent", c.puzzle?.label ? c.puzzle.label : `「${c.text}」`),
          h("div.fx", h("span", c.origin?.outlet ? `${OUTLETS[c.origin.outlet]?.name ?? c.origin.outlet}` : "출처 불명"), c.origin?.whenText ? h("span", c.origin.whenText) : null, h("span", canonWhere(c))),
          h("div.row", { style: { justifyContent: "flex-end" } }, h("button.btn.small.primary", { onclick: () => emit("ui:revert", c) }, icon("stamp", 14), "환원(還元)"))))));
    }
    if (past.length) body.append(h("div.sect", h("h4", "지나간 문장"), past.map((c) => h("div.canon-card.ended", h("div.sent", { style: { fontSize: "13.5px" } }, `「${c.belief}」`),
      h("div.fx", h("span", { reverted: "환원됨", retract: "거둠", fade: "바램" }[c.ended?.how] || "끝남"), h("span", fmtDate(c.ended?.t ?? c.at, { short: true })))))));
  } else {
    body.append(h("div.muted", { style: { fontSize: "12.5px", lineHeight: 1.6 } }, "도장에 새김을 더할수록 문장이 멀리, 세게, 오래 닿는다. 값은 인주로 치른다."));
    for (const [key, s] of Object.entries(STAMP)) {
      const lv = cn.lv[key];
      const cost = stampUpgradeCost(key);
      body.append(h("div.card", h("div.row.between", h("div.grow", h("div", { style: { fontWeight: 700 } }, s.name, pips(lv, s.max, "red")), h("div.muted", { style: { fontSize: "12px" } }, s.desc),
        h("div", { style: { fontSize: "12.5px", marginTop: "2px" } }, h("span", { style: { color: "#ff9c8c" } }, s.eff(lv)), lv < s.max ? h("span.dim", `  →  ${s.eff(lv + 1)}`) : null)),
        cost == null ? chip("최대", "gold") : h("button.btn.small", { disabled: cn.ink < cost, onclick: () => { if (upgradeStamp(key)) { sfx("stamp"); toast(`각인 「${s.name}」 ${lv + 1}단`, "canon"); } } }, `인주 ${cost}`))));
    }
    body.append(h("div.dim", { style: { fontSize: "12px", lineHeight: 1.7 } }, `한 번 찍는 값: 범위(${SCOPES.map((x) => `${x.ko} ×${x.mult}`).join(", ")}) × 세기. 예) 한 사건·2단 = 인주 10.`));
  }
  mount(el, head("記定 장부", "찍힌 문장과 도장의 각인"),
    h("div.tabs", [["book", "장부"], ["stamp", "각인"]].map(([k, label]) => h(`button${tab === k ? ".on" : ""}`, { onclick: () => ctx.setTab("canon", k) }, label))),
    body);
  void clamp;
  void TIERS;
}
