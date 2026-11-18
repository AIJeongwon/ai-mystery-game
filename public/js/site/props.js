// 소품 대역 — 손으로 만든 glb가 아직 없을 때 쓰는 거친 모양.
// 정식 소품(public/assets/3d/props/*.glb)과 같은 이름의 detail_* 노드를 가진다. 게임은 이름만 읽는다.
import * as THREE from "three";

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
function mesh(geo, material, pos, rot) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  return m;
}
function detail(group, name, pos) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(...pos);
  group.add(o);
  return o;
}
function labelTexture(draw, w = 256, h = 128) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 컴퓨터용 사인펜: 길이 14cm. +X가 뚜껑 쪽, -X가 뒤 끝.
function pen() {
  const g = new THREE.Group();
  const R = 0.0055;
  const cyl = (r, len) => new THREE.CylinderGeometry(r, r, len, 24).rotateZ(Math.PI / 2);
  g.add(mesh(cyl(R, 0.095), mat(0xf2f0ea, { roughness: 0.35 }), [-0.012, 0, 0]));
  g.add(mesh(cyl(R * 1.12, 0.042), mat(0x15161a, { roughness: 0.3 }), [0.056, 0, 0]));
  g.add(mesh(cyl(R * 1.02, 0.008), mat(0x15161a, { roughness: 0.3 }), [-0.0635, 0, 0]));
  // 라벨: 가는 줄 몇 개와 검은 네모 하나. 네모는 인쇄처럼 보이는 화면이다.
  const tex = labelTexture((c, w, h) => {
    c.fillStyle = "#f2f0ea";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#1b1c20";
    c.fillRect(18, 44, 96, 7);
    c.fillRect(18, 58, 70, 5);
    c.fillRect(18, 70, 84, 5);
    c.fillRect(150, 40, 44, 44);
    c.fillStyle = "#c9372c";
    c.fillRect(206, 40, 8, 44);
  });
  const label = mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, 0.05, 24, 1, true, -0.9, 1.8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }), [-0.012, 0, 0]);
  label.rotation.x = Math.PI / 2;
  g.add(label);
  g.add(mesh(new THREE.CircleGeometry(0.0007, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }), [-0.0677, 0, 0], [0, -Math.PI / 2, 0]));
  g.add(mesh(new THREE.CircleGeometry(0.0022, 16), mat(0x0a0a12, { roughness: 0.05, metalness: 0.6 }), [0.0772, 0, 0], [0, Math.PI / 2, 0]));
  detail(g, "detail_cam", [-0.068, 0, 0]);
  detail(g, "detail_label", [-0.0035, 0, R]);
  detail(g, "detail_cap", [0.0775, 0, 0]);
  g.userData.view = { yaw: 0.25, pitch: 0.2 };
  return g;
}

// 뿔테 안경: 착용자 기준 왼쪽 알이 +X.
function glasses() {
  const g = new THREE.Group();
  const frame = mat(0x17171a, { roughness: 0.75 });
  const rim = (x) => mesh(new THREE.TorusGeometry(0.024, 0.0042, 10, 4, Math.PI * 2).rotateZ(Math.PI / 4).scale(1.12, 0.92, 1), frame, [x, 0, 0]);
  g.add(rim(0.033), rim(-0.033));
  g.add(mesh(new THREE.BoxGeometry(0.014, 0.005, 0.005), frame, [0, 0.008, 0]));
  for (const s of [1, -1]) {
    g.add(mesh(new THREE.BoxGeometry(0.006, 0.008, 0.135), frame, [s * 0.066, 0.006, -0.068]));
    g.add(mesh(new THREE.BoxGeometry(0.006, 0.02, 0.006), frame, [s * 0.066, -0.004, -0.136], [0.5, 0, 0]));
  }
  const lens = (x, film) => mesh(new THREE.BoxGeometry(0.047, 0.038, 0.0016), new THREE.MeshPhysicalMaterial({ color: film ? 0xb9c4e0 : 0xdfe8ee, roughness: 0.04, transmission: 0.85, transparent: true, opacity: film ? 0.55 : 0.3, iridescence: film ? 1 : 0, iridescenceIOR: 1.7, clearcoat: 1 }), [x, 0, 0]);
  g.add(lens(0.033, true), lens(-0.033, false));
  detail(g, "detail_temple", [0.066, 0.006, -0.07]);
  detail(g, "detail_left", [0.033, 0, 0.002]);
  detail(g, "detail_right", [-0.033, 0, 0.002]);
  g.userData.view = { yaw: -0.5, pitch: 0.25 };
  return g;
}

// 천장 속: 텍스를 밀고 올려다본 좁은 틈. 배관이 가로지르고, 그 위에 장치가 묶여 있다.
function plenum(empty) {
  const g = new THREE.Group();
  const steel = mat(0x8d9299, { metalness: 0.7, roughness: 0.45 });
  const pipeM = mat(0xb7332a, { roughness: 0.5, metalness: 0.2 });
  const yellow = mat(0xe8c21a, { roughness: 0.5 });
  // 경량 천장틀과 달대
  for (const z of [-0.3, 0.3]) g.add(mesh(new THREE.BoxGeometry(1.4, 0.03, 0.024), steel, [0, -0.16, z]));
  for (const x of [-0.6, 0, 0.6]) g.add(mesh(new THREE.BoxGeometry(0.024, 0.03, 0.62), steel, [x, -0.16, 0]));
  for (const x of [-0.45, 0.5]) g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 6), steel, [x, 0.14, -0.3]));
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.02, 0.9), mat(0x3b3a38, { roughness: 0.95 }), [0, 0.44, 0])); // 위층 슬래브
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.6, 0.02), mat(0x2c2b2a, { roughness: 0.95 }), [0, 0.14, -0.46]));
  // 화재감지기 배관
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.5, 16).rotateZ(Math.PI / 2), pipeM, [0, 0.02, -0.08]));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20), mat(0xe9e6df), [-0.52, -0.02, -0.08]));
  // 점검표 스티커
  const st = labelTexture((c, w, h) => {
    c.fillStyle = "#f4f1e6";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#2a2a2a";
    c.font = "bold 20px sans-serif";
    c.fillText("소방시설 점검표", 12, 26);
    c.font = "15px sans-serif";
    for (let i = 0; i < 3; i++) c.fillRect(12, 44 + i * 24, w - 24, 1);
    c.fillText("전날  21:40   오", 14, 88);
    if (empty) c.fillText("오늘  05:00   오", 14, 112);
  });
  g.add(mesh(new THREE.PlaneGeometry(0.11, 0.055), new THREE.MeshStandardMaterial({ map: st, roughness: 0.7 }), [-0.3, 0.02, -0.064]));
  detail(g, "detail_sticker", [-0.3, 0.02, -0.06]);
  if (empty) {
    // 잘린 케이블 타이 끝만 남았다
    for (const x of [0.12, 0.3]) {
      g.add(mesh(new THREE.TorusGeometry(0.016, 0.002, 6, 16, Math.PI * 1.3), yellow, [x, 0.02, -0.08], [0, Math.PI / 2, 0.4]));
      g.add(mesh(new THREE.BoxGeometry(0.003, 0.03, 0.004), yellow, [x, -0.01, -0.062], [0, 0, 0.3]));
    }
    detail(g, "detail_ties", [0.21, 0.02, -0.06]);
    g.userData.view = { yaw: 0, pitch: 0.12, fixed: true };
    return g;
  }
  // 장치: 기판 + 보조배터리 둘 + 아래로 내려 세운 빛 신호 장치
  const dev = new THREE.Group();
  dev.position.set(0.2, 0.05, -0.02);
  dev.add(mesh(new THREE.BoxGeometry(0.1, 0.012, 0.075), mat(0x1f6b3a, { roughness: 0.5 }), [0, 0, 0]));
  dev.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 20), mat(0x111214), [0.015, 0.012, 0]));
  dev.add(mesh(new THREE.BoxGeometry(0.03, 0.008, 0.02), mat(0x0c1a2a, { emissive: 0x3aa0ff, emissiveIntensity: 0.9 }), [-0.03, 0.01, 0.022]));
  dev.add(mesh(new THREE.BoxGeometry(0.014, 0.002, 0.011), mat(0x1b1b1f), [-0.056, 0.002, -0.012]));
  for (const z of [0.07, 0.11]) dev.add(mesh(new THREE.BoxGeometry(0.14, 0.022, 0.034), mat(0x2a2d33, { roughness: 0.4 }), [0, -0.004, z - 0.02]));
  dev.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 8), mat(0x1a1a1a), [0.09, -0.1, 0.0]));
  dev.add(mesh(new THREE.SphereGeometry(0.006, 10, 8), mat(0x24102e, { emissive: 0x7a2cff, emissiveIntensity: 0.5 }), [0.09, -0.2, 0]));
  g.add(dev);
  // 마이크: 가는 선이 칠판 쪽(-X)으로 뻗는다
  g.add(mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.5, 6).rotateZ(Math.PI / 2), mat(0x101010), [-0.1, 0.06, 0.05], [0, 0.12, 0.05]));
  g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.016, 10).rotateZ(Math.PI / 2), mat(0x3a3a3a, { metalness: 0.6 }), [-0.35, 0.047, 0.08]));
  for (const x of [0.13, 0.2, 0.27]) g.add(mesh(new THREE.TorusGeometry(0.03, 0.0022, 6, 20), yellow, [x, 0.035, -0.05], [0, Math.PI / 2, 0]));
  detail(g, "detail_device", [0.2, 0.065, -0.02]);
  detail(g, "detail_mic", [-0.35, 0.05, 0.08]);
  detail(g, "detail_ties", [0.13, 0.066, -0.05]);
  detail(g, "detail_power", [0.17, 0.062, 0.002]);
  detail(g, "detail_card", [0.142, 0.052, -0.032]);
  g.userData.view = { yaw: 0, pitch: 0.12, fixed: true };
  return g;
}

export function buildProp(kind) {
  if (kind === "pen") return pen();
  if (kind === "glasses") return glasses();
  if (kind === "plenum") return plenum(false);
  if (kind === "plenum_empty") return plenum(true);
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat(0x888888)));
  return g;
}
