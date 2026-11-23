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

// ── 프롤로그의 소품 ──
const paperMat = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...o });
const flat = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2); // 위를 보고 누운 종이. 그림의 위쪽이 -Z.

// 택배 상자: 날개를 젖힌 골판지 상자. 구겨 넣은 종이 위에 도장, 인주통, 쪽지.
function parcel() {
  const g = new THREE.Group();
  const card = mat(0xb08a5a, { roughness: 0.9 }), cardIn = mat(0x9a774b, { roughness: 0.95 });
  const W = 0.3, D = 0.22, Hh = 0.11, T = 0.005;
  g.add(mesh(new THREE.BoxGeometry(W, T, D), card, [0, T / 2, 0]));
  for (const s of [1, -1]) {
    g.add(mesh(new THREE.BoxGeometry(W, Hh, T), card, [0, Hh / 2, (s * D) / 2]));
    g.add(mesh(new THREE.BoxGeometry(T, Hh, D), card, [(s * W) / 2, Hh / 2, 0]));
    // 젖혀진 날개
    g.add(mesh(new THREE.BoxGeometry(W, T, D * 0.48), cardIn, [0, Hh + 0.028, s * (D / 2 + D * 0.2)], [s * -0.62, 0, 0]));
    g.add(mesh(new THREE.BoxGeometry(W * 0.3, T, D), cardIn, [s * (W / 2 + W * 0.12), Hh + 0.022, 0], [0, 0, s * 0.6]));
  }
  // 테이프 자국과 운송장 (보낸 사람 칸은 비어 있다)
  g.add(mesh(new THREE.BoxGeometry(W * 0.3, 0.001, 0.05), mat(0xc9b78f, { roughness: 0.35 }), [W / 2 + W * 0.12, Hh + 0.046, 0], [0, 0, 0.6]));
  const bill = labelTexture((c, w, h) => {
    c.fillStyle = "#f3f0e8";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#5b5b5b";
    c.lineWidth = 2;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.beginPath();
    c.moveTo(6, h / 2);
    c.lineTo(w - 6, h / 2);
    c.stroke();
    c.fillStyle = "#333";
    c.font = "bold 15px sans-serif";
    c.fillText("보내는 분", 14, 28);
    c.fillText("받는 분", 14, h / 2 + 22);
    c.font = "17px sans-serif";
    c.fillText("서울 마포구 망원동  옥탑", 92, h / 2 + 24);
    c.fillStyle = "#222";
    for (let i = 0; i < 26; i++) c.fillRect(100 + i * 5.2, h - 30, i % 3 ? 2 : 3.4, 18);
  });
  g.add(mesh(new THREE.PlaneGeometry(0.11, 0.055), paperMat(bill), [-0.05, Hh * 0.52, D / 2 + T / 2 + 0.0006]));
  // 구겨 넣은 누런 종이
  const stuff = mat(0xd8cfb8, { roughness: 1, flatShading: true });
  const rr = (i) => Math.sin(i * 12.9898) * 43758.5453 % 1;
  for (let i = 0; i < 14; i++) {
    const m = mesh(new THREE.IcosahedronGeometry(0.03 + Math.abs(rr(i)) * 0.018, 0), stuff, [-0.11 + (i % 5) * 0.055 + rr(i + 3) * 0.012, 0.035 + Math.abs(rr(i + 7)) * 0.012, -0.07 + Math.floor(i / 5) * 0.07 + rr(i + 9) * 0.012], [rr(i) * 3, rr(i + 1) * 3, 0]);
    m.scale.y = 0.6;
    g.add(m);
  }
  const top = 0.062;
  // 도장: 닳은 나무 손잡이, 새긴 면은 붉게 말라 있다
  const wood = mat(0x7a5232, { roughness: 0.55 });
  const stampG = new THREE.Group();
  stampG.add(mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.05, 20), wood, [0, 0, 0]));
  stampG.add(mesh(new THREE.SphereGeometry(0.0165, 20, 14), wood, [0, 0.03, 0]));
  stampG.add(mesh(new THREE.CylinderGeometry(0.0152, 0.0152, 0.004, 20), mat(0x8e2a1e, { roughness: 0.8 }), [0, -0.027, 0]));
  stampG.position.set(-0.06, top + 0.016, 0.01);
  stampG.rotation.set(0.2, 0.3, Math.PI / 2 - 0.12);
  g.add(stampG);
  // 인주통: 놋쇠
  const brass = mat(0xb08d3c, { metalness: 0.85, roughness: 0.32 });
  g.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, 28), brass, [0.045, top + 0.007, -0.03]));
  g.add(mesh(new THREE.CylinderGeometry(0.0225, 0.0225, 0.002, 28), mat(0xa3271b, { roughness: 0.7 }), [0.045, top + 0.0148, -0.03]));
  g.add(mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.006, 28), brass, [0.094, top + 0.004, -0.004], [0.5, 0, 0.25])); // 뚜껑은 옆에 기대어 있다
  // 쪽지
  const memo = labelTexture((c, w, h) => {
    c.fillStyle = "#f4efe1";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#25324d";
    c.font = "30px 'Nanum Pen Script', 'Noto Serif KR', serif";
    c.fillText("찍기 전에는", 22, 50);
    c.fillText("세 번 읽어라", 22, 92);
  });
  g.add(mesh(flat(0.09, 0.045), paperMat(memo), [0.03, top + 0.004, 0.055], [0, 0.22, 0.04]));
  detail(g, "detail_stamp", [-0.06, top + 0.02, 0.01]);
  detail(g, "detail_ink", [0.045, top + 0.018, -0.03]);
  detail(g, "detail_memo", [0.03, top + 0.008, 0.055]);
  g.userData.view = { yaw: 0.35, pitch: 0.78 };
  return g;
}

// 필통: 지퍼를 끝까지 열어 젖힌 천 필통. 수험표, 뿔테 안경(접혀 있다), 사인펜.
function pencilcase() {
  const g = new THREE.Group();
  const cloth = mat(0x24364f, { roughness: 0.95 }), lining = mat(0x9aa7b8, { roughness: 0.9 }), zip = mat(0xb9bcc2, { metalness: 0.8, roughness: 0.35 });
  const W = 0.23, D = 0.105, Hh = 0.03;
  g.add(mesh(new THREE.BoxGeometry(W, 0.006, D), cloth, [0, 0.003, 0]));
  g.add(mesh(new THREE.BoxGeometry(W - 0.008, 0.002, D - 0.008), lining, [0, 0.007, 0]));
  for (const s of [1, -1]) {
    g.add(mesh(new THREE.BoxGeometry(W, Hh, 0.005), cloth, [0, Hh / 2, (s * D) / 2]));
    g.add(mesh(new THREE.BoxGeometry(0.005, Hh, D), cloth, [(s * W) / 2, Hh / 2, 0]));
    g.add(mesh(new THREE.BoxGeometry(W, 0.0022, 0.004), zip, [0, Hh + 0.001, (s * D) / 2]));
  }
  // 젖혀진 뚜껑과 지퍼 손잡이
  g.add(mesh(new THREE.BoxGeometry(W, 0.005, D), cloth, [0, Hh + 0.03, -D / 2 - D * 0.42], [0.62, 0, 0]));
  g.add(mesh(new THREE.BoxGeometry(W - 0.01, 0.0012, D - 0.01), lining, [0, Hh + 0.033, -D / 2 - D * 0.418], [0.62, 0, 0]));
  g.add(mesh(new THREE.BoxGeometry(0.016, 0.002, 0.006), zip, [W / 2 + 0.004, Hh - 0.004, D / 2 - 0.004], [0, 0.5, -0.5]));
  // 가격표를 뗀 자국
  g.add(mesh(new THREE.PlaneGeometry(0.026, 0.014), mat(0x3a4d68, { roughness: 0.5 }), [0.07, Hh / 2, D / 2 + 0.0028]));
  const y0 = 0.0085;
  // 수험표: 바닥에 깔려 있다
  const ticket = labelTexture((c, w, h) => {
    c.fillStyle = "#f6f3ea";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#2b3a67";
    c.fillRect(0, 0, w, 34);
    c.fillStyle = "#fff";
    c.font = "bold 19px sans-serif";
    c.fillText("대학수학능력시험 수험표", 12, 24);
    c.fillStyle = "#c9c4b6";
    c.fillRect(14, 48, 62, 76);
    c.fillStyle = "#222";
    c.font = "bold 20px sans-serif";
    c.fillText("한 도 현", 92, 68);
    c.font = "15px sans-serif";
    c.fillText("시험장  목원고", 92, 94);
    c.fillText("12시험실  24번", 92, 116);
    c.strokeStyle = "#b0392d";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(w - 34, 96, 20, 0, Math.PI * 2);
    c.stroke();
  }, 256, 140);
  g.add(mesh(flat(0.118, 0.064), paperMat(ticket), [-0.045, y0 + 0.0006, 0.012], [0, 0.07, 0]));
  // 뿔테 안경: 다리를 접었다. 왼쪽 알(착용자 기준)에만 무지갯빛이 돈다.
  const gl = new THREE.Group();
  const frame = mat(0x17171a, { roughness: 0.75 });
  for (const s of [1, -1]) {
    gl.add(mesh(new THREE.TorusGeometry(0.024, 0.0042, 10, 4, Math.PI * 2).rotateZ(Math.PI / 4).scale(1.12, 0.92, 1), frame, [s * 0.033, 0, 0]));
    gl.add(mesh(new THREE.BoxGeometry(0.047, 0.038, 0.0016), new THREE.MeshPhysicalMaterial({ color: s > 0 ? 0xb9c4e0 : 0xdfe8ee, roughness: 0.04, transmission: 0.85, transparent: true, opacity: s > 0 ? 0.55 : 0.3, iridescence: s > 0 ? 1 : 0, iridescenceIOR: 1.7, clearcoat: 1 }), [s * 0.033, 0, 0]));
    gl.add(mesh(new THREE.BoxGeometry(0.125, 0.008, 0.006), frame, [s * 0.002, 0.006, -0.008 - (s > 0 ? 0 : 0.007)]));
  }
  gl.add(mesh(new THREE.BoxGeometry(0.014, 0.005, 0.005), frame, [0, 0.008, 0]));
  gl.position.set(0.045, y0 + 0.012, -0.012);
  gl.rotation.set(-Math.PI / 2 + 0.12, 0, 0.1);
  g.add(gl);
  // 사인펜
  const p = pen();
  p.position.set(-0.02, y0 + 0.0058, 0.038);
  p.rotation.y = 0.05;
  p.traverse((o) => {
    if (/^detail_/.test(o.name)) o.name = `pen_${o.name}`; // 펜의 자리 이름은 필통의 것과 섞이지 않게 한다
  });
  g.add(p);
  detail(g, "detail_ticket", [-0.07, y0 + 0.004, 0.0]);
  detail(g, "detail_glasses", [0.05, y0 + 0.024, -0.012]);
  detail(g, "detail_pen", [-0.086, y0 + 0.012, 0.041]);
  g.userData.view = { yaw: 0.18, pitch: 0.95 };
  return g;
}

// 수학 연습지: 문제는 인쇄되어 있고 풀이는 없다. 문제의 줄마다 무언가로 누르고 지나간 광택이 남아 있다.
// 광택은 색이 아니라 거칠기다(roughnessMap). 고른 빛 아래서는 보이지 않고, 어둠 속에서 빛이 비스듬히 되비칠 때만 떠오른다.
function practice() {
  const g = new THREE.Group();
  const W = 0.21, D = 0.297, PX = 724 / D; // 종이 1m가 몇 픽셀인가
  const lines = []; // 문제의 줄 (픽셀): { x, y, w }
  const sheet = labelTexture((c, w, h) => {
    c.fillStyle = "#f1eee4";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#1e1e1e";
    c.font = "bold 22px serif";
    c.fillText("수학 영역 · 고난도 문항 연습", 34, 46);
    c.fillRect(34, 58, w - 68, 2);
    let y = 96;
    const seed = (i) => Math.abs(Math.sin(i * 78.233) * 43758.5453) % 1;
    for (let q = 0; q < 5; q++) {
      c.fillStyle = "#1e1e1e";
      c.font = "bold 19px serif";
      c.fillText(`${[21, 22, 28, 29, 30][q]}.`, 34, y + 6);
      const n = 3 + (q % 2);
      for (let i = 0; i < n; i++) {
        const lw = i === n - 1 ? 150 + seed(q * 7 + i) * 110 : 300 + seed(q * 5 + i) * 34;
        // 글자처럼 보이는 잘게 끊긴 줄 (실제 문제를 싣지 않는다)
        let x = 72;
        while (x < 72 + lw) {
          const seg = 5 + seed(x + q * 31 + i * 17) * 13;
          c.fillStyle = `rgba(30,30,30,${0.55 + seed(x * 3 + i) * 0.3})`;
          c.fillRect(x, y - 3 + i * 22, seg, 7);
          x += seg + 3 + seed(x + 5) * 3;
        }
        lines.push({ x: 72, y: y + i * 22, w: lw });
      }
      // 답만 적혀 있다 (파란 볼펜)
      c.fillStyle = "#24408e";
      c.font = "30px 'Nanum Pen Script', serif";
      c.fillText(["12", "③", "64", "①", "208"][q], w - 96, y + n * 11 + 6);
      y += n * 22 + 46;
    }
  }, 512, 724);
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.02, 0.46), mat(0x3a2c22, { roughness: 0.8 }), [0, -0.0105, 0])); // 책상
  // 광택 줄: 펜 뒤 끝이 눌러 지나간 자리만 종이가 매끈해졌다
  const rc = document.createElement("canvas");
  rc.width = 512;
  rc.height = 724;
  const rx = rc.getContext("2d");
  rx.fillStyle = "#fff";
  rx.fillRect(0, 0, 512, 724);
  rx.filter = "blur(1.6px)";
  rx.fillStyle = "#4a4a4a";
  rx.lineCap = "round";
  for (const l of lines) {
    rx.beginPath();
    rx.roundRect(l.x - 6, l.y - 6.5, l.w + 14, 14, 7);
    rx.fill();
  }
  const rough = new THREE.CanvasTexture(rc);
  g.add(mesh(flat(W, D), new THREE.MeshStandardMaterial({ map: sheet, roughness: 0.96, roughnessMap: rough, metalness: 0 }), [0, 0.0004, 0]));
  const first = lines[3], mid = lines[9];
  detail(g, "detail_gloss", [(mid.x + mid.w * 0.4) / PX - W / 2, 0.002, mid.y / PX - D / 2]);
  detail(g, "detail_margin", [W / 2 - 0.03, 0.002, first.y / PX - D / 2 + 0.012]);
  const c = new THREE.Object3D();
  c.name = "view_center";
  c.position.set(0, 0, 0);
  g.add(c);
  g.userData.view = { yaw: 0, pitch: 1.05, radius: 0.36, near: 0.8, torch: 9, torchAt: [0.2, 1.4, 0.9] };
  return g;
}

export function buildProp(kind) {
  if (kind === "pen") return pen();
  if (kind === "parcel") return parcel();
  if (kind === "pencilcase") return pencilcase();
  if (kind === "practice") return practice();
  if (kind === "glasses") return glasses();
  if (kind === "plenum") return plenum(false);
  if (kind === "plenum_empty") return plenum(true);
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat(0x888888)));
  return g;
}
