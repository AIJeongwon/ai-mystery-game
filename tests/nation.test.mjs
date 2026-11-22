// 본 게임의 진입 — 세계지도 → 국가 지도 → 사건 개요 → 현장. 화면 없이 자료와 규칙만 본다.
// 시·도 경계 자료, 사건 핀, 현장 취재로 진행하는 장, 옛 프롤로그 저장의 처리.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NATION_MAPS, CASE_PINS, HOME_BASE, casesIn, caseCounts } from "../public/js/data/cases.js";
import { decodeRings, pointInRings, boundsOf } from "../public/js/core/geo.js";
import { COUNTRIES } from "../public/js/data/countries.js";
import { CHAPTERS } from "../public/js/campaign/chapters.js";
import { FIELD_CHAPTERS, fieldMode, newGame, setG, saveGame, loadGame } from "../public/js/core/store.js";
import { SITES, CASES } from "../public/js/data/sites/index.js";
import { fmtClock } from "../public/js/site/state.js";
import { ROOT } from "./_helpers.mjs";

const readNation = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, "public", "assets", "geo", `admin1-${id}.json`), "utf8"));
const NATIONS = Object.fromEntries(Object.keys(NATION_MAPS).map((id) => [id, readNation(id)]));
const ringsOf = (id, regionId) => {
  const r = NATIONS[id].regions.find((x) => x.id === regionId);
  return r ? decodeRings(r.rings, NATIONS[id].scale) : null;
};

test("시·도 자료: 한국 17곳, 일본 47곳이 이름과 경계를 갖고 있다", () => {
  assert.deepEqual(Object.keys(NATION_MAPS).sort(), ["392", "410"]);
  const count = { "410": 17, "392": 47 };
  for (const [id, data] of Object.entries(NATIONS)) {
    assert.ok(COUNTRIES[id] && !COUNTRIES[id].minor, `${id}: 세계지도에서 고를 수 있는 나라여야 한다`);
    assert.equal(data.country, id);
    assert.equal(data.regions.length, count[id]);
    assert.equal(new Set(data.regions.map((r) => r.id)).size, data.regions.length, `${id}: 시·도의 번호가 겹친다`);
    assert.equal(new Set(data.regions.map((r) => r.ko)).size, data.regions.length, `${id}: 시·도의 이름이 겹친다`);
    const [[w, s], [e, n]] = NATION_MAPS[id].fit;
    for (const r of data.regions) {
      assert.match(r.id, /^[A-Z]{2}-\d+$/);
      assert.ok(r.ko && r.full && /[가-힣]/.test(r.ko), `${r.id}: 한글 이름이 있어야 한다`);
      const rings = decodeRings(r.rings, data.scale);
      assert.ok(rings.length && rings.every((ring) => ring.length >= 4), `${r.id}: 고리마다 점이 넷은 있어야 한다`);
      for (const ring of rings) assert.deepEqual(ring[0], ring.at(-1), `${r.id}: 고리가 닫혀 있지 않다`);
      const [bw, bs, be, bn] = boundsOf(rings);
      assert.ok(r.at[0] >= bw && r.at[0] <= be && r.at[1] >= bs && r.at[1] <= bn, `${r.id}: 이름표가 경계 밖에 있다`);
      // 처음 화면(fit)에 이름표가 들어와야 한다: 본토가 잘리지 않았는지 본다
      assert.ok(r.at[0] > w && r.at[0] < e && r.at[1] > s && r.at[1] < n, `${r.id} ${r.ko}: 처음 화면 밖에 있다`);
    }
  }
  assert.equal(NATIONS["410"].regions.find((r) => r.id === "KR-11").ko, "서울");
  assert.equal(NATIONS["410"].regions.find((r) => r.id === "KR-42").full, "강원특별자치도");
  assert.equal(NATIONS["392"].regions.find((r) => r.id === "JP-13").ko, "도쿄");
  assert.equal(NATIONS["392"].regions.find((r) => r.id === "JP-01").ko, "홋카이도");
});

test("점이 시·도 안에 있는지 가린다 (구멍과 섬이 섞여 있어도)", () => {
  const seoul = ringsOf("410", "KR-11"), gyeonggi = ringsOf("410", "KR-41");
  assert.ok(pointInRings(seoul, 126.98, 37.57), "서울 시청은 서울 안이다");
  assert.equal(pointInRings(gyeonggi, 126.98, 37.57), false, "서울은 경기도의 구멍이다");
  assert.ok(pointInRings(gyeonggi, 127.03, 37.27), "수원은 경기도 안이다");
  assert.equal(pointInRings(seoul, 129.08, 35.18), false);
});

test("사건 핀: 지도가 있는 나라의 시·도 안에 꽂히고, 현장의 사건 자료와 맞는다", () => {
  assert.ok(CASE_PINS.length >= 1);
  assert.equal(new Set(CASE_PINS.map((c) => c.id)).size, CASE_PINS.length, "사건의 id가 겹친다");
  for (const c of CASE_PINS) {
    assert.ok(NATION_MAPS[c.country], `${c.id}: 시·도 지도가 없는 나라다`);
    const rings = ringsOf(c.country, c.region);
    assert.ok(rings, `${c.id}: 없는 시·도 ${c.region}`);
    assert.ok(pointInRings(rings, ...c.at), `${c.id}: 핀이 ${c.region} 밖에 있다`);
    assert.ok(c.eyebrow && c.title && c.where && c.when && c.travel, `${c.id}: 개요의 칸이 비었다`);
    assert.ok(c.outline.length >= 2 && c.outline.length <= 5 && c.outline.every((t) => t.trim().endsWith(".")), `${c.id}: 개요는 두 줄에서 다섯 줄의 문장이다`);
    // 현장과 이어진다: 주소(/site.html?case=<id>), 저장 이름, 처음 들어설 곳과 시각
    const kase = CASES[c.id];
    assert.ok(kase, `${c.id}: 현장의 사건 자료가 없다`);
    assert.equal(kase.def.save, c.id, "본 게임은 사건의 id로 현장의 저장을 읽는다");
    assert.equal(c.first.place, SITES[kase.first].place);
    assert.equal(c.first.clock, fmtClock(kase.def.start.minute));
    assert.ok(kase.title.includes(c.title.replace(/[「」]/g, "")), "제목이 현장의 사건 이름과 다르다");
    for (const s of kase.sites) assert.ok(SITES[s].place, `${s}: 장소 이름(place)이 있어야 개요에 '지금 있는 곳'이 뜬다`);
  }
  assert.ok(pointInRings(ringsOf(HOME_BASE.country, HOME_BASE.region), ...HOME_BASE.at), "기자의 집이 시·도 밖에 있다");
  assert.deepEqual(casesIn("410").map((c) => c.id), ["prologue"]);
  assert.deepEqual(casesIn("392"), []);
  assert.deepEqual(caseCounts(), { "410": 1 });
});

test("개요에는 현장에서 알아낼 것을 적지 않는다", () => {
  // 지도에서는 누구나 아는 것만 보인다. 사람 이름, 학교와 학원, 수법은 현장에서 나온다.
  const spoilers = ["도현", "목원", "서로재수", "가람", "안경", "사인펜", "펜", "배수정", "7명", "14번"];
  for (const c of CASE_PINS) {
    const text = [c.title, c.where, c.when, c.travel, ...c.outline].join(" ");
    for (const w of spoilers) assert.equal(text.includes(w), false, `${c.id}: 개요에 '${w}'가 있다`);
  }
});

test("현장 취재로 진행하는 장: 새 게임은 프롤로그에서 시작하고, 건너뛰면 예전 방식이다", () => {
  for (const id of FIELD_CHAPTERS) assert.equal(CHAPTERS[id]?.field, true, `${id}: 장의 정의에 field: true가 있어야 한다`);
  for (const ch of Object.values(CHAPTERS)) assert.equal(Boolean(ch.field), FIELD_CHAPTERS.has(ch.id), `${ch.id}: FIELD_CHAPTERS와 다르다`);
  const g = newGame({ reporter: "시험", outlet: "시험일보", seed: 3 });
  assert.equal(g.campaign.ch, "prologue");
  assert.ok(fieldMode(g));
  const old = newGame({ reporter: "시험", outlet: "시험일보", seed: 3, skipPrologue: true });
  assert.equal(fieldMode(old), false);
  assert.ok(old.campaign.flags.prologueDone && old.canon.unlocked, "건너뛰면 도장을 가진 채 옛 제1장으로 간다");
  // 프롤로그는 다음 장으로 넘어가지 않는다 (현장에서 돌아오는 길이 정해질 때까지)
  const beat = CHAPTERS.prologue.beats.at(-1);
  g.campaign.flags = { nationOpened: true, caseSeen: true, departed: true };
  assert.ok(beat.objective.items.every((it) => it.check(g)));
  assert.equal(beat.done(g), false);
  assert.match(beat.objective.hint(g), /현장/);
});

test("옛 프롤로그 도중의 저장은 새 프롤로그의 처음으로 돌아간다", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k) } });
  t.after(() => {
    setG(null);
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  });
  const g = newGame({ reporter: "시험", outlet: "시험일보", seed: 5 });
  Object.assign(g.campaign, { beat: 4, entered: true, flags: { quietWorld: true, met: true }, objectives: [{ chapter: "프롤로그 · 첫 문장", title: "옛 목표", hint: "", items: [{ id: "write", text: "기사를 쓴다", done: false }] }] });
  setG(g);
  saveGame();
  const back = loadGame();
  assert.deepEqual([back.campaign.ch, back.campaign.beat, back.campaign.entered, back.campaign.objectives.length], ["prologue", 0, false, 0]);
  // 새 프롤로그의 저장은 그대로 읽는다
  Object.assign(back.campaign, { entered: true, flags: { quietWorld: true, nationOpened: true }, objectives: [{ chapter: "프롤로그 · 시험 전", title: "t", hint: "", items: [{ id: "nation", text: "t", done: true }] }] });
  setG(back);
  saveGame();
  const again = loadGame();
  assert.equal(again.campaign.entered, true);
  assert.equal(again.campaign.flags.nationOpened, true);
});
