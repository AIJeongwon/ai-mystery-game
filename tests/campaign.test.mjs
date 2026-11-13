// 캠페인 — 등록된 모든 장의 정의가 서로 맞물리는지 확인한다 (콘텐츠 검사).
// 새 장을 campaign/chapters.js에 등록하면 아래 검사가 그 장에도 그대로 적용된다.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CHAPTERS, ORDER } from "../public/js/campaign/chapters.js";
import { MORO_CANON } from "../public/js/campaign/chapter1.js";
import { plantCanon, revertCanon } from "../public/js/sim/canon.js";
import { commonSense } from "../public/js/sim/lore.js";
import { EVENT_TYPES } from "../public/js/data/templates.js";
import { COUNTRIES } from "../public/js/data/countries.js";
import { ACTORS, OUTLETS, AGENDAS } from "../public/js/data/world.js";
import { fresh, walk, ROOT } from "./_helpers.mjs";

const chapters = ORDER.map((id) => CHAPTERS[id]);
const EVIDENCE = Object.assign({}, ...chapters.map((ch) => ch.evidence || {}));
const exists = (...p) => fs.existsSync(path.join(ROOT, "public", "assets", ...p));
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);

test("제1장: 열두 해 전의 문장은 세계의 상식이고, 환원하면 사라진다", () => {
  fresh(19);
  const cn = plantCanon(MORO_CANON);
  assert.ok(commonSense("404", null).some((b) => b.includes("모로 보고서")), "어느 나라에서든 상식이어야 한다");
  assert.equal(commonSense("404", null, true).some((b) => b.includes("모로 보고서")), false, "연출가에게는 넘기지 않는다");
  assert.equal(cn.puzzle.answer.stamper, "lang");
  revertCanon(cn);
  assert.equal(commonSense("404", null).some((b) => b.includes("모로 보고서")), false);
});

test("장 등록: 모든 장에 이름과 비트가 있고, 비트의 목표가 형식에 맞다", () => {
  assert.ok(chapters.length >= 2);
  assert.deepEqual(dupes(ORDER), [], "장의 id가 겹친다");
  for (const ch of chapters) {
    assert.ok(ch.id && ch.label && Array.isArray(ch.beats) && ch.beats.length, `장 ${ch.id}: id·label·beats가 있어야 한다`);
    assert.deepEqual(dupes(ch.beats.map((b) => b.id)), [], `장 ${ch.id}: 비트의 id가 겹친다`);
    for (const b of ch.beats) {
      assert.ok(b.id && (b.enter || b.objective), `비트 ${b.id}에 내용이 없다`);
      if (b.objective && typeof b.objective === "object") {
        assert.ok(b.objective.title, `비트 ${b.id}: 목표의 제목이 없다`);
        assert.deepEqual(dupes(b.objective.items.map((it) => it.id)), [], `비트 ${b.id}: 목표 항목의 id가 겹친다`);
        for (const it of b.objective.items) assert.ok(it.id && it.text && typeof it.check === "function", `비트 ${b.id}: 목표 항목 ${it.id}에 text·check가 있어야 한다`);
      }
    }
  }
});

test("증거와 추리가 맞물린다", () => {
  const all = chapters.flatMap((ch) => Object.keys(ch.evidence || {}));
  assert.deepEqual(dupes(all), [], "증거의 id가 장 사이에서 겹친다");
  for (const [id, e] of Object.entries(EVIDENCE)) assert.ok(e.no && e.title && e.short && e.body, `증거 ${id}: no·title·short·body가 있어야 한다`);
  for (const ch of chapters) {
    for (const [id, d] of Object.entries(ch.deductions || {})) {
      assert.equal(d.id, id, `추리 ${id}: 열쇠와 id가 다르다`);
      for (const e of d.need) assert.ok(EVIDENCE[e], `추리 ${id}가 없는 증거 ${e}를 요구한다`);
      assert.ok(d.options.some((o) => o.id === d.answer), `추리 ${id}의 정답이 선택지에 없다`);
      for (const o of d.options) if (o.id !== d.answer) assert.ok(o.why, `추리 ${id}의 오답 ${o.id}에 왜 틀렸는지(why)가 없다`);
      assert.ok(d.success, `추리 ${id}: 맞혔을 때의 글(success)이 없다`);
    }
  }
});

test("무대(각본 사건)의 사실·취재원·증거가 맞물린다", () => {
  const scenes = chapters.flatMap((ch) => (ch.scenes || []).map((s) => [ch.id, s]));
  assert.deepEqual(dupes(scenes.map(([, s]) => s.id)), [], "무대의 id가 겹친다");
  for (const [chId, s] of scenes) {
    const at = `${chId}/${s.id}`;
    assert.ok(EVENT_TYPES[s.type], `${at}: 없는 사건 유형 ${s.type}`);
    assert.ok(COUNTRIES[s.country] && !COUNTRIES[s.country].minor, `${at}: 없는 나라 ${s.country}`);
    if (s.agenda) assert.ok(AGENDAS.some((a) => a.id === s.agenda), `${at}: 없는 의제 ${s.agenda}`);
    assert.ok(s.nar.title && s.nar.summary && s.nar.truth, `${at}: 제목·개요·진상이 있어야 한다`);
    const factIds = s.nar.facts.map((f) => f.id);
    assert.deepEqual(dupes(factIds), [], `${at}: 사실의 id가 겹친다`);
    for (const f of s.nar.facts) {
      assert.ok(Number.isInteger(f.depth) && f.depth >= 0 && f.depth <= 3 && f.text, `${at}/${f.id}: 깊이(0~3)와 글이 있어야 한다`);
      if (f.ev) assert.ok(EVIDENCE[f.ev], `${at}/${f.id}: 없는 증거 ${f.ev}`);
    }
    const known = new Set([...factIds, ...(s.nar.rumor ? ["r0"] : [])]);
    assert.deepEqual(dupes(s.nar.sources.map((x) => x.id)), [], `${at}: 취재원의 id가 겹친다`);
    for (const src of s.nar.sources) {
      assert.ok(["friendly", "neutral", "evasive", "hostile"].includes(src.stance), `${at}/${src.id}: 태도가 올바르지 않다`);
      for (const k of [...src.knows, ...(src.lies || [])]) assert.ok(known.has(k), `${at}/${src.id}: 없는 사실 ${k}를 안다고 적혀 있다`);
      if (src.portrait) assert.ok(exists("portrait", `${src.portrait}.jpg`) && exists("portrait", "thumb", `${src.portrait}.jpg`), `${at}/${src.id}: 초상 ${src.portrait}.jpg가 없다`);
    }
    // 증언 조건(cond)이 붙은 사실은 누군가 알고 있어야 얻을 수 있다
    for (const f of s.nar.facts) if (f.cond) assert.ok(s.nar.sources.some((x) => x.knows.includes(f.id)), `${at}/${f.id}: 증언인데 아는 취재원이 없다`);
  }
});

test("미리 정해 둔 문장의 수수께끼와 환원 기사 설정이 맞물린다", () => {
  for (const ch of chapters) {
    const sceneIds = new Set((ch.scenes || []).map((s) => s.id));
    for (const cn of ch.canons || []) {
      const at = `${ch.id}/${cn.id}`;
      for (const e of cn.effects || []) {
        if (e.kind === "actor") assert.ok(ACTORS.some((a) => a.id === e.id), `${at}: 없는 행위자 ${e.id}`);
        if (e.kind === "outlet") assert.ok(OUTLETS[e.id], `${at}: 없는 매체 ${e.id}`);
      }
      const pz = cn.puzzle;
      if (!pz) continue;
      for (const s of [...pz.sentences, ...pz.stampers]) for (const e of s.need) assert.ok(EVIDENCE[e], `${at}: 환원 후보가 없는 증거 ${e}를 요구한다`);
      assert.ok(pz.sentences.some((s) => s.id === pz.answer.sentence), `${at}: 정답 문장이 후보에 없다`);
      assert.ok(pz.stampers.some((s) => s.id === pz.answer.stamper), `${at}: 정답 이름이 후보에 없다`);
      assert.ok(pz.wrong?.sentence && pz.wrong?.stamper, `${at}: 틀렸을 때의 글이 있어야 한다`);
      if (pz.final) {
        const fin = ch.finals?.[cn.id];
        assert.ok(fin, `${at}: final 수수께끼인데 환원 기사 설정(finals)이 없다`);
        assert.ok(sceneIds.has(fin.ev), `${at}: 환원 기사를 쓸 무대 ${fin.ev}가 이 장에 없다`);
        assert.ok(Array.isArray(fin.facts) && fin.facts.length && fin.guide, `${at}: 환원 기사의 근거(facts)와 안내(guide)가 있어야 한다`);
      }
    }
    for (const id of Object.keys(ch.finals || {})) assert.ok((ch.canons || []).some((cn) => cn.id === id), `${ch.id}: finals의 ${id}에 해당하는 문장이 canons에 없다`);
  }
});

test("컷신과 무대가 가리키는 그림 파일이 있다", () => {
  const missing = [];
  for (const f of walk(path.join(ROOT, "public", "js", "campaign"))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bbg: "([a-z0-9_]+)"/g)) if (!exists("bg", `${m[1]}.jpg`)) missing.push(`${path.basename(f)}: bg/${m[1]}.jpg`);
    for (const m of src.matchAll(/\bportrait: "([a-z0-9_]+)"/g)) if (!exists("portrait", `${m[1]}.jpg`)) missing.push(`${path.basename(f)}: portrait/${m[1]}.jpg`);
  }
  assert.deepEqual([...new Set(missing)], []);
});
