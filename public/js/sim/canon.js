// 기정(記定) — 도장이 찍힌 문장은 진실과 무관하게 세계의 상식이 된다.
// LLM은 문장을 '효과 제안'으로 번역할 뿐이고, 범위·세기·비용의 판정과 수치 변경은 규칙 엔진이 한다.
import { G } from "../core/store.js";
import { emit } from "../core/bus.js";
import { clamp, chance, rand, HOUR, DAY } from "../core/util.js";
import { ask } from "../llm/api.js";
import { decreeRequest, decreeTargets } from "../llm/prompts.js";
import { SCOPES, HOLD_MIN, SLOT_COUNT, INK_CAP, decreeCost, decreeDistortion, STAMP } from "../data/progress.js";
import { C, cd, actor, feed, now, makeSeed, cname } from "./world.js";
import { myCanon } from "./lore.js";

const SCOPE_KEYS = SCOPES.map((s) => s.key);
const UNIT = { rep: 6, power: 3, stab: 3, appr: 4, econ: 3, tens: 4, attn: 7, progress: 7, heat: 9, outcome: 1, cred: 2.5 };
const ATTR_KO = { rep: "평판", power: "영향력", stab: "정치 안정", appr: "정부 지지", econ: "경기", tens: "대외 긴장", attn: "세계의 관심", progress: "의제 향방", heat: "세간의 관심", outcome: "사건의 결말", cred: "신뢰도" };
const KIND_ATTRS = { actor: ["rep", "power"], country: ["stab", "appr", "econ", "tens", "attn"], agenda: ["progress"], event: ["heat", "outcome"], outlet: ["cred"] };

export const inkCap = () => INK_CAP(G.canon.lv);
export function addInk(n) {
  if (!G.canon.unlocked) return 0;
  const before = G.canon.ink;
  G.canon.ink = clamp(G.canon.ink + n, 0, inkCap());
  return G.canon.ink - before;
}

// ── 오프라인 대안: 낱말로 대략 해석 ──
const POS = ["재검토", "철회", "사과", "승인", "통과", "합의", "성공", "회복", "지지", "무죄", "결백", "호평", "상승", "안정", "타결", "석방", "복구", "보상"];
const NEG = ["사임", "사퇴", "구속", "기소", "조작", "실패", "폭락", "붕괴", "부도", "파산", "유죄", "비리", "추락", "하락", "결렬", "거짓", "해임", "몰락", "위기"];
function fallbackParse(sentence, targets) {
  const neg = NEG.some((w) => sentence.includes(w));
  const pos = POS.some((w) => sentence.includes(w));
  const named = targets.find((t) => t.kind !== "event" && t.name.length >= 2 && sentence.includes(t.name.split(" ")[0]));
  const t = named || targets.find((x) => x.kind === "event") || targets.find((x) => x.kind === "country");
  if (!t || sentence.replace(/\s/g, "").length < 8) return { belief: sentence, valid: false, scope: "local", effects: [], reaction: "" };
  const attr = KIND_ATTRS[t.kind][t.kind === "event" ? 1 : 0];
  const dir = t.kind === "event" ? (pos && !neg ? "up" : neg ? "up" : "up") : neg && !pos ? "down" : "up";
  return {
    belief: sentence.replace(/[.。]$/, ""), valid: true, scope: t.kind === "country" || t.kind === "outlet" ? "country" : t.kind === "agenda" ? "country" : "local",
    effects: [{ target: t.id, attr, dir, mag: 2 }],
    reaction: "세상은 이 문장을 새삼스러워하지 않는다. 관계자들은 이미 알려진 사실이라는 듯 후속 조치를 이야기한다.",
  };
}

// ── 1) 감정(鑑定): 문장을 효과로 번역하고 지금 찍을 수 있는지 판정 ──
export async function appraise({ sentence, ev, headline }) {
  const targets = decreeTargets(ev);
  let data = null;
  let via = "rule";
  const r = await ask(decreeRequest({ sentence, ev, headline, targets }));
  if (r.ok && r.data && Array.isArray(r.data.effects)) {
    data = r.data;
    via = "llm";
  } else data = fallbackParse(sentence, targets);
  return resolveDecree(sentence, data, targets, ev, via);
}

export function resolveDecree(sentence, data, targets, ev, via = "llm") {
  const lv = G.canon.lv;
  const out = { sentence, belief: (data.belief || sentence).trim(), reaction: (data.reaction || "").trim(), via, effects: [], problems: [], notes: [], ok: false };
  if (!data.valid) {
    out.problems.push("이 문장은 세계에 대한 구체적인 주장이 아니다. 누가, 무엇이 어떠한지 분명한 평서문이어야 도장이 먹는다.");
    return out;
  }
  let scopeIdx = Math.max(0, SCOPE_KEYS.indexOf(data.scope));
  const byId = new Map(targets.map((t) => [t.id, t]));
  for (const e of (data.effects || []).slice(0, 3)) {
    const t = byId.get(e.target);
    if (!t || !KIND_ATTRS[t.kind].includes(e.attr)) continue;
    let mag = clamp(e.mag | 0, 1, 5);
    if (mag > lv.power) {
      out.notes.push(`세기가 각인 한계(${lv.power}단)로 줄어든다.`);
      mag = lv.power;
    }
    const sign = e.dir === "down" ? -1 : 1;
    const [kind, rawId] = t.id.includes(":") ? t.id.split(":") : ["actor", t.id];
    // 대상에 따라 필요한 최소 범위
    if (kind === "country") scopeIdx = Math.max(scopeIdx, 1);
    if (kind === "outlet") scopeIdx = Math.max(scopeIdx, rawId === "player" || rawId === "hanseong" ? 1 : 2);
    if (kind === "agenda") scopeIdx = Math.max(scopeIdx, G.world.agendas[rawId]?.country ? 1 : 3);
    if (kind === "actor") {
      const a = actor(rawId);
      if (a && !a.country) scopeIdx = Math.max(scopeIdx, 3);
      else if (a && a.power >= 80 && e.attr === "power") scopeIdx = Math.max(scopeIdx, 2);
      else if (a && (a.kind === "gov" || a.power >= 60)) scopeIdx = Math.max(scopeIdx, 1);
    }
    out.effects.push({ kind, id: rawId, attr: e.attr, sign, mag, delta: sign * mag * UNIT[e.attr], name: t.name, label: ATTR_KO[e.attr] });
  }
  if (!out.effects.length && ev?.localOnly) {
    out.effects.push({ kind: "event", id: ev.id, attr: "outcome", sign: 1, mag: 1, delta: UNIT.outcome, name: ev.title, label: ATTR_KO.outcome });
  }
  if (ev?.localOnly) scopeIdx = 0;
  if (!out.effects.length) {
    out.problems.push("문장이 가리키는 대상을 세계에서 찾지 못했다. 사건·인물·나라의 이름을 분명히 적어 보라.");
    return out;
  }
  out.scopeIdx = scopeIdx;
  out.scope = SCOPE_KEYS[scopeIdx];
  out.mag = Math.max(...out.effects.map((e) => e.mag));
  out.cost = decreeCost(scopeIdx, out.mag);
  out.distortion = decreeDistortion(scopeIdx, out.mag, lv.veil);
  out.holdMin = HOLD_MIN[lv.hold - 1];
  out.country = ev?.country ?? G.player.loc;
  const countryEff = out.effects.find((e) => e.kind === "country");
  if (countryEff) out.country = countryEff.id;
  else {
    const actEff = out.effects.find((e) => e.kind === "actor" && actor(e.id)?.country);
    if (actEff && !ev) out.country = actor(actEff.id).country;
  }
  if (scopeIdx + 1 > lv.scope) out.problems.push(`이 문장은 '${SCOPES[scopeIdx].ko}'에 닿는다. 지금 도장은 '${SCOPES[lv.scope - 1].ko}'까지만 닿는다. (각인 「범위」 강화 필요)`);
  if (myCanon().length >= SLOT_COUNT[lv.slots - 1]) out.problems.push(`이미 ${SLOT_COUNT[lv.slots - 1]}개의 문장을 유지하고 있다. 장부에서 하나를 거두거나 「동시 유지」를 강화해야 한다.`);
  if (G.canon.ink < out.cost) out.problems.push(`인주가 모자란다. (필요 ${out.cost} / 보유 ${Math.floor(G.canon.ink)})`);
  out.ok = out.problems.length === 0;
  return out;
}

// ── 2) 효과 적용 ──
function applyEffect(e, k = 1) {
  const delta = e.delta * k;
  const changes = { applied: 0 };
  const bump = (obj, key, lo, hi) => {
    const before = obj[key];
    obj[key] = clamp(before + delta, lo, hi);
    changes.applied = obj[key] - before;
  };
  if (e.kind === "actor") {
    const a = actor(e.id);
    if (a) bump(a, e.attr, 1, 99);
  } else if (e.kind === "country") {
    const d = cd(e.id);
    if (d) bump(d, e.attr, 1, 99);
  } else if (e.kind === "agenda") {
    const ag = G.world.agendas[e.id];
    if (ag && !ag.resolved) {
      bump(ag, "progress", 1, 99);
      const momentumBefore = ag.momentum;
      const heatBefore = ag.heat;
      ag.momentum = clamp(ag.momentum + e.sign * e.mag * 0.5 * k, -4, 4);
      ag.heat = clamp(ag.heat + 6, 0, 100);
      changes.momentumApplied = ag.momentum - momentumBefore;
      changes.heatApplied = ag.heat - heatBefore;
    }
  } else if (e.kind === "event") {
    const ev = G.world.events[e.id];
    if (ev) {
      if (e.attr === "heat") bump(ev, "heat", 0, 100);
      else {
        ev.bias += e.sign * e.mag * k;
        changes.applied = e.sign * e.mag * k;
      }
    }
  } else if (e.kind === "outlet") {
    if (e.id === "player") {
      const before = G.outlet.cred;
      G.outlet.cred = clamp(before + delta, 1, 99);
      changes.applied = G.outlet.cred - before;
    } else if (G.rivals[e.id]) bump(G.rivals[e.id], "cred", 1, 99);
  }
  return changes;
}

// ── 3) 도장을 찍는다 ──
export function enact(ap, { articleId, ev, title }) {
  const t = now();
  G.canon.ink = Math.max(0, G.canon.ink - ap.cost);
  const effects = ap.effects.map((e) => ({ ...e, ...applyEffect(e) }));
  const cn = {
    id: `cn${++G.canon.seq}`, text: ap.sentence, belief: ap.belief, reaction: ap.reaction, by: "player", at: t,
    expires: ap.holdMin == null ? null : t + ap.holdMin, scope: ap.scope, scopeIdx: ap.scopeIdx, mag: ap.mag,
    country: ap.country, region: C(ap.country)?.region, ev: ev?.id ?? null, effects, active: true, known: true,
    origin: { outlet: "player", stamper: G.meta.reporter, when: t, title }, article: articleId,
  };
  G.canon.list.push(cn);
  G.canon.distortion = clamp(G.canon.distortion + ap.distortion, 0, 100);
  G.outlet.totals.decrees++;
  feed("canon", `세계가 문장을 받아들였다: 「${ap.belief}」`, { canon: cn.id });
  // 여파: 세상은 그 전제 위에서 다음 일을 벌인다
  if (ap.mag >= 2 && !G.campaign.flags.quietWorld) {
    emit("seed", makeSeed({
      type: "aftermath", cat: ev?.cat ?? "pol", country: ap.country, canonText: ap.belief, start: 1,
      fireAt: t + rand(3, 7) * HOUR, sig: clamp(1 + ap.scopeIdx + (ap.mag >= 4 ? 1 : 0), 1, 5),
    }));
  }
  emit("canon:enacted", cn);
  return cn;
}

// 다른 매체(또는 과거)가 찍은 문장을 세계에 심는다 — 캠페인용
export function plantCanon(def) {
  const effects = (def.effects || []).map((e) => {
    const full = { ...e, delta: e.sign * e.mag * UNIT[e.attr], label: ATTR_KO[e.attr] };
    return { ...full, ...(def.silent ? { applied: 0 } : applyEffect(full)) };
  });
  const cn = {
    id: def.id || `cn${++G.canon.seq}`, text: def.text, belief: def.belief || def.text, reaction: def.reaction || "", by: def.by, at: def.at ?? now(),
    expires: null, scope: def.scope || "world", scopeIdx: SCOPE_KEYS.indexOf(def.scope || "world"), mag: def.mag || 3,
    country: def.country || null, region: def.country ? C(def.country)?.region : null, ev: null, effects, active: true,
    known: Boolean(def.known), origin: def.origin || {}, ancient: Boolean(def.ancient), puzzle: def.puzzle || null,
  };
  G.canon.list.push(cn);
  emit("canon:planted", cn);
  return cn;
}

// ── 4) 문장이 풀린다 ──
function unwind(cn, k) {
  for (const e of [...cn.effects].reverse()) {
    if (e.kind === "agenda") {
      const ag = G.world.agendas[e.id];
      if (ag && !ag.resolved) {
        // 상한에 걸려 일부만 바뀐 경우에도 실제 적용량만 되돌린다.
        ag.progress = clamp(ag.progress - e.applied * k, 1, 99);
        ag.momentum = clamp(ag.momentum - (e.momentumApplied ?? (e.applied ? e.sign * e.mag * 0.5 : 0)) * k, -4, 4);
        ag.heat = clamp(ag.heat - (e.heatApplied ?? (e.applied ? 6 : 0)) * k, 0, 100);
      }
      continue;
    }
    if (!e.applied) continue;
    applyEffect({ ...e, delta: -e.applied, sign: -Math.sign(e.applied) || 1 }, k);
  }
}
export function retract(cn) {
  if (!cn.active) return;
  unwind(cn, 1);
  cn.active = false;
  cn.ended = { t: now(), how: "retract" };
  feed("canon", `문장을 거두었다: 「${cn.belief}」 — 세상은 그런 일이 있었는지조차 잊는다.`, { canon: cn.id });
  emit("canon:ended", cn);
}
export function revertCanon(cn) {
  if (!cn.active) return;
  unwind(cn, 1);
  cn.active = false;
  cn.ended = { t: now(), how: "revert" };
  cn.known = true;
  feed("canon", `환원(還元): 「${cn.belief}」 — 찍힌 문장이 풀렸다.`, { canon: cn.id });
  emit("canon:reverted", cn);
}

// ── 5) 시간의 흐름 ──
export function canonHourly() {
  const t = now();
  for (const cn of G.canon.list) {
    if (cn.active && cn.expires != null && t >= cn.expires) {
      unwind(cn, 0.6);
      cn.active = false;
      cn.ended = { t, how: "fade" };
      feed("canon", `문장이 바랬다: 「${cn.belief}」 — 세상은 서서히 원래 자리를 더듬어 찾는다.`, { canon: cn.id });
      emit("canon:ended", cn);
    }
  }
  const c = G.canon;
  c.distortion = Math.max(0, c.distortion - 4 / 24);
  // 왜곡이 쌓이면 '잔향'이 뉴스가 된다
  if (c.distortion > 35 && !G.campaign.flags.quietWorld && chance((c.distortion - 30) / 900)) {
    const own = myCanon();
    const src = own.length ? own[Math.floor(Math.random() * own.length)] : null;
    emit("seed", makeSeed({ type: "rift", country: src?.country ?? G.player.loc, start: 1, hintExtra: src ? `사람들이 기억과 다르다고 호소하는 대상은 다음 '상식'과 관련돼 있다: 「${src.belief}」. 다만 기사 안의 누구도 이 문장이 조작됐다고는 생각하지 못한다.` : null }));
  }
}

// ── 각인 강화 ──
export function stampUpgradeCost(key) {
  const lv = G.canon.lv[key];
  return lv >= STAMP[key].max ? null : STAMP[key].cost[lv];
}
export function upgradeStamp(key) {
  const cost = stampUpgradeCost(key);
  if (cost == null || G.canon.ink < cost) return false;
  G.canon.ink -= cost;
  G.canon.lv[key]++;
  emit("canon:upgrade", key);
  return true;
}

export const scopeKo = (idx) => SCOPES[idx]?.ko ?? "";
export const attrKo = (a) => ATTR_KO[a] || a;
export function effectText(e) {
  const arrow = e.sign > 0 ? "▲" : "▼";
  return `${e.name} · ${e.label} ${arrow.repeat(Math.min(3, Math.ceil(e.mag / 2)))}`;
}
export function canonWhere(cn) {
  if (cn.scope === "world") return "온 세계";
  if (cn.scope === "region") return "한 권역";
  if (cn.country) return cname(cn.country);
  return "";
}
export { DAY };
