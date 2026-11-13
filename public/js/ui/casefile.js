// 사건 파일 — 증거, 추리, 그리고 찍힌 문장의 환원(還元)
import { G } from "../core/store.js";
import { on, emit } from "../core/bus.js";
import { h, mount, chip, modal, toast } from "./dom.js";
import { EVIDENCE, DEDUCTIONS, FINALS, hasEvidence } from "../campaign/engine.js";
import { revertCanon } from "../sim/canon.js";
import { spend } from "../sim/press.js";
import { head } from "./panels.js";
import { openEditor, playDecree } from "./editor.js";
import { clamp } from "../core/util.js";
import { sfx } from "../audio.js";

const evBody = (def) => (typeof def.body === "function" ? def.body(G) : def.body);

function openEvidence(id) {
  const def = EVIDENCE[id];
  if (!def) return;
  if (G.casefile.evidence[id]) G.casefile.evidence[id].fresh = false;
  sfx("paper");
  modal({ title: def.title, eyebrow: `증거 ${def.no}`, body: h("div.paperbox", { html: evBody(def) || def.short }), buttons: [{ label: "닫기", primary: true }], onClose: () => emit("casefile") });
}

export function renderCase(el) {
  const cf = G.casefile;
  const ob = G.campaign.objectives[0];
  const got = Object.keys(cf.evidence).filter((id) => EVIDENCE[id]).sort((a, b) => EVIDENCE[a].no.localeCompare(EVIDENCE[b].no));
  const openDed = Object.values(DEDUCTIONS).filter((d) => cf.deductions[d.id] !== true && d.need.every(hasEvidence));
  const doneDed = Object.values(DEDUCTIONS).filter((d) => cf.deductions[d.id] === true);
  const body = h("div.panel-body");
  if (ob) body.append(h("div.card", { style: { borderColor: "rgba(226,69,47,.45)" } }, h("div.eyebrow", { style: { color: "#ff9c8c" } }, ob.chapter), h("div.serif", { style: { fontWeight: 700, fontSize: "16px", margin: "2px 0 6px" } }, ob.title),
    ob.items.map((it) => h("div", { style: { fontSize: "13px", color: it.done ? "var(--text-3)" : "var(--text)", textDecoration: it.done ? "line-through" : "none", padding: "2px 0" } }, it.done ? "✓ " : "· ", it.text)),
    ob.hint ? h("div", { style: { fontSize: "12.5px", color: "var(--amber)", marginTop: "6px", lineHeight: 1.6 } }, ob.hint) : null));
  if (openDed.length) body.append(h("div.sect", h("h4", "추리할 수 있다"), openDed.map((d) => h("div.card.click", { style: { borderColor: "var(--gold)" }, onclick: () => openDeduction(d.id) },
    h("div.row.between", h("b", d.title), chip("추리", "gold")), h("div.muted", { style: { fontSize: "12.5px", marginTop: "3px" } }, d.question)))));
  body.append(h("div.sect", h("h4", `증거 ${got.length}`),
    got.length ? got.map((id) => {
      const def = EVIDENCE[id];
      return h(`div.evi${cf.evidence[id].fresh ? ".fresh" : ""}`, { onclick: () => openEvidence(id) }, h("div.no", def.no), h("div", h("div.t", def.title), h("div.s", def.short)));
    }) : h("div.empty", "아직 모은 증거가 없다.")));
  if (doneDed.length) body.append(h("div.sect", h("h4", "내린 결론"), doneDed.map((d) => h("div.card", { style: { padding: "9px 11px" } }, h("b", { style: { fontSize: "13px" } }, d.title), h("div.muted", { style: { fontSize: "12.5px", marginTop: "3px", lineHeight: 1.6 } }, d.options.find((o) => o.id === d.answer).text)))));
  if (cf.wrong) body.append(h("div.dim", { style: { fontSize: "12px" } }, `빗나간 추리 ${cf.wrong}회`));
  mount(el, head("사건 파일", G.campaign.flags.ch1Done ? "제1장 완료" : "이미 찍힌 문장"), body);
}

// ═════════ 추리 ═════════
export function openDeduction(id) {
  const d = DEDUCTIONS[id];
  if (!d) return;
  let pick = null;
  const list = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
  const note = h("div", { style: { minHeight: "22px", fontSize: "13.5px", lineHeight: 1.6 } });
  const render = () => mount(list, d.options.map((o) => h(`button.ded-opt${pick === o.id ? ".on" : ""}`, { onclick: () => { pick = o.id; sfx("click"); render(); } }, o.text)));
  render();
  const m = modal({
    title: d.title, eyebrow: "추리", cls: "wide",
    body: h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      h("div.serif", { style: { fontSize: "17px", lineHeight: 1.6, fontWeight: 700 } }, d.question),
      h("div.row.wrap", d.need.map((e) => chip(`증거 ${EVIDENCE[e].no} · ${EVIDENCE[e].title}`, "gold"))),
      list, note),
    buttons: [
      { label: "더 생각한다", ghost: true },
      {
        label: "결론을 내린다", primary: true, keep: true,
        onclick: () => {
          if (!pick) return false;
          if (pick === d.answer) {
            G.casefile.deductions[id] = true;
            sfx("good");
            note.style.color = "var(--green)";
            note.textContent = d.success;
            m.setButtons([{ label: "계속", primary: true }]);
            emit("deduction", id);
          } else {
            G.casefile.wrong++;
            sfx("bad");
            note.style.color = "#ff9c8c";
            note.textContent = d.options.find((o) => o.id === pick).why || "앞뒤가 맞지 않는다.";
            spend(30);
          }
          return false;
        },
      },
    ],
    onClose: () => emit("casefile"),
  });
}

// ═════════ 환원(還元) ═════════
export function openRevert(cn) {
  if (!cn.active) return;
  const pz = cn.puzzle;
  if (!pz) {
    // 수수께끼가 없는 문장은 인주만 치르면 풀린다
    const cost = 5 + cn.mag * 2;
    return modal({
      title: "환원(還元)", eyebrow: "記定", cls: "small",
      body: h("div.confirm-text", `「${cn.text}」\n\n이 문장을 풀어 세상을 원래대로 되돌린다. 인주 ${cost}이 든다.`),
      buttons: [{ label: "그만둔다", ghost: true }, {
        label: "환원한다", primary: true, onclick: async () => {
          if (G.canon.ink < cost) return toast("인주가 모자란다.", "bad"), false;
          G.canon.ink -= cost;
          await playDecree(cn, { caption: "찍힌 문장이 풀린다.", silent: true });
          revertCanon(cn);
        },
      }],
    });
  }
  const sents = pz.sentences.filter((s) => s.need.every(hasEvidence));
  const stampers = pz.stampers.filter((s) => s.need.every(hasEvidence));
  let ps = null, pp = null;
  const sList = h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  const pList = h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
  const note = h("div", { style: { minHeight: "22px", fontSize: "13.5px", lineHeight: 1.6, color: "#ff9c8c" } });
  const render = () => {
    mount(sList, sents.map((s) => h(`button.ded-opt.serif${ps === s.id ? ".on" : ""}`, { onclick: () => { ps = s.id; sfx("click"); render(); } }, `「${s.text}」`)));
    mount(pList, stampers.map((s) => h(`button.ded-opt${pp === s.id ? ".on" : ""}`, { onclick: () => { pp = s.id; sfx("click"); render(); } }, s.name)));
  };
  render();
  const inkEl = h("b", { style: { color: "#ff8b78" } }, `보유 ${Math.floor(G.canon.ink)}`);
  const hiddenS = pz.sentences.length - sents.length, hiddenP = pz.stampers.length - stampers.length;
  const m = modal({
    title: "찍힌 문장을 환원한다", eyebrow: "還元", cls: "wide",
    body: h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      h("div.muted", { style: { lineHeight: 1.7 } }, "찍힌 문장을 토씨 하나 틀리지 않게 옮겨 적고, 찍은 자의 이름을 밝힌 뒤, 당신의 도장으로 눌러 지운다. 둘 중 하나라도 틀리면 인주만 번진다."),
      h("div.sect", h("h4", "찍힌 문장"), sList, hiddenS ? h("div.dim", { style: { fontSize: "12px" } }, `증거가 더 있으면 후보가 ${hiddenS}개 더 드러난다.`) : null),
      h("div.sect", h("h4", "찍은 자"), pList, hiddenP ? h("div.dim", { style: { fontSize: "12px" } }, `증거가 더 있으면 후보가 ${hiddenP}명 더 드러난다.`) : null),
      h("div.row.between", h("span.muted", `필요한 인주 ${pz.cost}`), inkEl),
      note),
    buttons: [
      { label: "그만둔다", ghost: true },
      {
        label: "환원한다", primary: true, icon: "stamp", keep: true,
        onclick: () => {
          if (!ps || !pp) return (note.textContent = "문장과 이름을 모두 골라야 한다."), false;
          if (G.canon.ink < pz.cost) return (note.textContent = `인주가 모자란다. 기사가 읽히면 인주가 차오른다. (필요 ${pz.cost})`), false;
          const okS = ps === pz.answer.sentence, okP = pp === pz.answer.stamper;
          if (!okS || !okP) {
            G.canon.ink = Math.max(0, G.canon.ink - Math.ceil(pz.cost / 2));
            G.outlet.cred = clamp(G.outlet.cred - 1.5, 1, 99);
            G.casefile.wrong++;
            sfx("bad");
            note.textContent = !okS ? pz.wrong.sentence : pz.wrong.stamper;
            inkEl.textContent = `보유 ${Math.floor(G.canon.ink)}`;
            emit("cash");
            return false;
          }
          G.canon.ink -= pz.cost;
          m.close();
          finishRevert(cn);
          return false;
        },
      },
    ],
  });
}

async function finishRevert(cn) {
  const pz = cn.puzzle;
  pz.solved = true;
  pz.label = null;
  // 마지막 환원은 기사를 직접 써서 발행해야 풀린다. 어느 사건에서 무엇을 근거로 쓰는지는 장 정의(finals)가 정한다.
  const fin = pz.final ? FINALS[cn.id] : null;
  if (fin) {
    const ev = G.world.events[fin.ev];
    await new Promise((resolve) => {
      openEditor(ev, null, {
        noDecree: true, noCancel: true, minBody: fin.minBody ?? 100, publishLabel: fin.publishLabel ?? "환원 기사 발행",
        special: { viewsMul: fin.viewsMul ?? 1, extraFacts: fin.facts ?? [] },
        headline: "", body: "", guide: fin.guide ?? "",
        onPublished: () => resolve(),
      });
    });
  }
  await playDecree(cn, { caption: "찍힌 문장이 풀린다.", silent: true });
  revertCanon(cn);
  sfx("good");
  toast(`환원 — 「${cn.text}」`, "canon", 6000);
}

let bound = false;
export function bindCasefile() {
  if (bound) return;
  bound = true;
  on("ui:revert", (cn) => openRevert(cn));
}
