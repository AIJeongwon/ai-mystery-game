// 콘텐츠 검사 — 사건 유형, 의제, 행위자, 언론사, 도시, 이름 풀, 성장 체계의 정의가 형식에 맞고 서로 맞물리는지 확인한다.
// 데이터를 더하거나 고친 뒤 이 시험이 통과하면, 적어도 "없는 것을 가리키는" 실수는 없다.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { COUNTRIES, REGIONS } from "../public/js/data/countries.js";
import {
  CATS, CAT_KEYS, HOME, OUTLETS, RIVAL_IDS, CITIES, ACTORS, AGENDAS, SCHEDULE_KINDS,
  NAME_POOLS, CULTURE_BY_COUNTRY, CULTURE_BY_REGION, PORTRAIT_BY_REGION, HEAD_TITLE,
} from "../public/js/data/world.js";
import { EVENT_TYPES, EVENT_TYPE_KEYS, STAGES, SIG_LABEL } from "../public/js/data/templates.js";
import { TIERS, UPGRADES, SKILLS, STAMP, SCOPES, HOLD_MIN, SLOT_COUNT, ECON } from "../public/js/data/progress.js";
import { ROOT } from "./_helpers.mjs";

const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);
const country = (id) => COUNTRIES[id] && !COUNTRIES[id].minor;
const between = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const PLACEHOLDERS = new Set(["actor", "org", "city", "country", "n1", "n2", "p1", "p2", "p3"]);
const badPlaceholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !PLACEHOLDERS.has(k));
// 사건이 종결될 때 엔진(sim/world/events.js의 closeEvent)이 실제로 반영하는 영향 항목
const IMPACT_APPLIED = ["stab", "appr", "econ", "tens", "rep"];
// 데이터에는 적혀 있지만 엔진이 아직 읽지 않는 항목 (알려진 문제: docs/roadmap/known-issues.md의 A-18)
const IMPACT_PENDING = ["attn", "press"];
// 가중치 함수에 넘어가는 것과 같은 모양(나라의 고정 값 + 움직이는 값)
const sample = (id) => ({ ...COUNTRIES[id], stab: COUNTRIES[id].stab, appr: 46, econ: 50, tens: 20, attn: 30 });

test("사건 유형: 형식과 규칙 서사 틀", () => {
  assert.ok(Object.keys(EVENT_TYPES).length >= 30);
  for (const [key, t] of Object.entries(EVENT_TYPES)) {
    assert.ok(CATS[t.cat], `${key}: 없는 분야 ${t.cat}`);
    assert.ok(t.label, `${key}: 이름(label)이 없다`);
    assert.ok(Array.isArray(t.sig) && t.sig.length === 2 && between(t.sig[0], 1, 5) && between(t.sig[1], t.sig[0], 5), `${key}: 규모 범위가 올바르지 않다`);
    assert.ok(t.start === 0 || t.start === 1, `${key}: 시작 국면은 0(소문)이나 1(발생)이어야 한다`);
    assert.ok(Array.isArray(t.dur) && t.dur.length === 4 && t.dur.every((h) => h > 0), `${key}: 국면별 지속 시간 넷이 있어야 한다`);
    assert.ok([undefined, "gov", "corp"].includes(t.actor), `${key}: actor는 gov나 corp여야 한다`);
    for (const id of ["410", "840", "404"]) assert.ok(between(t.w(sample(id)), 0, 100), `${key}: 가중치 함수가 ${id}에서 올바른 수를 내지 않는다`);
    for (const k of Object.keys(t.impact)) assert.ok(IMPACT_APPLIED.includes(k) || IMPACT_PENDING.includes(k), `${key}: 모르는 영향 항목 ${k}`);
    assert.ok(typeof t.hint === "string" && t.hint.length > 10, `${key}: LLM 지침(hint)이 없다`);
    if (t.out) assert.ok(t.out.length === 2 && t.out.every((s) => typeof s === "string" && s), `${key}: 결말 문구는 둘이어야 한다`);
    // 규칙 서사 틀: LLM이 없을 때 이것으로 사건을 만든다
    const fb = t.fb;
    assert.ok(fb && fb.title && fb.summary && fb.rumor, `${key}: 규칙 서사 틀(fb)에 제목·개요·소문이 있어야 한다`);
    assert.ok(fb.facts.length >= 4, `${key}: 사실이 넷 이상이어야 한다`);
    for (const [depth, text] of fb.facts) assert.ok(between(depth, 0, 3) && Number.isInteger(depth) && text, `${key}: 사실은 [깊이 0~3, 글]이어야 한다`);
    assert.ok(fb.facts.some(([d]) => d === 0) && fb.facts.some(([d]) => d >= 2), `${key}: 공개 사실(0)과 깊은 사실(2 이상)이 모두 있어야 한다`);
    assert.ok(fb.sources.length >= 2, `${key}: 취재원이 둘 이상이어야 한다`);
    for (const [role, stance, knows, persona] of fb.sources) {
      assert.ok(role && persona && ["friendly", "neutral", "evasive", "hostile"].includes(stance), `${key}: 취재원은 [직함, 태도, 아는 사실, 성격]이어야 한다`);
      for (const i of knows) assert.ok(Number.isInteger(i) && i >= 0 && i < fb.facts.length, `${key}: 취재원이 없는 사실 번호 ${i}를 안다고 적혀 있다`);
    }
    const texts = [fb.title, fb.summary, fb.rumor, ...fb.facts.map((f) => f[1]), ...fb.sources.map((s) => s[0])];
    assert.deepEqual(texts.flatMap(badPlaceholders), [], `${key}: 모르는 치환자가 있다`);
  }
  for (const k of EVENT_TYPE_KEYS) assert.ok(EVENT_TYPES[k]);
  assert.ok(!EVENT_TYPE_KEYS.includes("rift") && !EVENT_TYPE_KEYS.includes("aftermath"), "특수 유형은 저절로 생기지 않아야 한다");
  for (const cat of CAT_KEYS) assert.ok(EVENT_TYPE_KEYS.some((k) => EVENT_TYPES[k].cat === cat), `분야 ${cat}에 사건 유형이 하나도 없다`);
  assert.equal(STAGES.length, 5);
  assert.equal(SIG_LABEL.length, 6);
});

// 알려진 문제(docs/roadmap/known-issues.md의 A-18): 여덟 유형이 엔진이 읽지 않는 영향 항목(attn, press)을 갖고 있어, 종결돼도 그 영향이 세계에 반영되지 않는다.
// 엔진에 구현하거나 데이터에서 지우면 todo 표시를 뗀다.
test("사건 유형: 적어 둔 영향 항목을 엔진이 모두 반영한다", { todo: "알려진 문제 A-18 — attn·press 영향이 구현돼 있지 않다" }, () => {
  const pending = Object.entries(EVENT_TYPES).flatMap(([key, t]) => Object.keys(t.impact).filter((k) => !IMPACT_APPLIED.includes(k)).map((k) => `${key}.${k}`));
  assert.deepEqual(pending, []);
});

test("일정 종류와 의제", () => {
  for (const [kind, def] of Object.entries(SCHEDULE_KINDS)) assert.ok(def.label && EVENT_TYPES[def.evType], `일정 ${kind}: 없는 사건 유형 ${def.evType}`);
  assert.deepEqual(dupes(AGENDAS.map((a) => a.id)), [], "의제의 id가 겹친다");
  const actorIds = new Set(ACTORS.map((a) => a.id));
  for (const a of AGENDAS) {
    assert.ok(CATS[a.cat], `의제 ${a.id}: 없는 분야 ${a.cat}`);
    assert.ok(a.country === null || country(a.country), `의제 ${a.id}: 없는 나라 ${a.country}`);
    assert.ok(a.title && a.desc && between(a.progress, 1, 99), `의제 ${a.id}: 제목·설명·향방(1~99)이 있어야 한다`);
    assert.ok(a.poles.length === 2 && a.poles.every(Boolean), `의제 ${a.id}: 결말은 둘이어야 한다`);
    for (const id of a.actors) assert.ok(actorIds.has(id), `의제 ${a.id}: 없는 행위자 ${id}`);
    assert.ok(a.kinds.length, `의제 ${a.id}: 일정 종류가 하나는 있어야 한다`);
    for (const k of a.kinds) assert.ok(SCHEDULE_KINDS[k], `의제 ${a.id}: 없는 일정 종류 ${k}`);
  }
});

test("행위자와 언론사", () => {
  assert.deepEqual(dupes(ACTORS.map((a) => a.id)), [], "행위자의 id가 겹친다");
  for (const a of ACTORS) {
    assert.ok(["gov", "opp", "corp", "org", "fig"].includes(a.kind), `행위자 ${a.id}: 모르는 종류 ${a.kind}`);
    assert.ok(a.country === null || country(a.country), `행위자 ${a.id}: 없는 나라 ${a.country}`);
    assert.ok(a.name && a.role && between(a.rep, 0, 100) && between(a.power, 0, 100), `행위자 ${a.id}: 이름·직함·평판·영향력이 있어야 한다`);
  }
  assert.ok(country(HOME) && OUTLETS.player.hq === HOME);
  assert.ok(RIVAL_IDS.length >= 1 && !RIVAL_IDS.includes("player"));
  for (const id of RIVAL_IDS) {
    const o = OUTLETS[id];
    assert.equal(o.id, id);
    assert.ok(o.name && o.short && o.desc && /^#[0-9a-f]{6}$/i.test(o.color), `매체 ${id}: 이름·설명·색이 있어야 한다`);
    assert.ok(country(o.hq), `매체 ${id}: 없는 본사 나라 ${o.hq}`);
    assert.ok(["dry", "analytic", "tabloid"].includes(o.style), `매체 ${id}: 문체는 dry·analytic·tabloid 가운데 하나`);
    assert.ok(between(o.cred, 0, 100) && between(o.speed, 0, 1) && between(o.depth, 0, 1) && between(o.tone, 0, 1), `매체 ${id}: 수치 범위`);
    for (const k of Object.keys(o.cats)) assert.ok(CATS[k], `매체 ${id}: 없는 분야 ${k}`);
    for (const [r, share] of Object.entries(o.regions || {})) assert.ok(REGIONS[r] && between(share, 0, 0.45), `매체 ${id}: 권역 ${r}의 점유율`);
    for (const [c, share] of Object.entries(o.countries || {})) assert.ok(country(c) && between(share, 0, 0.45), `매체 ${id}: 나라 ${c}의 점유율`);
  }
});

test("도시, 이름 풀, 초상", () => {
  for (const [id, list] of Object.entries(CITIES)) {
    assert.ok(country(id), `도시 목록: 없는 나라 ${id}`);
    for (const [name, lon, lat] of list) assert.ok(name && between(lon, -180, 180) && between(lat, -90, 90), `도시 ${id}/${name}: 좌표`);
  }
  for (const r of Object.keys(REGIONS)) {
    assert.ok(NAME_POOLS[CULTURE_BY_REGION[r]]?.length, `권역 ${r}: 이름 풀이 없다`);
    assert.ok(HEAD_TITLE[r], `권역 ${r}: 수반 직함이 없다`);
    assert.ok(PORTRAIT_BY_REGION[r]?.length, `권역 ${r}: 초상 풀이 없다`);
  }
  for (const [id, culture] of Object.entries(CULTURE_BY_COUNTRY)) assert.ok(COUNTRIES[id] && NAME_POOLS[culture], `문화권 지정 ${id} → ${culture}`);
  const dir = path.join(ROOT, "public", "assets", "portrait");
  const missing = [];
  for (const p of new Set(Object.values(PORTRAIT_BY_REGION).flat())) {
    for (const g of ["m", "f"]) for (const n of [1, 2]) for (const sub of ["", "thumb"]) {
      const f = path.join(dir, sub, `g_${p}_${g}${n}.jpg`);
      if (!fs.existsSync(f)) missing.push(path.relative(dir, f));
    }
  }
  assert.deepEqual(missing, [], "범용 초상 파일이 빠졌다");
});

test("성장 체계: 등급, 설비, 역량, 각인, 경제 상수", () => {
  TIERS.forEach((t, i) => {
    assert.equal(t.lv, i + 1);
    if (i) {
      assert.ok(t.cost > (TIERS[i - 1].cost ?? 0) && t.need.subs > (TIERS[i - 1].need.subs ?? 0) && t.need.cred >= (TIERS[i - 1].need.cred ?? 0), `등급 ${t.lv}: 조건이 앞 등급보다 높아야 한다`);
      assert.ok(t.staff >= TIERS[i - 1].staff && t.bureaus >= TIERS[i - 1].bureaus && t.reach > TIERS[i - 1].reach, `등급 ${t.lv}: 한도가 앞 등급보다 줄지 않아야 한다`);
      assert.ok((t.need.bureaus ?? 0) <= TIERS[i - 1].bureaus, `등급 ${t.lv}: 승격에 필요한 지국 수를 앞 등급에서 열 수 있어야 한다`);
    }
  });
  assert.equal(ECON.rentDaily.length, TIERS.length, "운영비는 등급마다 하나씩");
  for (const [k, u] of Object.entries(UPGRADES)) {
    assert.ok(u.name && u.desc && typeof u.eff === "function", `설비 ${k}`);
    assert.equal(u.cost.length, u.max, `설비 ${k}: 비용은 단계마다 하나씩`);
    assert.ok(u.cost.every((c, i) => c > 0 && (i === 0 || c > u.cost[i - 1])), `설비 ${k}: 비용이 단계마다 올라야 한다`);
  }
  for (const [k, s] of Object.entries(SKILLS)) assert.ok(s.name && s.desc && s.max > 0 && typeof s.eff === "function", `역량 ${k}`);
  for (const [k, s] of Object.entries(STAMP)) {
    assert.ok(s.name && s.desc && typeof s.eff === "function", `각인 ${k}`);
    assert.equal(s.cost.length, s.max, `각인 ${k}: 비용은 단계마다 하나씩`);
    for (let lv = 1; lv <= s.max; lv++) assert.ok(typeof s.eff(lv) === "string", `각인 ${k}: ${lv}단의 설명`);
  }
  assert.equal(SCOPES.length, STAMP.scope.max);
  assert.equal(HOLD_MIN.length, STAMP.hold.max);
  assert.equal(SLOT_COUNT.length, STAMP.slots.max);
});
