// 절차적 사운드 — 효과음과 배경 음악을 모두 WebAudio로 합성한다 (음원 파일 없음)
const KEY = "gijeongsasil.audio";
const st = { sfx: 0.7, music: 0.45, ...load() };
let ctx = null, master, sfxBus, musicBus, reverb, delay;
let musicTimer = 0, mood = "off", wantMood = "off", step = 0, nextTime = 0, padNodes = [];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sfx: st.sfx, music: st.music }));
  } catch { /* 무시 */ }
}
export const volumes = () => ({ sfx: st.sfx, music: st.music });
export function setVolume(kind, v) {
  st[kind] = Math.max(0, Math.min(1, v));
  persist();
  if (!ctx) return;
  if (kind === "sfx") sfxBus.gain.value = st.sfx;
  else musicBus.gain.setTargetAtTime(st.music * 0.5, ctx.currentTime, 0.2);
}

function impulse(seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createDynamicsCompressor();
  master.threshold.value = -14;
  master.ratio.value = 4;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = st.sfx;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = st.music * 0.5;
  musicBus.connect(master);
  reverb = ctx.createConvolver();
  reverb.buffer = impulse(3.2, 2.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  reverb.connect(wet).connect(musicBus);
  delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.46;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  delay.connect(fb).connect(delay);
  delay.connect(reverb);
  if (wantMood !== "off") startMusic(wantMood);
}
// 첫 사용자 입력에서 오디오를 깨운다
if (typeof window !== "undefined") {
  const wake = () => initAudio();
  window.addEventListener("pointerdown", wake, { once: false, passive: true });
  window.addEventListener("keydown", wake, { once: false, passive: true });
}

// ── 합성 도우미 ──
function env(g, t, a, d, peak) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone({ type = "sine", f, f2, t = 0, a = 0.005, d = 0.2, peak = 0.3, out = sfxBus }) {
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + a + d);
  env(g, now, a, d, peak);
  o.connect(g).connect(out);
  o.start(now);
  o.stop(now + a + d + 0.05);
}
let noiseBuf = null;
function noise({ t = 0, d = 0.1, peak = 0.3, type = "bandpass", f = 2000, q = 1, f2, out = sfxBus }) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const now = ctx.currentTime + t;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(f, now);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, now + d);
  flt.Q.value = q;
  const g = ctx.createGain();
  env(g, now, 0.004, d, peak);
  s.connect(flt).connect(g).connect(out);
  s.start(now, Math.random() * 0.5);
  s.stop(now + d + 0.05);
}

const SFX = {
  click: () => { noise({ d: 0.03, peak: 0.16, f: 3200, q: 2 }); tone({ type: "triangle", f: 1400, f2: 900, d: 0.04, peak: 0.07 }); },
  hover: () => tone({ type: "sine", f: 1900, d: 0.03, peak: 0.025 }),
  key: () => { noise({ d: 0.028, peak: 0.13, f: 2400 + Math.random() * 1600, q: 3 }); tone({ type: "square", f: 220 + Math.random() * 60, d: 0.02, peak: 0.03 }); },
  tick: () => noise({ d: 0.02, peak: 0.05, f: 5200, q: 6 }),
  paper: () => noise({ d: 0.28, peak: 0.13, type: "bandpass", f: 900, f2: 3400, q: 0.7 }),
  open: () => { noise({ d: 0.16, peak: 0.08, f: 1200, f2: 2600, q: 0.8 }); tone({ f: 520, f2: 780, d: 0.12, peak: 0.05 }); },
  close: () => tone({ f: 620, f2: 380, d: 0.1, peak: 0.05 }),
  ding: () => { tone({ f: 1318, d: 0.5, peak: 0.1 }); tone({ f: 1975, d: 0.4, peak: 0.05, t: 0.02 }); },
  lead: () => { tone({ type: "triangle", f: 660, d: 0.25, peak: 0.11 }); tone({ type: "triangle", f: 990, d: 0.3, peak: 0.08, t: 0.09 }); },
  breaking: () => { for (let i = 0; i < 3; i++) tone({ type: "square", f: 880, d: 0.07, peak: 0.05, t: i * 0.11 }); },
  good: () => [523, 659, 784, 1046].forEach((f, i) => tone({ type: "triangle", f, d: 0.32, peak: 0.1, t: i * 0.075 })),
  bad: () => { tone({ type: "sawtooth", f: 196, f2: 150, d: 0.4, peak: 0.08 }); tone({ type: "sawtooth", f: 207, f2: 158, d: 0.4, peak: 0.07 }); },
  cash: () => { tone({ f: 1760, d: 0.08, peak: 0.07 }); tone({ f: 2349, d: 0.16, peak: 0.07, t: 0.07 }); },
  fact: () => { noise({ d: 0.05, peak: 0.07, f: 3000, q: 2 }); tone({ type: "sine", f: 880, f2: 1320, d: 0.16, peak: 0.08, t: 0.02 }); },
  send: () => noise({ d: 0.14, peak: 0.08, f: 600, f2: 3000, q: 1 }),
  whoosh: () => noise({ d: 0.9, peak: 0.12, type: "bandpass", f: 300, f2: 2400, q: 0.6 }),
  stamp: () => {
    tone({ f: 120, f2: 38, d: 0.32, peak: 0.6 });
    noise({ d: 0.12, peak: 0.34, type: "lowpass", f: 900, q: 0.5 });
    noise({ d: 0.05, peak: 0.16, f: 2600, q: 1, t: 0.005 });
  },
  canon: () => {
    SFX.stamp();
    [55, 82.5, 110.3, 164.2, 221].forEach((f, i) => tone({ f, d: 3.2, a: 0.02, peak: 0.13 / (1 + i * 0.4), t: 0.05, out: sfxBus }));
    noise({ d: 2.4, peak: 0.07, type: "bandpass", f: 200, f2: 5000, q: 0.5, t: 0.1 });
    [1318, 1568, 1976].forEach((f, i) => tone({ f, d: 1.6, peak: 0.03, t: 0.5 + i * 0.22 }));
  },
  rift: () => { tone({ type: "sawtooth", f: 80, f2: 320, d: 0.9, peak: 0.07 }); noise({ d: 0.9, peak: 0.07, f: 5000, f2: 300, q: 2 }); },
  page: () => noise({ d: 0.2, peak: 0.1, f: 2200, f2: 700, q: 0.8 }),
  level: () => [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone({ type: "triangle", f, d: 0.4, peak: 0.09, t: i * 0.06 })),
};
let lastSfx = {};
export function sfx(name) {
  if (!ctx || ctx.state !== "running" || st.sfx <= 0) return;
  const t = performance.now();
  if (t - (lastSfx[name] || 0) < 28) return;
  lastSfx[name] = t;
  try {
    SFX[name]?.();
  } catch { /* 무시 */ }
}

// ── 배경 음악: 느린 패드 + 드문 피아노 음 ──
const MOODS = {
  title: { tempo: 7.5, chords: [[50, 57, 65, 69, 72], [46, 53, 62, 65, 69], [43, 55, 62, 65, 70], [45, 52, 61, 64, 67]], scale: [62, 65, 67, 69, 72, 74, 77], pluck: 0.5, cutoff: 900 },
  game: { tempo: 9, chords: [[38, 57, 60, 64, 69], [41, 57, 60, 65, 67], [36, 55, 60, 64, 67], [43, 55, 59, 62, 69]], scale: [60, 62, 64, 67, 69, 72, 74, 76], pluck: 0.36, cutoff: 720 },
  tense: { tempo: 10, chords: [[38, 50, 57, 60, 63], [37, 49, 56, 60, 64], [38, 53, 56, 62, 65], [36, 48, 54, 60, 63]], scale: [62, 63, 65, 68, 69, 72, 74], pluck: 0.26, cutoff: 520 },
  quiet: { tempo: 11, chords: [[45, 57, 64, 67, 71], [41, 57, 60, 64, 69], [43, 55, 62, 66, 69], [38, 57, 62, 65, 69]], scale: [69, 71, 72, 76, 79, 81], pluck: 0.3, cutoff: 640 },
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function pad(notes, t, dur, cutoff) {
  const flt = ctx.createBiquadFilter();
  flt.type = "lowpass";
  flt.frequency.setValueAtTime(cutoff * 0.6, t);
  flt.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
  flt.frequency.linearRampToValueAtTime(cutoff * 0.55, t + dur + 3);
  flt.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.11, t + dur * 0.4);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 3.5);
  flt.connect(g);
  g.connect(musicBus);
  g.connect(reverb);
  const oscs = [];
  notes.forEach((n, i) => {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sine" : "sawtooth";
      o.frequency.value = mtof(n);
      o.detune.value = det + (Math.random() - 0.5) * 4;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.9 : 0.16;
      o.connect(og).connect(flt);
      o.start(t);
      o.stop(t + dur + 4);
      oscs.push(o);
    }
  });
  padNodes.push({ g, oscs, end: t + dur + 4 });
  padNodes = padNodes.filter((p) => p.end > ctx.currentTime);
}
function pluck(note, t, vel) {
  const f = mtof(note);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  for (const [type, mul, lvl] of [["sine", 1, 1], ["triangle", 2, 0.22], ["sine", 3.01, 0.07]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mul;
    const og = ctx.createGain();
    og.gain.value = lvl;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 2.8);
  }
  g.connect(musicBus);
  g.connect(delay);
}
function schedule() {
  if (!ctx || mood === "off") return;
  const m = MOODS[mood];
  while (nextTime < ctx.currentTime + 2.5) {
    const chord = m.chords[step % m.chords.length];
    pad(chord, nextTime, m.tempo, m.cutoff);
    // 마디 안에 드문드문 피아노 음
    let t = nextTime + 0.8 + Math.random() * 1.5;
    while (t < nextTime + m.tempo - 0.5) {
      if (Math.random() < m.pluck) {
        const n = m.scale[Math.floor(Math.random() * m.scale.length)] + (Math.random() < 0.25 ? 12 : 0);
        pluck(n, t, 0.05 + Math.random() * 0.06);
        if (Math.random() < 0.3) pluck(m.scale[Math.floor(Math.random() * m.scale.length)], t + 0.32, 0.04);
      }
      t += 0.9 + Math.random() * 2.2;
    }
    nextTime += m.tempo;
    step++;
  }
}
function startMusic(m) {
  mood = m;
  if (!ctx) return;
  nextTime = Math.max(nextTime, ctx.currentTime + 0.3);
  clearInterval(musicTimer);
  musicTimer = setInterval(schedule, 600);
  schedule();
}
export function music(m) {
  wantMood = m;
  if (m === mood) return;
  if (ctx) {
    // 이전 패드를 부드럽게 정리
    for (const p of padNodes) {
      try {
        p.g.gain.cancelScheduledValues(ctx.currentTime);
        p.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.8);
      } catch { /* 무시 */ }
    }
    nextTime = ctx.currentTime + 1.2;
  }
  if (m === "off") {
    mood = "off";
    clearInterval(musicTimer);
    return;
  }
  startMusic(m);
}
