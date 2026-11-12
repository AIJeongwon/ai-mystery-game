// 게임 시계 — 30분 단위 세계 틱, 1시간·1일 단위 처리
import { G, saveGame } from "../core/store.js";
import { emit } from "../core/bus.js";
import { dayIndex } from "../core/util.js";
import { worldTick, worldHourly } from "./world.js";
import { directorTick } from "./director.js";
import { rivalsTick, rivalsHourly } from "./rivals.js";
import { pressTick, pressHourly, dailySettlement, bindSkip } from "./press.js";
import { canonHourly } from "./canon.js";
import { chronicleHourly } from "./chronicle.js";

export const RATES = [0, 2, 6, 20]; // 실시간 1초당 게임 분
const TICK = 30;
let raf = 0;
let last = 0;
let holds = 0;
let acc = 0;
let running = false;

function tick() {
  const t = G.time;
  worldTick();
  directorTick();
  rivalsTick();
  pressTick();
  const hour = Math.floor(t.min / 60);
  if (hour !== t.lastHour) {
    t.lastHour = hour;
    worldHourly();
    rivalsHourly();
    pressHourly();
    canonHourly();
    chronicleHourly();
    emit("hour");
  }
  const day = dayIndex(t.min);
  if (day !== t.lastDay) {
    t.lastDay = day;
    const rec = dailySettlement();
    emit("day", rec);
    saveGame();
  }
  emit("tick");
}

// 분 단위로 시간을 보낸다. 30분 경계를 넘을 때마다 틱.
export function advance(minutes) {
  const t = G.time;
  let left = minutes;
  while (left > 0) {
    const toNext = TICK - (t.min % TICK);
    const step = Math.min(left, toNext);
    t.min += step;
    left -= step;
    if (t.min % TICK === 0) tick();
  }
  emit("time");
}
export function skip(minutes) {
  advance(minutes);
  emit("skip", minutes);
}
bindSkip(skip);

function frame(ts) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.25, (ts - last) / 1000);
  last = ts;
  if (!G || holds > 0) return;
  G.meta.realSeconds += dt;
  const rate = RATES[G.time.speed] || 0;
  if (!rate) return;
  acc += dt * rate;
  if (acc >= 1) {
    const whole = Math.floor(acc);
    acc -= whole;
    advance(whole);
  }
}

export function startClock() {
  if (running) return;
  running = true;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
export function stopClock() {
  running = false;
  cancelAnimationFrame(raf);
  holds = 0;
  acc = 0;
}
export function setSpeed(n) {
  if (!G) return;
  G.time.speed = Math.max(0, Math.min(3, n));
  emit("speed", G.time.speed);
}
// 모달·컷신 동안 시계를 멈춘다 (중첩 가능)
export function hold() {
  holds++;
  emit("hold", holds);
}
export function release() {
  holds = Math.max(0, holds - 1);
  emit("hold", holds);
}
export const isHeld = () => holds > 0;
