// 장부 — 줄이 많은 기록을 거르고, 줄 세우고, 답이 되는 줄을 붉은 색연필로 짚는다.
//   출입 기록(행정실 단말 출력본): 카드의 시각으로 거른다 → 그 시각에 문을 지난 사람
//   매입 장부(가게의 손 장부): 수량으로 줄을 세운다 → 같은 수로 산 것들
// 이 화면의 '아하'는 장부마다 하나다. 무엇이 답인지는 records.js가 판정한다.
import { el } from "./hud.js";
import { makeFrame, put, pencilRing, dayOf, hhmm } from "./probe.js";
import { ledgerView, ledgerFilter, ledgerCardFilter, ledgerSort, ledgerMark, ledgerSubmit } from "./records.js";
import { sfx } from "./sfx.js";

const fmtDate = (v) => `${Math.floor(v / 100)}/${v % 100}`;
function cellText(col, row) {
  const v = row[col.id];
  if (v == null || v === "") return "";
  if (col.type === "time") return `${dayOf(v)} ${hhmm(v)}`;
  if (col.type === "date") return fmtDate(v);
  if (col.type === "money") return v.toLocaleString("ko-KR");
  return String(v);
}
const filterLabel = (L, def, f) => {
  if (f.op === "is") return `${L.columns.find((c) => c.id === f.col)?.label}: ${f.value}`;
  if (f.op === "around") return `${f.card ? def.evidence[f.card].title : "시각"} · ${dayOf(f.at)} ${hhmm(f.at)} 앞뒤 ${f.slack}분`;
  return `시간대: ${f.label}`;
};

export function openLedger({ root, def, st, id, save = () => {}, spent = 0 }) {
  const L = def.records.ledgers[id];
  const F = makeFrame({ root, kind: `ledger.${L.skin || "paper"}`, title: L.title, sub: L.source, prompt: L.prompt, def, st, save, spent });
  let bad = [];

  const keysEl = el("div.l-keys");
  const tagsEl = el("div.l-tags");
  const table = el("table.l-table");
  const foot = el("div.l-foot");
  const sheet = el("div.l-sheet", el("div.l-holes"), el("div.l-head", el("b", L.title), el("span", L.source)), el("div.l-scroll", table));
  const noteEl = el("div.l-note");
  F.body.append(el("div.l-wrap", el("div.l-main", el("div.l-tools", keysEl, tagsEl), sheet, foot), el("div.l-side", noteEl)));

  function draw() {
    const v = ledgerView(def, st, id);
    // 거르는 열쇠: 가진 카드의 시각, 하루의 시간대
    put(keysEl,
      v.keys.length ? el("div.l-keyrow", el("em", "카드의 시각으로 거른다"),
        v.keys.map((k) => el(`button.l-key${k.on ? ".on" : ""}`, { onclick: () => act(() => ledgerCardFilter(def, st, id, k.card)) }, el("i", k.card), k.title.replace(/^.*: /, ""), el("small", `${dayOf(k.at)} ${hhmm(k.at)}`)))) : null,
      L.bands ? el("div.l-keyrow", el("em", "시간대"),
        L.bands.map((b) => el(`button.l-band${v.filters.some((f) => f.op === "band" && f.from === b.from) ? ".on" : ""}`, { onclick: () => act(() => ledgerFilter(def, st, id, { op: "band", ...b })) }, b.label))) : null,
      !v.keys.length && !L.bands ? el("div.l-keyrow", el("em", "줄 세우기"), el("span.l-dim", "칸의 이름을 누르면 그 칸으로 줄을 세운다. 한 번 더 누르면 거꾸로.")) : null);
    put(tagsEl, v.filters.map((f) => el("button.l-tag", { title: "누르면 뺀다", onclick: () => act(() => ledgerFilter(def, st, id, f)) }, filterLabel(L, def, f), el("i", "×"))),
      v.filters.length ? el("button.l-clear", { onclick: () => act(() => ledgerFilter(def, st, id, null)) }, "모두 지운다") : null);

    const arrow = (c) => (v.sort?.col === c.id ? (v.sort.dir === 1 ? " ▲" : " ▼") : "");
    put(table,
      el("thead", el("tr", el("th.l-gut"), v.columns.map((c) => el(`th.t-${c.type}${v.sort?.col === c.id ? ".on" : ""}`, { onclick: () => act(() => ledgerSort(st, id, c.id), "paper") }, c.label, el("i", arrow(c)))))),
      el("tbody", v.rows.map(({ row, marked }, i) => {
        const tr = el(`tr${marked ? ".mark" : ""}${bad.includes(row.id) ? ".bad" : ""}`, { "data-row": row.id, onclick: () => mark(row.id) },
          el("td.l-gut", el("span", marked ? "✓" : String(i + 1)), marked ? pencilRing(1050, 28, row.id) : null),
          v.columns.map((c) => {
            const picked = v.filters.some((f) => f.op === "is" && f.col === c.id && f.value === row[c.id]);
            return el(`td.t-${c.type}`, el("span", cellText(c, row)),
              c.pick && row[c.id] ? el(`button.l-funnel${picked ? ".on" : ""}`, { title: picked ? "이 값으로 거르는 것을 푼다" : "이 값만 남긴다", onclick: (e) => (e.stopPropagation(), act(() => ledgerFilter(def, st, id, { col: c.id, op: "is", value: row[c.id] }))) }, "⌕") : null);
          }));
        return tr;
      }),
      v.rows.length ? null : el("tr.l-empty", el("td", { colspan: String(v.columns.length + 1) }, "이 조건에 맞는 줄이 없다."))));
    put(foot,
      el("span", `${v.total}줄 가운데 ${v.shown}줄`, v.marks.length ? el("b", ` · 짚은 줄 ${v.marks.length}`) : null),
      v.done ? el("span.l-done", "카드로 만들었다") : el("button.l-submit", { disabled: !v.marks.length || null, onclick: () => submit() }, "짚은 줄을 오려 둔다"));
    const hidden = v.marks.filter((m) => !v.rows.some((x) => x.row.id === m));
    put(noteEl,
      el("h5", "찾을 것"), el("p.l-ask", L.prompt),
      el("h5", "짚은 줄"),
      v.marks.length ? el("ul.l-marks", v.marks.map((m) => {
        const row = L.rows.find((x) => x.id === m);
        return el("li", { onclick: () => mark(m), title: "누르면 지운다" }, L.columns.slice(0, 3).map((c) => cellText(c, row)).filter(Boolean).join(" · "));
      })) : el("p.l-dim", "줄을 누르면 붉은 색연필로 짚는다. 다시 누르면 지운다."),
      hidden.length ? el("p.l-dim", `짚은 줄 가운데 ${hidden.length}줄은 지금 걸러져 보이지 않는다.`) : null,
      el("p.l-dim.l-rule", "틀려도 시간은 들지 않는다. 까닭만 듣는다."));
    F.clock();
  }
  function act(fn, sound = "type") {
    fn();
    bad = [];
    sfx[sound]?.();
    save();
    draw();
  }
  function mark(rowId) {
    if (!ledgerMark(def, st, id, rowId)) return;
    bad = [];
    sfx.pencil(0.22);
    save();
    draw();
  }
  function submit() {
    const res = ledgerSubmit(def, st, id);
    if (!res.ok) {
      bad = res.rows || [];
      F.miss(res);
      return draw();
    }
    F.gain(res);
    draw();
  }
  draw();
  return Object.assign(F.promise, {
    api: {
      card: (c) => act(() => ledgerCardFilter(def, st, id, c)), filter: (f) => act(() => ledgerFilter(def, st, id, f)), sort: (c) => act(() => ledgerSort(st, id, c)),
      mark, submit, close: F.close, view: () => ledgerView(def, st, id), el: F.layer,
    },
  });
}
