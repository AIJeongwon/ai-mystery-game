// 종이의 소리 — 수첩을 넘기고, 연필로 긋고, 압정을 꽂고, 지우개로 지운다.
// 소리 파일 없이 만들어 낸다. 브라우저가 소리를 허락한 뒤(첫 입력 뒤)에만 난다.
let ctx = null, out = null, noiseBuf = null, muted = false;

function ac() {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = 0.9;
      out.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
// 걸러 낸 잡음 한 토막. shape(gain, t0)이 세기의 흐름을 그린다.
function hiss(type, freq, q, dur, shape, sweepTo) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  g.gain.setValueAtTime(0, t);
  shape(g.gain, t);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}
function tone(type, f0, f1, dur, peak, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  // 수첩 한 장을 넘긴다
  page() {
    hiss("bandpass", 700, 0.7, 0.26, (g, t) => {
      g.linearRampToValueAtTime(0.2, t + 0.05);
      g.linearRampToValueAtTime(0.06, t + 0.16);
      g.linearRampToValueAtTime(0, t + 0.26);
    }, 2800);
  },
  // 색연필로 긋는다: 종이의 결에 걸려 세기가 떨린다
  pencil(dur = 0.42) {
    hiss("bandpass", 2600 + Math.random() * 600, 1.1, dur, (g, t) => {
      for (let x = 0; x < dur; x += 0.028) g.linearRampToValueAtTime(0.035 + Math.random() * 0.06, t + x + 0.014);
      g.linearRampToValueAtTime(0, t + dur);
    });
  },
  // 압정을 꽂는다
  pin() {
    tone("sine", 190, 80, 0.07, 0.22);
    hiss("highpass", 3200, 0.5, 0.03, (g, t) => {
      g.linearRampToValueAtTime(0.1, t + 0.004);
      g.linearRampToValueAtTime(0, t + 0.03);
    });
  },
  // 종이를 내려놓는다
  paper() {
    hiss("lowpass", 1400, 0.5, 0.14, (g, t) => {
      g.linearRampToValueAtTime(0.1, t + 0.02);
      g.linearRampToValueAtTime(0, t + 0.14);
    });
  },
  // 지우개로 두 번 민다
  wrong() {
    for (const d of [0, 0.13]) {
      hiss("bandpass", 820, 0.6, 0.11 + d, (g, t) => {
        g.setValueAtTime(0, t + d);
        g.linearRampToValueAtTime(0.11, t + d + 0.03);
        g.linearRampToValueAtTime(0, t + d + 0.11);
      });
    }
  },
  // 이어졌다: 낮고 짧은 종 두 번
  right() {
    tone("triangle", 660, 660, 0.5, 0.07);
    tone("triangle", 990, 990, 0.7, 0.06, 0.11);
  },
  // 활자 하나가 찍힌다
  type() {
    tone("sine", 130, 70, 0.04, 0.16);
    hiss("bandpass", 1900, 2.2, 0.03, (g, t) => {
      g.linearRampToValueAtTime(0.14, t + 0.004);
      g.linearRampToValueAtTime(0, t + 0.03);
    });
  },
  // 사진기 셔터 (증거를 찍는다)
  shutter() {
    hiss("highpass", 2400, 0.6, 0.05, (g, t) => {
      g.linearRampToValueAtTime(0.09, t + 0.005);
      g.linearRampToValueAtTime(0, t + 0.05);
    });
    tone("square", 90, 60, 0.03, 0.05, 0.05);
  },
  setMuted(v) {
    muted = Boolean(v);
  },
};
