// 현장의 소리 — 빈 교실의 낮은 웅웅거림(형광등, 환기). 파일 없이 만들어 낸다.
// 브라우저는 사용자가 한 번 누른 뒤에만 소리를 허락하므로, 첫 입력에 맞춰 켠다. M으로 끈다.

export function startAmbience(target) {
  let ctx = null, master = null, muted = false;
  function start() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
    // 방의 숨: 낮게 거른 잡음
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 420;
    const ng = ctx.createGain();
    ng.gain.value = 0.018;
    noise.connect(low).connect(ng).connect(master);
    noise.start();
    // 형광등 안정기: 120Hz와 그 배음
    for (const [f, g] of [[120, 0.006], [240, 0.0025], [360, 0.001]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.value = f;
      og.gain.value = g;
      o.connect(og).connect(master);
      o.start();
    }
  }
  const onFirst = () => start();
  const onKey = (e) => {
    if (e.code !== "KeyM" || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    start();
    muted = !muted;
    master?.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.1);
  };
  target.addEventListener("pointerdown", onFirst, { once: true });
  window.addEventListener("keydown", onKey);
  return {
    stop() {
      window.removeEventListener("keydown", onKey);
      ctx?.close();
      ctx = null;
    },
  };
}
