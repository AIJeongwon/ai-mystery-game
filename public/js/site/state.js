// 현장의 상태와 규칙 — 화면을 모른다. 시계, 잠금, 얻은 것, 저장.
// 판정은 모두 여기서 한다. 3D와 LLM은 이 결과를 보여 줄 뿐이다.

const KEY = "gijeongsasil.site.";
const DAYS = ["금요일", "토요일", "일요일", "월요일", "화요일"]; // 0분 = 금요일(D+1) 0시

export function newSiteState(def) {
  return {
    site: def.id,
    minute: def.start.minute,
    evidence: Object.fromEntries((def.start.evidence || []).map((id) => [id, def.start.minute])), // id → 얻은 시각(분)
    statements: [], // 밑줄 친 구절 { id, who, text, minute }
    seen: {}, //       살펴본 조사점 id → 횟수
    flags: {}, //      진행 표시
    nodes: {}, //      glb 노드 이름 → 보임 여부 (기본값은 def.nodes)
    items: [...(def.start.items || [])],
    holding: null, //  들고 옮기는 것 (사다리)
    npc: {}, //        id → { trust, said: [], turns, log: [] }
    choices: {}, //    갈림 id → 고른 값
    seenAt: {}, //     조사점 id → 처음 살펴본 시각(분)
    hints: {}, //      물음 id → 열린 실마리 수
    // 증거판 (site/reason.js): 카드 자리, 이은 선, 틀린 횟수, 시간 띠, 빈칸 추리
    board: { pos: { ...(def.start.board || {}) }, links: { ...(def.start.links || {}) }, more: [], wrong: {}, strip: [], ded: {}, seen: [] },
    book: { seen: {} }, // 수첩에서 이미 읽은 것 (새로 적힌 줄을 가려낸다)
  };
}

export function fmtClock(minute) {
  const day = Math.floor(minute / 1440);
  const m = ((minute % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = m % 60;
  return `${DAYS[day] ?? `${day + 1}일째`} ${ampm} ${h12}시${mm ? ` ${mm}분` : ""}`;
}
export const hourOf = (minute) => Math.floor((((minute % 1440) + 1440) % 1440) / 60);

// 시각 → 해와 하늘빛의 세기 (0~1). 해는 지기 전 반 시간 동안 사그라들고, 하늘빛은 진 뒤 반 시간쯤 더 남는다.
// 현장의 빛은 이 값을 따른다: 시간을 쓰면 해가 진다.
const clamp01 = (v, lo = 0) => Math.max(lo, Math.min(1, v));
export function daylight(hour, sunrise = 7.2, sunset = 17.4) {
  return {
    sun: clamp01(Math.min(hour - sunrise, sunset - hour) / 0.45),
    sky: clamp01(Math.min(hour - (sunrise - 0.6), sunset + 0.6 - hour) / 1.0, 0.03),
  };
}

// 답을 문장으로 나눈다 (대화에서 한 문장씩 밑줄을 긋는다)
export const sentences = (text) => String(text).match(/[^.!?…]+[.!?…]+["']?|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) || [];

// ── 잠금 ──
// null | { evidence:[..] } | { flags:[..] } | { notFlags:[..] } | { items:[..] } | { holding:"x" } | { talked:"npc" }
// | { hour:[from,to] } | { before:분 } | { after:분 } | { any:[잠금..] }   (한 객체 안의 조건은 모두 맞아야 한다)
export function lockOpen(lock, st) {
  if (!lock) return true;
  if (lock.any) return lock.any.some((l) => lockOpen(l, st));
  if (lock.evidence && !lock.evidence.every((id) => id in st.evidence)) return false;
  if (lock.flags && !lock.flags.every((f) => st.flags[f])) return false;
  if (lock.notFlags && lock.notFlags.some((f) => st.flags[f])) return false;
  if (lock.items && !lock.items.every((id) => st.items.includes(id))) return false;
  if ("holding" in lock && st.holding !== lock.holding) return false;
  if (lock.talked && !(st.npc[lock.talked]?.turns > 0)) return false;
  if (lock.hour) {
    const h = hourOf(st.minute);
    if (h < lock.hour[0] || h >= lock.hour[1]) return false;
  }
  if (lock.before != null && st.minute >= lock.before) return false;
  if (lock.after != null && st.minute < lock.after) return false;
  return true;
}

// 조사점이 지금 어떤 상태인가: "hidden"(표시하지 않음) | "locked"(보이지만 조건이 모자람) | "open" | "done"
export function spotStatus(spot, st) {
  if (spot.showIf && !lockOpen(spot.showIf, st)) return "hidden";
  if (spot.hideIf && lockOpen(spot.hideIf, st)) return "hidden";
  if (spot.once && st.seen[spot.id]) return spot.keep ? "done" : "hidden";
  if (!lockOpen(spot.lock, st)) return spot.lockText ? "locked" : "hidden";
  return st.seen[spot.id] ? "done" : "open";
}

// ── 얻기 ──
// effect: { evidence:[..], flags:[..], unflag:[..], items:[..], drop:[..], show:[..], hide:[..], holding:"x"|null, minutes:n }
// 돌려주는 값: 새로 얻은 것 { evidence:[..], items:[..] }
export function apply(st, effect = {}) {
  const fresh = { evidence: [], items: [] };
  for (const id of effect.evidence || []) {
    if (!(id in st.evidence)) {
      st.evidence[id] = st.minute;
      fresh.evidence.push(id);
    }
  }
  for (const f of effect.flags || []) st.flags[f] = true;
  for (const f of effect.unflag || []) delete st.flags[f];
  for (const id of effect.items || []) {
    if (!st.items.includes(id)) {
      st.items.push(id);
      fresh.items.push(id);
    }
  }
  for (const id of effect.drop || []) st.items = st.items.filter((x) => x !== id);
  for (const n of effect.show || []) st.nodes[n] = true;
  for (const n of effect.hide || []) st.nodes[n] = false;
  if ("holding" in effect) st.holding = effect.holding;
  if (effect.minutes) st.minute += effect.minutes;
  return fresh;
}

export function useSpot(st, spot) {
  st.seen[spot.id] = (st.seen[spot.id] || 0) + 1;
  const first = st.seen[spot.id] === 1;
  if (first) (st.seenAt ||= {})[spot.id] = st.minute;
  // 시간은 처음 살필 때만 든다. 다시 보는 것은 수첩을 넘기는 것과 같다.
  return apply(st, { ...spot.gives, minutes: first ? spot.minutes || 0 : 0 });
}

export const nodeVisible = (def, st, name) => (name in st.nodes ? st.nodes[name] : def.nodes?.[name] ?? true);

// 지금의 물음: 조건이 맞는 것 가운데 마지막(가장 나아간) 것
export function currentQuestion(def, st) {
  let cur = null;
  for (const q of def.questions || []) if (lockOpen(q.when, st)) cur = q;
  return cur;
}
// 물음에 쓸 카드가 몇 장 모였나 → [가진 수, 전체 수]
export function questionProgress(q, st) {
  const need = q?.cards || [];
  return [need.filter((id) => id in st.evidence).length, need.length];
}

// 시한: 지났으면 그 효과를 한 번만 적용한다
export function runDeadlines(def, st) {
  const fired = [];
  for (const d of def.deadlines || []) {
    if (st.minute >= d.at && !st.flags[`deadline_${d.id}`]) {
      if (!d.unless || !lockOpen(d.unless, st)) {
        apply(st, d.effect);
        fired.push(d);
      }
      st.flags[`deadline_${d.id}`] = true;
    }
  }
  return fired;
}
export function nextDeadline(def, st) {
  return (def.deadlines || []).filter((d) => !st.flags[`deadline_${d.id}`] && (!d.unless || !lockOpen(d.unless, st))).sort((a, b) => a.at - b.at)[0] || null;
}

// ── 대화의 공개 규칙 ──
// fact.rule: [ { trust:n } | { shown:[증거..] } | { ask:[[낱말..]..] } | { always:true } ] 가운데 하나라도 맞으면 말할 수 있다.
function ruleMatches(rule, ctx) {
  if (rule.trust != null && ctx.trust < rule.trust) return false;
  if (rule.shown && !rule.shown.every((id) => ctx.shown.includes(id))) return false;
  if (rule.ask && !rule.ask.every((group) => group.some((w) => ctx.text.includes(w)))) return false;
  if (rule.evidence && !rule.evidence.every((id) => id in ctx.evidence)) return false;
  return Boolean(rule.always || rule.trust != null || rule.shown || rule.ask || rule.evidence);
}
export function canSay(fact, ctx) {
  if (ctx.said.includes(fact.id)) return true;
  return (fact.rule || [{ always: true }]).some((r) => ruleMatches(r, ctx));
}
export function sayable(npc, ctx) {
  return npc.facts.filter((f) => canSay(f, ctx));
}
// 모델의 답을 검증한다. 말할 수 없는 사실을 밝혔으면 통째로 버린다.
export function acceptNpcReply(npc, ctx, data) {
  if (!data || typeof data.speech !== "string" || !Array.isArray(data.revealed)) return null;
  const revealed = [...new Set(data.revealed.map((id) => String(id).replace(/[[\]\s]/g, "")))];
  const allowed = new Set(sayable(npc, ctx).map((f) => f.id));
  if (revealed.some((id) => !allowed.has(id))) return null;
  return { speech: data.speech, revealed, trust_delta: Math.max(-2, Math.min(2, data.trust_delta | 0)), end: Boolean(data.end) };
}
// LLM 없이: 아직 하지 않은 말 가운데 지금 할 수 있는 것을 하나 한다.
export function ruleNpcReply(npc, ctx) {
  const polite = /부탁|감사|죄송|고맙|힘드|걱정|덕분/.test(ctx.text);
  const cands = sayable(npc, ctx).filter((f) => !ctx.said.includes(f.id));
  // 질문·제시한 증거와 맞는 것을 먼저
  const scored = cands.map((f) => ({ f, s: (f.rule || []).some((r) => (r.ask || r.shown) && ruleMatches(r, ctx)) ? 1 : 0 })).sort((a, b) => b.s - a.s);
  if (!scored.length) return { speech: npc.deflect[ctx.turn % npc.deflect.length], revealed: [], trust_delta: polite ? 1 : 0, end: false };
  const f = scored[0].f;
  return { speech: f.say || f.text, revealed: [f.id], trust_delta: polite ? 1 : 0, end: false };
}

// ── 저장 ──
export function saveSite(st) {
  try {
    localStorage.setItem(KEY + st.site, JSON.stringify(st));
  } catch { /* 저장소가 막혀 있으면 넘어간다 */ }
}
export function loadSite(def) {
  try {
    const raw = localStorage.getItem(KEY + def.id);
    if (!raw) return null;
    const st = JSON.parse(raw);
    if (!st || st.site !== def.id) return null;
    const base = newSiteState(def), out = { ...base, ...st };
    // 예전 저장에는 이어받은 카드와 증거판이 없다. 빠진 것만 채운다.
    for (const [id, at] of Object.entries(base.evidence)) out.evidence[id] ??= at;
    out.board = { ...base.board, ...(st.board || {}) };
    out.board.links = { ...base.board.links, ...(st.board?.links || {}) };
    out.board.pos = { ...base.board.pos, ...(st.board?.pos || {}) };
    return out;
  } catch {
    return null;
  }
}
export function clearSite(def) {
  try {
    localStorage.removeItem(KEY + def.id);
  } catch { /* 무시 */ }
}
