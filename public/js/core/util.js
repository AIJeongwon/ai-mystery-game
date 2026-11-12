// 공용 유틸리티
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
export const by = (f, dir = 1) => (a, b) => (f(a) - f(b)) * dir;
export const uniq = (arr) => [...new Set(arr)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 난수 (세이브에 상태 저장) ──
let rngHolder = { s: 123456789 };
export function bindRng(holder) {
  rngHolder = holder;
}
export function rnd() {
  let t = (rngHolder.s += 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rand = (a = 1, b) => (b === undefined ? rnd() * a : a + rnd() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const chance = (p) => rnd() < p;
export const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
export function pickWeighted(items, weightFn) {
  let total = 0;
  const ws = items.map((it) => {
    const w = Math.max(0, weightFn(it));
    total += w;
    return w;
  });
  if (total <= 0) return items.length ? pick(items) : undefined;
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 문자열 → 0..1 고정 해시 (난수 상태를 건드리지 않는 결정적 값)
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

let idCounter = { n: 1 };
export function bindIds(holder) {
  idCounter = holder;
}
export const uid = (prefix = "x") => `${prefix}${(idCounter.n++).toString(36)}`;

// ── 게임 시간 ── (분 단위. 0 = 2031-03-03 08:00)
export const EPOCH_UTC = Date.UTC(2031, 2, 3, 8, 0);
export const DAY = 1440;
export const HOUR = 60;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function gameDate(min) {
  return new Date(EPOCH_UTC + min * 60000);
}
export const dayIndex = (min) => Math.floor((min + 8 * 60) / DAY); // 자정 기준 일차 (0부터)
export const minuteOfDay = (min) => (((min + 8 * 60) % DAY) + DAY) % DAY;
const p2 = (n) => String(n).padStart(2, "0");
export function fmtDate(min, opt = {}) {
  const d = gameDate(min);
  const md = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  const wd = `(${WEEK[d.getUTCDay()]})`;
  const hm = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  if (opt.short) return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hm}`;
  if (opt.dateOnly) return `${d.getUTCFullYear()}년 ${md} ${wd}`;
  if (opt.md) return `${md} ${wd}`;
  return `${d.getUTCFullYear()}년 ${md} ${wd} ${hm}`;
}
export const fmtTime = (min) => {
  const m = minuteOfDay(min);
  return `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
};
export function fmtDuration(mins) {
  mins = Math.max(0, Math.round(mins));
  if (mins < 60) return `${mins}분`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}시간 ${m}분` : `${h}시간`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}일 ${h % 24}시간` : `${d}일`;
}
export function fmtAgo(now, then) {
  const d = now - then;
  if (d < 30) return "방금";
  return `${fmtDuration(d)} 전`;
}

// ── 숫자 표기 ──
export function fmtNum(n) {
  n = Math.round(n);
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(a >= 1e9 ? 1 : 2).replace(/\.?0+$/, "")}억`;
  if (a >= 1e4) return `${(n / 1e4).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, "")}만`;
  return n.toLocaleString("ko-KR");
}
export function fmtWon(n) {
  n = Math.round(n);
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e8) return `${sign}₩${(a / 1e8).toFixed(2).replace(/\.?0+$/, "")}억`;
  if (a >= 1e4) return `${sign}₩${Math.round(a / 1e4).toLocaleString("ko-KR")}만`;
  return `${sign}₩${a.toLocaleString("ko-KR")}`;
}
export const fmtPct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
export const signed = (n, d = 0) => `${n > 0 ? "+" : ""}${n.toFixed(d)}`;

// ── 지리 ──
const RAD = Math.PI / 180;
export function geoDistKm(lon1, lat1, lon2, lat2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ── 한국어 조사 ──
export function josa(word, pair) {
  // pair: "이/가", "을/를", "은/는", "과/와", "으로/로"
  const [a, b] = pair.split("/");
  const ch = String(word).trim().slice(-1);
  const code = ch.charCodeAt(0);
  let hasFinal = false;
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    hasFinal = jong !== 0;
    if (pair === "으로/로" && jong === 8) hasFinal = false; // ㄹ 받침
  } else if (/[0-9]/.test(ch)) {
    hasFinal = "013678".includes(ch);
  } else if (/[a-zA-Z]/.test(ch)) {
    hasFinal = /[lmnrLMNR]/.test(ch);
  }
  return word + (hasFinal ? a : b);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// LLM 출력 정리: 괄호 주석·JSON 조각·한자 누출 방지
export function cleanText(s, max = 600) {
  if (typeof s !== "string") return "";
  let t = s
    .replace(/\s*\((허구|가상|가명|fiction|fictional)[^)]*\)/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/[`{}\[\]]/g, "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > max) t = t.slice(0, max - 1) + "…";
  return t;
}

// 문장 분리 (한국어 기사 본문용)
export function splitSentences(text) {
  const out = [];
  const re = /[^.!?。\n]+[.!?。]+["”’」』)]*|[^.!?。\n]+(?=\n|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const s = m[0].trim();
    if (s) out.push({ text: s, start: m.index + m[0].indexOf(s), end: m.index + m[0].indexOf(s) + s.length });
  }
  return out;
}

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}
