// 취재 수첩 — 사건별로 알게 된 사실과 그 상태(전해 들음 / 확인함 / 거짓으로 확인)
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { now } from "../world.js";

export const notes = (evId) => G.notebook[evId] || {};
export function learnFact(ev, factId, st, src) {
  const f = ev.facts.find((x) => x.id === factId);
  if (!f) return null;
  const nb = (G.notebook[ev.id] ||= {});
  const cur = nb[factId];
  if (!cur) {
    nb[factId] = { st: f.true ? st : "heard", src: [src], at: now() };
    emit("fact:new", ev, f, nb[factId].st);
    if (f.ev) emit("evidence:found", f.ev, ev);
    return "new";
  }
  if (cur.st === "debunked") return null;
  if (!cur.src.includes(src)) cur.src.push(src);
  if (cur.st === "heard" && f.true && (st === "confirmed" || cur.src.length >= 2)) {
    cur.st = "confirmed";
    emit("fact:up", ev, f);
    return "up";
  }
  return null;
}
export function debunk(ev) {
  const nb = G.notebook[ev.id];
  if (!nb) return false;
  let any = false;
  for (const f of ev.facts) {
    if (!f.true && nb[f.id] && nb[f.id].st !== "debunked") {
      nb[f.id].st = "debunked";
      any = true;
      emit("fact:debunked", ev, f);
    }
  }
  return any;
}
export function factSummary(ev) {
  const nb = notes(ev.id);
  const total = ev.facts.filter((f) => f.true).length;
  let known = 0, confirmed = 0, maxDepth = -1;
  for (const f of ev.facts) {
    const n = nb[f.id];
    if (!n || !f.true) continue;
    known++;
    if (n.st === "confirmed") confirmed++;
    maxDepth = Math.max(maxDepth, f.depth);
  }
  return { total, known, confirmed, maxDepth };
}
