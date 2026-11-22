// 현장 기록과 사진의 저장 이름, 파일 백업, 실패 시 복원. 접속 코드와 다른 설정은 다루지 않는다.
export const SITE_PREFIX = "gijeongsasil.site.";
export const PHOTO_PREFIX = `${SITE_PREFIX}photo.`;
const idOk = (id) => typeof id === "string" && /^[a-z0-9_-]+$/i.test(id) && !["__proto__", "constructor", "prototype"].includes(id);
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const finiteValues = (v) => record(v) && Object.values(v).every(Number.isFinite);
const link = (v) => record(v) && [v.a, v.b, v.rel].every((x) => typeof x === "string");
const safeTree = (v) => {
  if (typeof v === "number") return Number.isFinite(v);
  if (!v || typeof v !== "object") return true;
  return Object.entries(v).every(([k, x]) => !["__proto__", "constructor", "prototype"].includes(k) && safeTree(x));
};
const managedKey = (key) => typeof key === "string" && (key.startsWith(PHOTO_PREFIX) ? idOk(key.slice(PHOTO_PREFIX.length)) : key.startsWith(SITE_PREFIX) && idOk(key.slice(SITE_PREFIX.length)));

function storedKeys() {
  if (typeof localStorage === "undefined") return [];
  return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(managedKey);
}

export function validFieldSave(archive) {
  if (!record(archive) || archive.v !== 1 || !record(archive.sites) || !record(archive.photos) || !safeTree(archive)) return false;
  for (const [id, st] of Object.entries(archive.sites)) {
    if (!idOk(id) || !record(st) || st.site !== id || !idOk(st.at) || !Number.isFinite(st.minute)) return false;
    for (const k of ["evidence", "seen", "flags", "nodes", "npc", "choices"]) if (!record(st[k])) return false;
    if (!strings(st.items) || !Array.isArray(st.statements) || !st.statements.every((s) => record(s) && typeof s.text === "string" && typeof s.who === "string" && Number.isFinite(s.minute))) return false;
    if (!Object.values(st.evidence).every(Number.isFinite) || !Object.values(st.seen).every(Number.isFinite)) return false;
    if (!Object.values(st.flags).every((x) => typeof x === "boolean") || !Object.values(st.nodes).every((x) => typeof x === "boolean")) return false;
    for (const k of ["board", "book", "visits", "seenAt", "hints", "rec"]) if (Object.hasOwn(st, k) && !record(st[k])) return false;
    if (Object.hasOwn(st, "runId") && (typeof st.runId !== "string" || !st.runId)) return false;
    if (Object.hasOwn(st, "nextSite") && !idOk(st.nextSite)) return false;
    for (const npc of Object.values(st.npc)) {
      if (!record(npc) || !Number.isFinite(npc.trust) || !Number.isFinite(npc.turns) || !strings(npc.said) || !Array.isArray(npc.log)) return false;
      if (!npc.log.every((entry) => record(entry) && typeof entry.a === "string" && strings(entry.revealed))) return false;
      if (Object.hasOwn(npc, "chat") && (!Array.isArray(npc.chat) || !npc.chat.every((m) => record(m) && typeof m.role === "string" && typeof m.content === "string"))) return false;
    }
    const b = st.board;
    if (b) {
      if (Object.hasOwn(b, "pos") && (!record(b.pos) || !Object.values(b.pos).every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) return false;
      if (Object.hasOwn(b, "links") && (!record(b.links) || !Object.values(b.links).every(link))) return false;
      if (Object.hasOwn(b, "more") && (!Array.isArray(b.more) || !b.more.every(link))) return false;
      for (const k of ["strip", "seen"]) if (Object.hasOwn(b, k) && !strings(b[k])) return false;
      if (Object.hasOwn(b, "wrong") && !finiteValues(b.wrong)) return false;
      if (Object.hasOwn(b, "ded") && (!record(b.ded) || !Object.values(b.ded).every((d) => record(d) && record(d.slots) && Object.values(d.slots).every((c) => typeof c === "string") && typeof d.solved === "boolean" && Number.isFinite(d.tries)))) return false;
    }
  }
  for (const [id, photos] of Object.entries(archive.photos)) {
    if (!idOk(id) || !record(photos) || !Object.values(photos).every((url) => typeof url === "string" && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(url))) return false;
  }
  return true;
}

export function captureFieldSave() {
  const archive = { v: 1, sites: {}, photos: {} };
  for (const key of storedKeys()) {
    const photos = key.startsWith(PHOTO_PREFIX);
    const id = key.slice(photos ? PHOTO_PREFIX.length : SITE_PREFIX.length);
    try {
      archive[photos ? "photos" : "sites"][id] = JSON.parse(localStorage.getItem(key));
    } catch {
      throw new Error("현장 기록이 손상돼 저장 파일을 만들지 못했습니다.");
    }
  }
  if (!validFieldSave(archive)) throw new Error("현장 기록의 형식이 맞지 않아 저장 파일을 만들지 못했습니다.");
  return archive;
}

export function fieldSaveWrites(archive) {
  if (!validFieldSave(archive)) throw new Error("세이브 형식이 맞지 않습니다: 현장 기록");
  const next = new Map();
  for (const [id, st] of Object.entries(archive.sites)) next.set(SITE_PREFIX + id, JSON.stringify(st));
  for (const [id, photos] of Object.entries(archive.photos)) next.set(PHOTO_PREFIX + id, JSON.stringify(photos));
  return [...storedKeys().filter((key) => !next.has(key)).map((key) => [key, null]), ...next];
}

// 여러 항목 가운데 하나라도 저장되지 않으면, 이미 변경한 항목을 원래 값으로 되돌린다.
export function writeStorage(entries) {
  const writes = [...new Map(entries)];
  const before = new Map(writes.map(([key]) => [key, localStorage.getItem(key)]));
  const changed = [];
  try {
    for (const [key, value] of writes) {
      if (before.get(key) === value) continue;
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      changed.push(key);
    }
  } catch (error) {
    const failures = [];
    // 먼저 새 값을 비워야 용량 부족이 발생했어도 이전 값이 들어갈 자리가 생긴다.
    for (const key of changed) {
      try { localStorage.removeItem(key); } catch (e) { failures.push(e); }
    }
    for (const key of changed) {
      if (before.get(key) === null) continue;
      try { localStorage.setItem(key, before.get(key)); } catch (e) { failures.push(e); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], "저장 실패 후 기존 기록을 완전히 복원하지 못했습니다.");
    throw error;
  }
}
