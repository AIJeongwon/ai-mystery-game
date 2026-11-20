// 조사점 표시 — 사실적인 화면 위에 기자가 붉은 색연필로 긋는 한 겹.
// 다가가면 동그라미가 한 획으로 그려지고, 살펴본 곳에는 체크가 남는다.
import * as THREE from "three";

const SIZE = 128;
const RED = "200, 50, 31";

// 손으로 그은 듯 조금 찌그러지고, 끝이 시작점을 살짝 지나치는 원
function strokeCircle(ctx, t, seed) {
  const cx = SIZE / 2, cy = SIZE / 2, R = SIZE * 0.36;
  const start = -2.2 + seed * 0.9, sweep = Math.PI * 2 * 1.07 * t;
  const n = Math.max(2, Math.floor(72 * t));
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = start + (sweep * i) / n;
      const wob = 1 + 0.045 * Math.sin(a * 3 + seed * 7) + 0.02 * Math.sin(a * 7 + seed * 3) - 0.035 * (i / Math.max(1, n)) * t;
      const x = cx + Math.cos(a) * R * wob * 1.04 + pass * 0.8, y = cy + Math.sin(a) * R * wob * 0.94 + pass * 0.6;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${RED}, ${pass ? 0.45 : 0.86})`;
    ctx.lineWidth = pass ? 2.2 : 4.2;
    ctx.stroke();
  }
}
function strokeCheck(ctx, t) {
  const pts = [[38, 66], [56, 86], [94, 40]];
  const a = Math.min(1, t * 2), b = Math.max(0, t * 2 - 1);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * a, pts[0][1] + (pts[1][1] - pts[0][1]) * a);
  if (b > 0) ctx.lineTo(pts[1][0] + (pts[2][0] - pts[1][0]) * b, pts[1][1] + (pts[2][1] - pts[1][1]) * b);
  ctx.strokeStyle = `rgba(${RED}, 0.8)`;
  ctx.lineWidth = 5;
  ctx.stroke();
}
// 색연필의 결: 획 위에 작은 구멍을 낸다
function grain(ctx, seed) {
  ctx.globalCompositeOperation = "destination-out";
  let s = Math.floor(seed * 9973) + 7;
  for (let i = 0; i < 420; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const x = s % SIZE;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const y = s % SIZE;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.globalCompositeOperation = "source-over";
}

export function makeMarker() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 20;
  sprite.visible = false;
  const m = { sprite, shape: null, t: 0, seed: Math.random(), focus: 0 };
  m.set = (shape) => {
    if (m.shape === shape) return;
    m.shape = shape;
    m.t = 0;
    sprite.visible = Boolean(shape);
  };
  m.update = (dt, dist, focused) => {
    if (!m.shape) return;
    if (m.t < 1) {
      m.t = Math.min(1, m.t + dt / (m.shape === "check" ? 0.28 : 0.38));
      ctx.clearRect(0, 0, SIZE, SIZE);
      if (m.shape === "check") strokeCheck(ctx, m.t);
      else strokeCircle(ctx, m.t, m.seed);
      grain(ctx, m.seed);
      tex.needsUpdate = true;
    }
    m.focus += ((focused ? 1 : 0) - m.focus) * Math.min(1, dt * 10);
    // 멀어도 너무 작아지지 않게: 거리에 따라 조금 키운다
    const base = (m.shape === "check" ? 0.16 : 0.26) * (0.6 + 0.22 * Math.min(6, dist));
    sprite.scale.setScalar(base * (1 + 0.14 * m.focus));
    mat.opacity = m.shape === "check" ? 0.55 + 0.3 * m.focus : 0.72 + 0.28 * m.focus;
  };
  m.dispose = () => {
    tex.dispose();
    mat.dispose();
  };
  return m;
}
