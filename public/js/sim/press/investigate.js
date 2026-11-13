// 취재 행동 — 자료 조사, 현장 취재, 심층 추적
import { G } from "../../core/store.js";
import { emit } from "../../core/bus.js";
import { chance } from "../../core/util.js";
import { HOME } from "../../data/world.js";
import { presence } from "../world.js";
import { spend, upLv, skill, gearF } from "./base.js";
import { notes, learnFact, debunk } from "./notebook.js";
import { pay } from "./money.js";

export function deskResearch(ev) {
  const mins = Math.round(45 * gearF());
  const got = [];
  const r = skill("research"), g = upLv("gear");
  for (const f of ev.facts) {
    if (!f.true) {
      if (chance(0.4)) learnFact(ev, f.id, "heard", "desk") && got.push(f.id);
      continue;
    }
    if (f.talk) continue;
    if (f.depth === 0) learnFact(ev, f.id, "confirmed", "desk") && got.push(f.id);
    else if (f.depth === 1 && chance(0.28 + r * 0.07 + g * 0.08)) learnFact(ev, f.id, "heard", "desk") && got.push(f.id);
    else if (f.depth === 2 && chance(0.03 + r * 0.03)) learnFact(ev, f.id, "heard", "desk") && got.push(f.id);
  }
  ev.deskDone = true;
  spend(mins);
  emit("investigate", ev, "desk", got);
  return { mins, got };
}

export function canField(ev) {
  const p = presence(ev.country);
  if (p >= 3) return { ok: true, proxy: false };
  if (p === 2 && ev.country !== HOME) return { ok: true, proxy: true };
  if (p >= 1 && ev.country !== HOME) return { ok: true, proxy: true };
  return { ok: false };
}
export function fieldWork(ev) {
  const cf = canField(ev);
  if (!cf.ok) return null;
  const mins = Math.round((cf.proxy ? 150 : 90) * gearF());
  const got = [];
  const r = skill("research"), g = upLv("gear");
  for (const f of ev.facts) {
    if (!f.true || f.talk) continue;
    if (f.depth <= 1) learnFact(ev, f.id, "confirmed", "site") && got.push(f.id);
    else if (f.depth === 2 && chance((cf.proxy ? 0.1 : 0.2) + r * 0.07 + g * 0.08)) learnFact(ev, f.id, "heard", "site") && got.push(f.id);
  }
  let debunked = false;
  if (chance(0.5)) debunked = debunk(ev);
  if (!cf.proxy) for (const s of ev.sources) s.met = true;
  ev.fieldDone = true;
  spend(mins);
  emit("investigate", ev, "site", got);
  return { mins, got, proxy: cf.proxy, debunked };
}

export function digInfo(ev) {
  const nb = notes(ev.id);
  const conf = ev.facts.filter((f) => f.true && nb[f.id]?.st === "confirmed");
  const cost = 150_000 * ev.sig * G.outlet.tier;
  return { ok: conf.length >= 2 && conf.some((f) => f.depth >= 1) && (ev.digs || 0) < 2, cost, mins: Math.round(240 * gearF()), left: 2 - (ev.digs || 0) };
}
export function deepDig(ev) {
  const info = digInfo(ev);
  if (!info.ok || G.outlet.cash < info.cost) return null;
  pay(info.cost, "invest");
  const nb = notes(ev.id);
  const r = skill("research"), g = upLv("gear");
  const got = [];
  const hasD2 = () => ev.facts.some((f) => f.depth === 2 && nb[f.id]?.st === "confirmed");
  for (const f of ev.facts) {
    if (!f.true || f.talk || nb[f.id]?.st === "confirmed") continue;
    if (f.depth <= 1) learnFact(ev, f.id, "confirmed", "doc") && got.push(f.id);
    else if (f.depth === 2 && chance(0.55 + r * 0.07 + g * 0.06)) learnFact(ev, f.id, "confirmed", "doc") && got.push(f.id);
  }
  for (const f of ev.facts) {
    if (!f.true || f.talk || f.depth !== 3 || nb[f.id]?.st === "confirmed") continue;
    if (chance(0.22 + r * 0.07 + g * 0.05 + (hasD2() ? 0.18 : 0))) learnFact(ev, f.id, "confirmed", "doc") && got.push(f.id);
  }
  const debunked = debunk(ev);
  ev.digs = (ev.digs || 0) + 1;
  spend(info.mins);
  emit("investigate", ev, "dig", got);
  return { ...info, got, debunked };
}
