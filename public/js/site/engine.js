// 현장 엔진 — 손으로 만든 3D 공간(glb)을 1인칭으로 돌아다니며 조사한다.
// 공간의 자리는 glb 안의 이름에서 읽고(spot_*, spawn_*, npc_*, view_*, fx_*, col_*), 내용과 규칙은 사건 데이터에서 읽는다.
// 이 파일은 장의 내용을 모른다.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { newSiteState, loadSite, saveSite, clearSite, lockOpen, spotStatus, useSpot, apply, nodeVisible, currentQuestion, questionProgress, runDeadlines, nextDeadline, fmtClock, hourOf, daylight } from "./state.js";
import { makeNav, step, findPath, setBoxEnabled } from "./nav.js";
import { makeMarker } from "./markers.js";
import { makeHud, choose } from "./hud.js";
import { openInspect } from "./inspect.js";
import { loadNpc } from "./npc.js";
import { openTalk } from "./talk.js";
import { startAmbience } from "./ambience.js";

const EYE = 1.6, WALK = 2.1, RUN = 3.4, REACH = 1.6, PITCH_MAX = 1.48;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

async function loadModel(loader, def, opts) {
  const tries = opts.blockout ? [def.blockout] : [def.model, def.blockout];
  for (const url of tries) {
    try {
      return { gltf: await loader.loadAsync(url), url };
    } catch (e) {
      console.warn("[site] 모델을 불러오지 못했다:", url, e?.message || e);
    }
  }
  throw new Error("현장 모델이 없다. public/assets/3d/ 아래에 glb를 내보냈는지 확인한다.");
}

export async function createSite(root, def, opts = {}) {
  const st = (!opts.fresh && loadSite(def)) || newSiteState(def);
  const canvas = document.createElement("canvas");
  canvas.className = "s-canvas";
  root.append(canvas);
  const hud = makeHud(root);
  hud.setPlace(def.place);

  // ── 그리기 ──
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = def.light?.exposure ?? 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0e12);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
  camera.rotation.order = "YXZ";
  const phoneCam = new THREE.PerspectiveCamera(34, 1.5, 0.05, 80);
  phoneCam.rotation.order = "YXZ";
  phoneCam.layers.enable(1);

  const L = def.light || {};
  const hemi = new THREE.HemisphereLight(L.sky ?? 0xcfd9e6, L.ground ?? 0x6b6257, L.ambient ?? 0.6);
  const sun = new THREE.DirectionalLight(L.sun?.color ?? 0xffffff, L.sun?.intensity ?? 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(hemi, sun, sun.target);

  // ── 공간 ──
  const loader = new GLTFLoader();
  const draco = new DRACOLoader().setDecoderPath("/vendor/three/addons/libs/draco/gltf/");
  loader.setDRACOLoader(draco);
  const { gltf, url: modelUrl } = await loadModel(loader, def, opts);
  const baked = Boolean(def.lightmap && modelUrl === def.model); // 조명을 구워 둔 사실화 공간인가 (블록아웃은 실시간 조명만 쓴다)
  const level = gltf.scene;
  scene.add(level);
  level.updateMatrixWorld(true);
  const nodes = {};
  const boxes = [];
  const lamps = [];
  level.traverse((o) => {
    if (o.name && !(o.name in nodes)) nodes[o.name] = o;
    if (o.isMesh) {
      o.castShadow = !/^(glass|window|lamp|trace|hole|tile|sky|decal|plenum)/.test(o.name) && !o.material?.transparent;
      o.receiveShadow = true;
    }
  });
  for (const [name, o] of Object.entries(nodes)) {
    if (name.startsWith("col_")) {
      const b = new THREE.Box3().setFromObject(o);
      boxes.push({ name, minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z });
      o.visible = false;
    } else if (baked) {
      continue; // 구운 공간은 glb의 재질을 그대로 쓴다. 등과 유리는 아래 "구운 조명"에서 다룬다.
    } else if (name.startsWith("lamp") && o.isMesh) {
      o.material = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 1.6 });
      const p = new THREE.PointLight(L.lampColor ?? 0xfff1dc, 0, 9, 1.6);
      o.getWorldPosition(p.position);
      p.position.y -= 0.12;
      scene.add(p);
      lamps.push({ light: p, mesh: o });
    } else if (name.startsWith("hole") && o.isMesh) {
      o.material = new THREE.MeshBasicMaterial({ color: 0x020203 });
    } else if (/glass/.test(name) && o.isMesh) {
      o.material = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ea, roughness: 0.05, metalness: 0, transmission: 0.9, transparent: true, opacity: 0.35 });
    }
  }
  const wpos = (name) => (nodes[name] ? nodes[name].getWorldPosition(new THREE.Vector3()) : null);
  const bounds = new THREE.Box3().setFromObject((baked && nodes[def.lightmap.meshes[0]]) || level);
  const center = bounds.getCenter(new THREE.Vector3());
  {
    const d = new THREE.Vector3(...(L.sun?.dir ?? [0.3, 0.6, 0.5])).normalize();
    sun.position.copy(center).addScaledVector(d, 18);
    sun.target.position.copy(center);
    const s = bounds.getSize(new THREE.Vector3()).length() / 2 + 1;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 40 });
    sun.shadow.camera.updateProjectionMatrix();
  }

  // 눈에 보이지 않는 빛 (휴대폰 화면에서만 보인다: 레이어 1)
  let irSprite = null;
  if (nodes.fx_ir_point) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(200,130,255,0.9)");
    grad.addColorStop(1, "rgba(120,40,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    irSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthTest: false, toneMapped: false }));
    irSprite.position.copy(wpos("fx_ir_point"));
    irSprite.scale.setScalar(0.11);
    irSprite.layers.set(1);
    scene.add(irSprite);
  }
  const irOn = () => irSprite && !st.flags.device_gone && !st.flags.card_pulled;

  // ── 인물 ──
  const npcs = [];
  for (const nd of def.npcs || []) {
    const at = wpos(nd.node);
    if (!at) {
      console.warn("[site] 인물 자리가 없다:", nd.node);
      continue;
    }
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(nodes[nd.node].getWorldQuaternion(new THREE.Quaternion()));
    const npc = await loadNpc(loader, nd, at, Math.atan2(fwd.x, fwd.z));
    scene.add(npc.root);
    npcs.push(npc);
    boxes.push({ name: `npc_${nd.id}`, minX: at.x - 0.2, maxX: at.x + 0.2, minZ: at.z - 0.2, maxZ: at.z + 0.2 });
    st.npc[nd.id] ||= { trust: nd.trust ?? 50, said: [], turns: 0, log: [], chat: [] };
  }

  // ── 구운 조명 ──
  // 붙박이(벽·바닥·천장)는 조명 지도 세 장을 시각에 따라 섞어 쓴다: 등 + 하늘빛 x 낮 + 햇빛의 되비침 x 해.
  // 햇빛의 직접광과 그림자는 실시간이다. 가구와 인물은 방 한가운데에서 찍은 환경 프로브로 밝힌다.
  let bake = null;
  if (baked) {
    const LM = def.lightmap;
    const tl = new THREE.TextureLoader();
    const tex = await Promise.all(["lamp", "sky", "sun"].map(async (k) => {
      const t = await tl.loadAsync(LM.maps[k].url);
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.channel = 1;
      t.anisotropy = 4;
      return t;
    }));
    const gain = ["lamp", "sky", "sun"].map((k) => Math.PI * LM.maps[k].range); // 구운 값(반사 밝기)을 받는 빛으로 되돌린다
    const U = { lmSky: { value: tex[1] }, lmSun: { value: tex[2] }, lmMix: { value: new THREE.Vector3(gain[0], gain[1], gain[2]) } };
    const chunk = THREE.ShaderChunk.lights_fragment_maps.replace(
      "vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;",
      "vec3 lightMapIrradiance = lightMapTexel.rgb * lmMix.x + texture2D( lmSky, vLightMapUv ).rgb * lmMix.y + texture2D( lmSun, vLightMapUv ).rgb * lmMix.z;");
    const lit = new Set(), free = new Set();
    for (const name of LM.meshes) nodes[name]?.traverse((o) => o.isMesh && [].concat(o.material).forEach((m) => lit.add(m)));
    for (const m of lit) {
      m.lightMap = tex[0];
      m.shadowSide = THREE.DoubleSide;
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.fragmentShader = "uniform sampler2D lmSky;\nuniform sampler2D lmSun;\nuniform vec3 lmMix;\n" + sh.fragmentShader.replace("#include <lights_fragment_maps>", chunk);
      };
      m.customProgramCacheKey = () => "lm3";
      m.needsUpdate = true;
    }
    const glass = new THREE.MeshStandardMaterial({ color: 0xdfeef5, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false });
    const dim = /^(hole|plenum)/; // 천장 속은 어둡다
    level.traverse((o) => {
      if (!o.isMesh) return;
      const name = `${o.name} ${o.parent?.name || ""}`;
      if (/glass/.test(name)) o.material = glass;
      for (const m of [].concat(o.material)) {
        if (lit.has(m) || !m.isMeshStandardMaterial) continue;
        m.envMapIntensity = dim.test(o.name) || dim.test(o.parent?.name || "") ? 0.22 : 1;
        free.add(m);
      }
    });
    for (const npc of npcs) npc.root.traverse((o) => o.isMesh && [].concat(o.material).forEach((m) => m.isMeshStandardMaterial && free.add(m)));
    scene.environment = null;
    hemi.intensity = 0;
    const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.1, 40, cubeRT);
    cubeCam.position.set(center.x, 1.4, center.z);
    scene.add(cubeCam);
    const keep = new Set([...LM.meshes, "lamps", "sky_backdrop"].map((n) => nodes[n]).filter(Boolean));
    let skyMat = null;
    nodes.sky_backdrop?.traverse((o) => o.isMesh && (skyMat ||= [].concat(o.material)[0]));
    const skyBase = skyMat?.emissiveIntensity ?? 1;
    const DUSK_SKY = new THREE.Color(0x5a6fb5);
    let envRT = null;
    bake = {
      at: [-1, -1],
      set(sunF, skyF) {
        U.lmMix.value.set(gain[0], gain[1] * skyF, gain[2] * sunF);
        renderer.toneMappingExposure = (LM.exposure ?? 1) * (1 + (LM.nightGain ?? 0) * (1 - skyF)); // 어두워지면 눈이 익는다
        if (skyMat) {
          skyMat.emissiveIntensity = skyBase * Math.max(0.012, skyF ** 1.6);
          skyMat.emissive.setRGB(1, 1, 1).lerp(DUSK_SKY, 1 - skyF);
        }
        if (Math.abs(sunF - this.at[0]) + Math.abs(skyF - this.at[1]) > 0.04) this.capture(sunF, skyF);
      },
      // 방 한가운데에서 붙박이만 찍어, 가구와 인물이 받을 빛으로 쓴다
      capture(sunF, skyF) {
        this.at = [sunF, skyF];
        const hidden = [];
        for (const o of [...scene.children, ...level.children]) {
          if (o === level || o === cubeCam || keep.has(o) || !o.visible || o.isLight) continue;
          o.visible = false;
          hidden.push(o);
        }
        cubeCam.update(renderer, scene);
        for (const o of hidden) o.visible = true;
        const next = pmrem.fromCubemap(cubeRT.texture);
        for (const m of free) m.envMap = next.texture;
        envRT?.dispose();
        envRT = next;
      },
      dispose() {
        envRT?.dispose();
        cubeRT.dispose();
        for (const t of tex) t.dispose();
      },
    };
    if (LM.exposure) renderer.toneMappingExposure = LM.exposure;
  }

  const nav = makeNav(boxes);

  // ── 조사점 ──
  const spots = [];
  for (const s of def.spots) {
    const pos = wpos(s.node);
    if (!pos) {
      console.warn("[site] 조사점 자리가 없다:", s.id, s.node);
      continue;
    }
    spots.push({ ...s, pos });
  }
  for (const npc of npcs) spots.push({ id: `talk_${npc.def.id}`, kind: "npc", npc, label: npc.def.name, verb: "말을 건다", minutes: 0, pos: npc.headPos().clone().setY(npc.def.height * 0.86), radius: 3.2, reach: 2.0 });
  // 같은 자리에 겹친 조사점은 표시를 하나만 쓴다
  const markerAt = new Map();
  for (const s of spots) {
    const key = s.node || s.id;
    if (!markerAt.has(key)) {
      const m = makeMarker();
      m.sprite.position.copy(s.pos);
      scene.add(m.sprite);
      markerAt.set(key, m);
    }
    s.marker = markerAt.get(key);
  }

  // ── 플레이어 ──
  const P = { x: 0, z: 0, yaw: 0, pitch: 0 }; // 서 있는 자리와 고개
  const V = { x: 0, y: EYE, z: 0, yaw: 0, pitch: 0 }; // 실제 카메라 (가까이 볼 때는 P에서 떨어진다)
  {
    const sp = wpos(def.start.spawn) || center;
    P.x = sp.x;
    P.z = sp.z;
    if (nodes[def.start.spawn]) {
      const f = new THREE.Vector3(1, 0, 0).applyQuaternion(nodes[def.start.spawn].getWorldQuaternion(new THREE.Quaternion()));
      P.yaw = Math.atan2(-f.x, -f.z);
    }
  }
  let mode = "walk"; // walk | ladder | focus | cine | inspect | talk
  let busy = false;
  let tool = null;
  let tween = null;
  let walk = null; // { path, i, resolve }
  let focused = null;
  let scan = 0;
  let pointerLocked = false;
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false, moved: 0, t: 0, inside: false };
  const ladderEye = () => wpos("view_ladder_top");

  const setMode = (m) => {
    mode = m;
    hud.setMode(m);
  };
  const syncView = () => {
    if (mode === "walk") Object.assign(V, { x: P.x, y: EYE, z: P.z, yaw: P.yaw, pitch: P.pitch });
    else if (mode === "ladder") {
      const e = ladderEye();
      Object.assign(V, { x: e.x, y: e.y, z: e.z, yaw: P.yaw, pitch: P.pitch });
    }
  };
  const tweenTo = (to, dur = 0.6) => new Promise((resolve) => {
    const from = { ...V };
    const dy = angDiff(to.yaw ?? from.yaw, from.yaw);
    tween = { t: 0, dur, from, to: { ...from, ...to }, dy, resolve };
  });
  const lookAngles = (from, target) => {
    const dx = target.x - from.x, dy = target.y - from.y, dz = target.z - from.z;
    return { yaw: Math.atan2(-dx, -dz), pitch: clamp(Math.atan2(dy, Math.hypot(dx, dz)), -PITCH_MAX, PITCH_MAX) };
  };
  const forward = () => new THREE.Vector3(-Math.sin(V.yaw) * Math.cos(V.pitch), Math.sin(V.pitch), -Math.cos(V.yaw) * Math.cos(V.pitch));
  const eyePos = () => new THREE.Vector3(V.x, V.y, V.z);

  // ── 상태가 바뀐 뒤 ──
  function applyNodes() {
    for (const name of new Set([...Object.keys(def.nodes || {}), ...Object.keys(st.nodes)])) {
      const vis = nodeVisible(def, st, name);
      if (name.startsWith("col_")) setBoxEnabled(nav, name, vis);
      else if (nodes[name]) nodes[name].visible = vis;
    }
  }
  function tileState(name, open, t = 1) {
    const o = nodes[name];
    if (!o) return;
    o.userData.home ||= o.position.clone();
    const k = open ? t : 0;
    o.position.copy(o.userData.home).add(new THREE.Vector3(0.62 * ease(clamp((k - 0.35) / 0.65, 0, 1)), 0.05 * ease(clamp(k / 0.35, 0, 1)), 0));
  }
  function refresh(spent = 0) {
    applyNodes();
    for (const d of runDeadlines(def, st)) if (d.note) hud.toast(d.note, "warn", 6000);
    const q = currentQuestion(def, st);
    hud.setQuestion(q, questionProgress(q, st));
    hud.setClock(fmtClock(st.minute), spent);
    const items = st.items.map((id) => def.items[id]).filter((it) => it?.tool);
    hud.setBelt(items, tool, st.holding ? "사다리" : null);
    saveSite(st);
  }
  const announce = (fresh) => {
    for (const id of fresh.evidence) hud.evidence(id, def.evidence[id] || { title: id, kind: "" });
  };
  function bark(key) {
    if (!key) return;
    for (const npc of npcs) {
      const line = npc.def.barks?.[key];
      if (line) {
        hud.bubble(npc.def.name, line);
        npc.nod();
      }
    }
  }

  // ── 걷기 ──
  function walkTo(x, z, stopAt = 0) {
    const path = findPath(nav, P.x, P.z, x, z);
    if (!path || path.length < 2) return Promise.resolve(false);
    if (stopAt) {
      // 목표에 닿기 전, 손이 닿는 거리에서 멈춘다
      while (path.length > 2 && Math.hypot(path[path.length - 2][0] - x, path[path.length - 2][1] - z) < stopAt) path.pop();
    }
    walk?.resolve(false);
    return new Promise((resolve) => (walk = { path, i: 1, resolve, stopAt, tx: x, tz: z }));
  }
  function updateWalk(dt) {
    let mx = 0, mz = 0;
    if (!busy && (mode === "walk")) {
      const f = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
      const s = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
      const turn = (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
      if (turn) P.yaw += turn * 1.9 * dt;
      if (f || s) {
        walk?.resolve(false);
        walk = null;
        const n = Math.hypot(f, s), sp = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? RUN : WALK) * dt;
        mx = ((-Math.sin(P.yaw) * f + Math.cos(P.yaw) * s) / n) * sp;
        mz = ((-Math.cos(P.yaw) * f - Math.sin(P.yaw) * s) / n) * sp;
      }
    }
    if (walk && mode === "walk") {
      const [tx, tz] = walk.path[walk.i];
      const dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz);
      const near = walk.stopAt && Math.hypot(walk.tx - P.x, walk.tz - P.z) < walk.stopAt;
      if (d < 0.08 || near) {
        walk.i++;
        if (walk.i >= walk.path.length || near) {
          walk.resolve(true);
          walk = null;
        }
      } else {
        const sp = Math.min(d, WALK * 1.15 * dt);
        mx = (dx / d) * sp;
        mz = (dz / d) * sp;
        if (!mouse.down) P.yaw += angDiff(Math.atan2(-dx, -dz), P.yaw) * Math.min(1, dt * 4);
        if (!mouse.down) P.pitch += (0 - P.pitch) * Math.min(1, dt * 2);
      }
    }
    if (mx || mz) {
      const [nx, nz] = step(nav, P.x, P.z, mx, mz);
      if (walk && nx === P.x && nz === P.z) {
        walk.stuck = (walk.stuck || 0) + dt;
        if (walk.stuck > 0.5) {
          walk.resolve(false);
          walk = null;
        }
      }
      P.x = nx;
      P.z = nz;
    }
  }

  // ── 살펴보기 ──
  function focusPose(spot) {
    const S = spot.pos, v = spot.view || {};
    if (v.stay || spot.far || mode === "ladder") return lookAngles(V, S);
    let dx = P.x - S.x, dz = P.z - S.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const dist = v.dist ?? (S.y < 0.3 ? 1.25 : 0.9);
    const y = v.crouch ?? clamp(S.y + (S.y < 0.3 ? 1.05 : 0.55), 0.45, 1.7);
    const from = { x: S.x + dx * dist, y, z: S.z + dz * dist };
    return { ...from, ...lookAngles(from, S) };
  }
  async function interact(spot, how = {}) {
    if (busy || !spot) return;
    const status = spotStatus(spot, st);
    if (status === "hidden") return;
    busy = true;
    walk?.resolve(false);
    walk = null;
    try {
      if (spot.kind === "npc") return await talk(spot.npc);
      if (status === "locked") return await hud.caption([spot.lockText]);
      if (spot.kind === "scan" && !how.scanned) return await hud.caption(spot.idle || ["맨눈으로는 아무것도 보이지 않는다."]);
      if (mode === "walk" && !spot.far && Math.hypot(spot.pos.x - P.x, spot.pos.z - P.z) > (spot.reach ?? REACH)) {
        const ok = await walkTo(spot.pos.x, spot.pos.z, (spot.reach ?? REACH) * 0.8);
        if (!ok && Math.hypot(spot.pos.x - P.x, spot.pos.z - P.z) > (spot.reach ?? REACH) + 0.6) return;
      }
      const back = mode;
      const before = st.minute;
      if (!spot.instant && !spot.inspect) {
        setMode("focus");
        await tweenTo(focusPose(spot), 0.55);
      }
      const fresh = useSpot(st, spot);
      if (spot.lift) {
        await animate(0.9, (t) => tileState(spot.lift, true, t));
      }
      if (spot.text) await hud.caption(spot.text);
      announce(fresh);
      bark(spot.bark);
      if (spot.inspect) await inspect(spot.inspect);
      if (spot.climb) {
        setMode("cine");
        await hud.fade(true, 260);
        const e = ladderEye(), t = wpos("spot_tile24") || spot.pos;
        Object.assign(P, lookAngles(e, t));
        setMode("ladder");
        syncView();
        await hud.fade(false, 320);
      } else if (spot.descend) {
        setMode("cine");
        await hud.fade(true, 220);
        P.pitch = 0;
        setMode("walk");
        syncView();
        await hud.fade(false, 300);
      } else if (!spot.instant && !spot.inspect) {
        setMode(back);
        const home = back === "ladder" ? { ...ladderEye(), yaw: P.yaw, pitch: P.pitch } : { x: P.x, y: EYE, z: P.z, yaw: P.yaw, pitch: P.pitch };
        setMode("focus");
        await tweenTo({ x: home.x, y: home.y, z: home.z, yaw: home.yaw, pitch: home.pitch }, 0.45);
        setMode(back);
      }
      refresh(st.minute - before);
      await runTriggers();
    } finally {
      busy = false;
    }
  }
  const animate = (dur, fn) => new Promise((resolve) => {
    let t = 0;
    anims.push((dt) => {
      t = Math.min(1, t + dt / dur);
      fn(t);
      if (t >= 1) resolve();
      return t < 1;
    });
  });
  const anims = [];

  async function runTriggers() {
    for (const tr of def.triggers || []) {
      if (st.flags[`trig_${tr.id}`] || !lockOpen(tr.when, st)) continue;
      st.flags[`trig_${tr.id}`] = true;
      const back = mode;
      setMode("cine");
      const target = wpos(tr.lookAt);
      if (target) {
        const a = lookAngles(V, target);
        await tweenTo(a, 1.5);
        P.yaw = a.yaw;
        P.pitch = a.pitch;
      }
      if (tr.caption) await hud.caption(tr.caption);
      apply(st, tr.effect);
      setMode(back);
      refresh();
    }
  }

  async function inspect(id, fromInventory = false) {
    const idef = def.inspects[id];
    if (!idef) return;
    const back = mode;
    setMode("inspect");
    const before = st.minute;
    await openInspect({
      id, root, renderer, loader, def, idef, st, hud,
      onGain: (effect) => {
        const fresh = apply(st, effect);
        announce(fresh);
        refresh();
        return fresh;
      },
      onBark: bark,
      choose: (c) => choose(root, c),
    });
    setMode(back);
    refresh(st.minute - before);
  }

  async function talk(npc) {
    const back = mode;
    if (Math.hypot(npc.root.position.x - P.x, npc.root.position.z - P.z) > 2.1) await walkTo(npc.root.position.x, npc.root.position.z, 1.5);
    setMode("talk");
    const head = npc.headPos();
    const a = lookAngles(V, new THREE.Vector3(head.x, head.y - 0.12, head.z));
    await tweenTo(a, 0.5);
    P.yaw = a.yaw;
    P.pitch = a.pitch;
    npc.setTalking(true);
    const before = st.minute;
    await openTalk({
      root, def, st, npc: npc.def, hud,
      onGain: (effect) => {
        const fresh = apply(st, effect);
        announce(fresh);
        refresh();
      },
      onSpeak: () => npc.speak(),
    });
    npc.setTalking(false);
    setMode(back);
    refresh(st.minute - before);
    await runTriggers();
  }

  // ── 도구 ──
  function setTool(name) {
    tool = tool === name ? null : name;
    scan = 0;
    hud.setTool(tool, tool === "pen" ? { digit: "E" } : {});
    refresh();
  }
  function updateTools(dt) {
    if (!tool) return;
    const fwd = forward(), eye = eyePos();
    let aimed = false;
    if (irOn()) {
      const dir = irSprite.position.clone().sub(eye);
      const dist = dir.length();
      aimed = dist < 6 && fwd.angleTo(dir.normalize()) < (tool === "phone" ? 0.085 : 0.16);
    }
    const target = spots.find((s) => s.kind === "scan" && (s.tool === tool || s.tools?.includes(tool)) && spotStatus(s, st) === "open");
    if (aimed && target && !busy) {
      scan += dt / 1.1;
      if (scan >= 1) {
        scan = 0;
        interact(target, { scanned: true });
      }
    } else scan = Math.max(0, scan - dt * 2);
    if (tool === "phone") hud.setTool("phone", { progress: scan, found: aimed });
    else if (tool === "pen") hud.setTool("pen", { digit: aimed ? "4" : "E" });
  }

  // ── 조사점 표시와 눈길 ──
  const tmp = new THREE.Vector3();
  function updateSpots(dt) {
    const eye = eyePos(), fwd = forward();
    const shown = new Map();
    let best = null, bestScore = Infinity;
    const active = !busy && (mode === "walk" || mode === "ladder");
    for (const s of spots) {
      const status = spotStatus(s, st);
      if (status === "hidden" || !active) continue;
      if (mode === "ladder" && !lockOpen({ flags: ["on_ladder"] }, st)) continue;
      const dist = eye.distanceTo(s.pos);
      if (dist > (s.radius ?? 2.6)) continue;
      if (mode === "ladder" && !s.far && s.kind !== "npc" && !(s.showIf?.flags || []).includes("on_ladder")) continue;
      const key = s.node || s.id;
      const cur = shown.get(key);
      if (!cur || (cur.status === "done" && status !== "done")) shown.set(key, { s, status, dist });
    }
    for (const { s, status, dist } of shown.values()) {
      const ang = fwd.angleTo(tmp.copy(s.pos).sub(eye).normalize());
      let score = ang;
      if (mouse.inside && !pointerLocked && !mouse.down) {
        tmp.copy(s.pos).project(camera);
        if (tmp.z < 1) {
          const px = (tmp.x * 0.5 + 0.5) * canvas.clientWidth, py = (-tmp.y * 0.5 + 0.5) * canvas.clientHeight;
          const dpx = Math.hypot(px - mouse.x, py - mouse.y);
          if (dpx < 52) score = -1 + dpx / 1000;
        }
      }
      if (score < 0.26 && score < bestScore) {
        best = s;
        bestScore = score;
      }
      s.marker.set(status === "done" ? "check" : "circle");
      s.marker.update(dt, dist, false);
      s.marker.live = true;
    }
    for (const m of markerAt.values()) {
      if (!m.live) m.set(null);
      m.live = false;
    }
    focused = best;
    if (focused) {
      focused.marker.update(0, eye.distanceTo(focused.pos), true);
      const first = !st.seen[focused.id];
      const scanHint = focused.kind === "scan" && !tool ? "F: 휴대폰 카메라" : null;
      hud.setPrompt(`${focused.id}:${first}:${tool}`, hud.promptParts("E", focused.verb || "살펴본다", focused.label, scanHint || (first && focused.minutes ? `${focused.minutes}분` : null)));
    } else if (mode === "ladder" && active) hud.setPrompt("ladder", hud.promptParts("Esc", "내려온다", "사다리"));
    else hud.setPrompt("", null);
    hud.setDot(focused ? "on" : mode === "walk" || mode === "ladder" ? "" : "off");
  }

  // ── 입력 ──
  const onKey = (e) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    if (e.type === "keyup") return void keys.delete(e.code);
    if (e.code === "Tab") e.preventDefault();
    if (mode === "inspect" || mode === "talk") return;
    keys.add(e.code);
    if (e.repeat) return;
    if (["KeyE", "Enter", "Space"].includes(e.code)) {
      e.preventDefault();
      if (!hud.advance() && focused) interact(focused);
    } else if (e.code === "Escape") {
      if (hud.notebookOpen()) hud.toggleNotebook(def, st, {});
      else if (mode === "ladder" && !busy) interact(spots.find((s) => s.descend));
      else if (tool) setTool(tool);
    } else if (busy) return;
    else if (e.code === "KeyF" && st.items.includes("phone")) setTool("phone");
    else if (e.code === "KeyG" && st.items.includes("pen")) setTool("pen");
    else if (e.code === "KeyI") openInventory();
    else if (e.code === "Tab") {
      const q = currentQuestion(def, st), d = nextDeadline(def, st);
      hud.toggleNotebook(def, st, { question: q, deadline: d?.warn });
    } else if (e.code === "KeyH") hud.help();
    else if (e.code === "KeyL") pointerLocked ? document.exitPointerLock() : canvas.requestPointerLock?.();
  };
  async function openInventory() {
    const list = st.items.map((id) => def.items[id]).filter((it) => it?.inspect);
    if (!list.length || busy) return;
    busy = true;
    try {
      const pick = await choose(root, { prompt: "무엇을 꺼내 볼까", options: [...list.map((it) => ({ id: it.inspect, label: it.title, sub: it.hint || "" })), { id: null, label: "그만둔다", sub: "" }] });
      if (pick.id) await inspect(pick.id, true);
    } finally {
      busy = false;
    }
  }
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    mouse.down = true;
    mouse.moved = 0;
    mouse.t = performance.now();
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.inside = true;
    const looking = pointerLocked || mouse.down;
    if (!looking || !(mode === "walk" || mode === "ladder") || busy) return;
    mouse.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    const k = pointerLocked ? 0.0022 : -0.0034; // 끌 때는 화면을 잡아끄는 방향
    P.yaw -= e.movementX * k;
    P.pitch = clamp(P.pitch - e.movementY * k, -PITCH_MAX, PITCH_MAX);
  };
  const onPointerUp = (e) => {
    if (e.button !== 0 || !mouse.down) return;
    mouse.down = false;
    if (mouse.moved > 6 || performance.now() - mouse.t > 450) return;
    if (hud.advance()) return;
    if (busy || !(mode === "walk" || mode === "ladder")) return;
    if (focused) return void interact(focused);
    if (mode !== "walk") return;
    // 바닥을 누르면 그 자리로 걸어간다
    const ray = new THREE.Raycaster();
    const ndc = pointerLocked ? new THREE.Vector2(0, 0) : new THREE.Vector2((mouse.x / canvas.clientWidth) * 2 - 1, -(mouse.y / canvas.clientHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(level, true).find((h) => h.object.visible && !h.object.name.startsWith("col_"));
    // 바닥이면 그 자리로, 가구면 그 곁으로. 벽 위쪽이나 천장을 누른 것은 걷지 않는다.
    if (hit && hit.point.y < 1.3) walkTo(hit.point.x, hit.point.z);
  };
  const onLock = () => {
    pointerLocked = document.pointerLockElement === canvas;
    hud.layer.classList.toggle("locked", pointerLocked);
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", () => (mouse.inside = false));
  document.addEventListener("pointerlockchange", onLock);
  window.addEventListener("blur", () => keys.clear());

  // ── 크기 ──
  function resize() {
    const w = root.clientWidth || 1, h = root.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();

  // ── 빛: 게임 속 시각을 따른다 ──
  // 시간을 쓰면(살펴보고, 묻고) 해가 기운다. 바뀐 빛은 몇 초에 걸쳐 스며든다.
  const NIGHT = new THREE.Color(0x070a10), DUSK = new THREE.Color(L.skyBg ?? 0xd9b48c);
  const lightNow = { sun: -1, sky: -1 };
  function updateLight(dt = 0) {
    const h = hourOf(st.minute) + (st.minute % 60) / 60;
    const want = daylight(h, L.sunrise, L.sunset);
    if (h < 12) want.sun = 0; // 창은 서쪽이다: 아침 해는 들지 않는다
    const k = lightNow.sun < 0 ? 1 : Math.min(1, dt * 0.45);
    lightNow.sun += (want.sun - lightNow.sun) * k;
    lightNow.sky += (want.sky - lightNow.sky) * k;
    sun.intensity = (L.sun?.intensity ?? 2) * lightNow.sun;
    scene.background.copy(NIGHT).lerp(DUSK, lightNow.sky);
    if (bake) return void bake.set(lightNow.sun, lightNow.sky);
    hemi.intensity = (L.ambient ?? 0.6) * (0.35 + 0.65 * lightNow.sky);
    for (const l of lamps) l.light.intensity = L.lamp ?? 2.2;
  }

  // ── 한 프레임 ──
  let raf = 0, statT = 0, frames = 0, lastT = performance.now();
  function frame(now = performance.now()) {
    raf = requestAnimationFrame(frame);
    const real = (now - lastT) / 1000;
    lastT = now;
    stepFrame(Math.min(0.05, real), real);
  }
  function stepFrame(dt, real = dt) {
    updateWalk(dt);
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      const k = ease(tween.t), a = tween.from, b = tween.to;
      V.x = a.x + (b.x - a.x) * k;
      V.y = a.y + (b.y - a.y) * k;
      V.z = a.z + (b.z - a.z) * k;
      V.yaw = a.yaw + tween.dy * k;
      V.pitch = a.pitch + (b.pitch - a.pitch) * k;
      if (tween.t >= 1) {
        const done = tween.resolve;
        tween = null;
        done();
      }
    } else syncView();
    for (let i = anims.length - 1; i >= 0; i--) if (!anims[i](dt)) anims.splice(i, 1);
    camera.position.set(V.x, V.y, V.z);
    camera.rotation.set(V.pitch, V.yaw, 0);
    camera.updateMatrixWorld();
    for (const npc of npcs) {
      npc.update(dt, eyePos(), st.npc[npc.def.id].trust);
      tmp.copy(npc.headPos()).setY(npc.headPos().y + 0.2).project(camera);
      // 화면 밖(등 뒤)에 있으면 말풍선을 화면 위쪽 가운데에 띄운다
      const on = tmp.z < 1 && Math.abs(tmp.x) < 1.2;
      hud.bubbleAt(on ? clamp((tmp.x * 0.5 + 0.5) * canvas.clientWidth, 170, canvas.clientWidth - 170) : canvas.clientWidth / 2, on ? clamp((-tmp.y * 0.5 + 0.5) * canvas.clientHeight, 150, canvas.clientHeight - 220) : 150, true);
    }
    updateSpots(dt);
    updateTools(dt);
    updateLight(dt);
    if (irSprite) {
      irSprite.visible = irOn();
      irSprite.material.opacity = 0.45 + 0.55 * Math.abs(Math.sin(performance.now() / 260));
    }
    if (mode !== "inspect") {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
      renderer.render(scene, camera);
      const rect = tool === "phone" ? hud.phoneRect() : null;
      if (rect && rect.width > 4) {
        const c = canvas.getBoundingClientRect();
        const x = rect.left - c.left, y = c.bottom - rect.bottom;
        phoneCam.position.copy(camera.position);
        phoneCam.rotation.copy(camera.rotation);
        phoneCam.aspect = rect.width / rect.height;
        phoneCam.updateProjectionMatrix();
        renderer.setScissorTest(true);
        renderer.setScissor(x, y, rect.width, rect.height);
        renderer.setViewport(x, y, rect.width, rect.height);
        for (const m of markerAt.values()) m.sprite.layers.set(2);
        renderer.render(scene, phoneCam);
        for (const m of markerAt.values()) m.sprite.layers.set(0);
        renderer.setScissorTest(false);
      }
    }
    if (opts.stats) {
      frames++;
      statT += real;
      if (statT > 0.5) {
        const mb = performance.getEntriesByType("resource").filter((r) => /\/assets\/3d\//.test(r.name)).reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) / 1048576;
        hud.setStats(`${Math.round(frames / statT)} fps · 삼각형 ${renderer.info.render.triangles.toLocaleString()} · 호출 ${renderer.info.render.calls} · 3D 내려받기 ${mb.toFixed(1)}MB · ${modelUrl.split("/").pop()}`);
        frames = 0;
        statT = 0;
      }
    }
  }

  // ── 시작 ──
  if (st.flags.tile_open) tileState("tile24", true, 1);
  if (st.flags.on_ladder) setMode("ladder");
  else setMode("walk");
  if (st.flags.on_ladder) Object.assign(P, lookAngles(ladderEye(), wpos("spot_tile24")));
  syncView();
  refresh();
  const ambience = startAmbience(canvas);
  frame();
  if (!Object.keys(st.seen).length && def.sketch) hud.sketch(def.sketch);
  runTriggers();

  const api = {
    def, st, hud, nodes, spots, nav, P, V, renderer, scene, camera,
    mode: () => mode,
    tp: (x, z, yaw = P.yaw, pitch = P.pitch) => Object.assign(P, { x, z, yaw, pitch }),
    // 시간을 손으로 돌린다 (숨겨진 탭에서는 화면 갱신이 느려지므로, 검증할 때 쓴다)
    tick: (sec = 0.5) => {
      for (let t = 0; t < sec; t += 1 / 30) stepFrame(1 / 30);
    },
    busy: () => busy,
    focused: () => focused?.id || null,
    look: (name) => Object.assign(P, lookAngles(eyePos(), wpos(name))),
    use: (id, how) => interact(spots.find((s) => s.id === id), how),
    tool: setTool,
    inspect,
    info: () => ({ tris: renderer.info.render.triangles, calls: renderer.info.render.calls, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, model: modelUrl, baked, light: { ...lightNow } }),
    reset: () => {
      clearSite(def);
      location.reload();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ambience?.stop();
      bake?.dispose();
      draco.dispose();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      document.removeEventListener("pointerlockchange", onLock);
      renderer.dispose();
      hud.dispose();
      canvas.remove();
    },
  };
  return api;
}
