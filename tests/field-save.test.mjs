// 실제 진입 경로와 저장 파일 왕복으로 현장 기록 보존을 확인한다. 화면과 LLM은 실행하지 않는다.
import test from "node:test";
import assert from "node:assert/strict";
import { newGame, setG, saveGame, loadGame, exportSave, importSave } from "../public/js/core/store.js";
import { SITE_PREFIX } from "../public/js/core/field-save.js";
import { SITES, CASES } from "../public/js/data/sites/index.js";
import { newSiteState, saveSite, loadSite, loadSaved, carryInto, apply } from "../public/js/site/state.js";
import { savePhotos, loadPhotos } from "../public/js/site/photos.js";
import { prepareSite, loadCaseProgress } from "../public/js/site/progress.js";

const ROOT_KEY = "gijeongsasil.save.v1";
const gate = SITES.prologue_gate, room = SITES.mokwon_room12;
const photo = "data:image/jpeg;base64,cGhvdG8=";
function storage(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  const store = {
    get length() { return values.size; },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: store });
  t.after(() => {
    setG(null);
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  });
  return { values, store };
}
function ready() {
  const st = newSiteState(gate);
  apply(st, { evidence: Object.keys(CASES.prologue.def.evidence), flags: ["room_open", "prologue_done"] });
  st.seen.gt_stairs = 1;
  saveSite(st);
  savePhotos(st.site, { P7: photo });
  return st;
}
function enterRoom() {
  return prepareSite(new URLSearchParams("site=mokwon_room12&carry=prologue"));
}
function investigate() {
  const st = loadSite(room);
  apply(st, { evidence: ["C1", "C2"], flags: ["look_up"] });
  st.board.pos.C1 = [20, 30];
  st.board.ded.night = { slots: { where: "I5" }, solved: false, tries: 1 };
  st.statements.push({ id: "bae.1.0", who: "배수정", text: "시험실을 봉인했어요.", minute: st.minute });
  st.npc.bae = { trust: 70, said: ["b1"], turns: 1, log: [], chat: [] };
  saveSite(st);
  savePhotos(st.site, { ...loadPhotos(st.site), C1: photo });
  return st;
}

test("이어하기는 제1장의 마지막 현장을 선택하고, 계단 재진입도 기록을 덮어쓰지 않는다", (t) => {
  storage(t);
  ready();
  const q = new URLSearchParams("site=mokwon_room12&carry=prologue");
  prepareSite(q);
  assert.equal(q.has("carry"), false);
  const before = investigate();
  const resumed = prepareSite(new URLSearchParams("case=prologue"));
  assert.equal(resumed.def.id, room.id);
  assert.deepEqual(loadCaseProgress("prologue").state, before);
  enterRoom();
  assert.deepEqual(loadSite(room), before);
  assert.deepEqual(loadPhotos(room.id), { P7: photo, C1: photo });
});

test("다음 현장 표시가 없던 기존 저장도 실제 인계 기록으로 제1장에서 이어 간다", (t) => {
  const { values } = storage(t);
  const old = ready();
  const next = carryInto(room, old);
  delete old.runId;
  delete next.runId;
  apply(next, { evidence: ["C1"] });
  values.set(SITE_PREFIX + old.site, JSON.stringify(old));
  values.set(SITE_PREFIX + next.site, JSON.stringify(next));
  assert.equal(prepareSite(new URLSearchParams("case=prologue")).def.id, room.id);
  enterRoom();
  assert.ok("C1" in loadSite(room).evidence);
});

test("장 인계 전의 이어하기는 프롤로그에서 마지막으로 방문한 장소를 고른다", (t) => {
  storage(t);
  const st = newSiteState(SITES.prologue_apt);
  saveSite(st);
  assert.equal(prepareSite(new URLSearchParams("case=prologue")).def.id, st.at);
});

test("처음부터 다시 취재하면 연결된 제1장과 사진도 초기화하고 다른 저장은 보존한다", (t) => {
  const { values } = storage(t);
  ready();
  enterRoom();
  investigate();
  const desk = newSiteState(SITES.mokwon_desk);
  saveSite(desk);
  values.set("gijeongsasil.code", "시험용 코드");
  const q = new URLSearchParams("case=prologue&fresh");
  const result = prepareSite(q);
  assert.equal(result.def.id, CASES.prologue.first);
  assert.equal(result.fresh, true);
  assert.equal(q.has("fresh"), false);
  assert.equal(loadSaved("prologue"), null);
  assert.equal(loadSaved(room.id), null);
  assert.deepEqual(loadPhotos(room.id), {});
  assert.ok(loadSaved(desk.site));
  assert.equal(values.get("gijeongsasil.code"), "시험용 코드");
});

test("새 취재의 장 인계는 같은 현장에 남은 이전 취재 기록을 재사용하지 않는다", (t) => {
  storage(t);
  ready();
  enterRoom();
  const old = investigate();
  ready();
  enterRoom();
  const next = loadSite(room);
  assert.notEqual(next.runId, old.runId);
  assert.ok(!("C1" in next.evidence));
  assert.ok(!("C1" in loadPhotos(room.id)));
});

test("장 인계 중 저장에 실패하면 이전 현장과 기존 기록을 보존한다", (t) => {
  const { values, store } = storage(t);
  ready();
  const before = new Map(values), original = store.setItem;
  let writes = 0;
  t.mock.method(store, "setItem", (k, v) => {
    if (++writes === 2) throw new Error("저장 공간 부족");
    return original(k, v);
  });
  assert.throws(enterRoom, /저장 공간 부족/);
  assert.deepEqual(values, before);
  assert.equal(loadCaseProgress("prologue").def.id, gate.id);
});

test("저장 파일만으로 다른 브라우저에 단서·대화·추리 배치·사진과 이어하기 위치를 복원한다", (t) => {
  const { values } = storage(t);
  const game = newGame({ reporter: "기자", outlet: "신문", seed: 7 });
  game.campaign.flags.departed = true;
  setG(game);
  saveGame();
  ready();
  enterRoom();
  const before = investigate();
  values.set("gijeongsasil.code", "파일에 넣지 않을 시험용 접속 코드");
  const file = exportSave();
  assert.ok(!file.includes("시험용 접속 코드"));
  values.clear();
  values.set("gijeongsasil.code", "다른 브라우저의 코드");
  const imported = importSave(file);
  assert.equal(Object.hasOwn(imported, "fieldwork"), false, "백업 자료를 게임 상태에 중복 저장하지 않는다");
  assert.equal(loadGame().meta.reporter, game.meta.reporter);
  assert.deepEqual(loadCaseProgress("prologue").state, before);
  assert.equal(prepareSite(new URLSearchParams("case=prologue")).def.id, room.id);
  assert.deepEqual(loadPhotos(room.id), { P7: photo, C1: photo });
  assert.equal(values.get("gijeongsasil.code"), "다른 브라우저의 코드");
});

test("손상된 현장 백업과 허용하지 않은 사진 형식은 기존 저장을 변경하지 않는다", (t) => {
  const { values } = storage(t);
  setG(newGame({ reporter: "기자", outlet: "신문", seed: 8 }));
  saveGame();
  ready();
  enterRoom();
  const original = exportSave(), before = new Map(values);
  const changes = [
    (f) => { f.fieldwork.v = 2; },
    (f) => { f.fieldwork.sites.prologue.evidence = []; },
    (f) => { f.fieldwork.sites.prologue.minute = "잘못된 시간"; },
    (f) => { f.fieldwork.sites.prologue.site = "다른 기록"; },
    (f) => { f.fieldwork.photos.prologue.P7 = "javascript:실행금지"; },
    (f) => { f.fieldwork.sites.prologue.runId = {}; },
    (f) => { f.fieldwork.sites.prologue.npc.bae = { trust: 60, turns: 1, said: "손상된 대화", log: [] }; },
    (f) => { f.fieldwork.sites.prologue.board.ded = { night: { slots: [], solved: false, tries: 1 } }; },
    (f) => { f.fieldwork = null; },
  ];
  for (const change of changes) {
    const file = JSON.parse(original);
    change(file);
    assert.throws(() => importSave(JSON.stringify(file)), /세이브 형식/);
    assert.deepEqual(values, before);
  }
});

test("불러오기 마지막 저장에 실패해도 이미 바꾼 현장과 사진을 원래 값으로 복원한다", (t) => {
  const { values, store } = storage(t);
  setG(newGame({ reporter: "기존 기자", outlet: "신문", seed: 9 }));
  saveGame();
  ready();
  enterRoom();
  investigate();
  const file = JSON.parse(exportSave());
  file.meta.reporter = "새 기자";
  file.fieldwork.sites[room.id].minute += 30;
  delete file.fieldwork.photos[room.id];
  const before = new Map(values), original = store.setItem;
  t.mock.method(store, "setItem", (k, v) => {
    if (k === ROOT_KEY && JSON.parse(v).meta.reporter === "새 기자") throw new Error("저장 공간 부족");
    return original(k, v);
  });
  assert.throws(() => importSave(JSON.stringify(file)), /저장 공간 부족/);
  assert.deepEqual(values, before);
});

test("현장 백업이 없는 기존 파일은 읽되 현재 브라우저의 다른 취재 기록을 섞지 않는다", (t) => {
  const { values } = storage(t);
  ready();
  enterRoom();
  const old = newGame({ reporter: "예전 기자", outlet: "예전 신문", seed: 10 });
  values.set("gijeongsasil.audio", "음량 설정");
  importSave(JSON.stringify(old));
  assert.equal(loadGame().meta.reporter, "예전 기자");
  assert.equal(loadCaseProgress("prologue"), null);
  assert.equal(values.get("gijeongsasil.audio"), "음량 설정");
});
