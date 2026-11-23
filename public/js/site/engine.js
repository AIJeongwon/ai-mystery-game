// 현장 엔진 — 손으로 만든 3D 공간(glb)을 1인칭으로 돌아다니며 조사한다.
// 공간의 자리는 glb 안의 이름에서 읽고(spot_*, spawn_*, npc_*, view_*, fx_*, col_*), 내용과 규칙은 사건 데이터에서 읽는다.
// 이 파일은 장의 내용을 모른다.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { newSiteState, loadSite, saveSite, clearSite, saveKeyOf, lockOpen, spotStatus, useSpot, apply, nodeVisible, currentQuestion, questionProgress, runDeadlines, fmtClock, hourOf, daylight, travelTo } from "./state.js";
import { makeNav, step, findPath, setBoxEnabled } from "./nav.js";
import { makeMarker } from "./markers.js";
import { el, makeHud, choose } from "./hud.js";
import { openInspect } from "./inspect.js";
import { buildProp } from "./props.js";
import { loadNpc } from "./npc.js";
import { openTalk } from "./talk.js";
import { startAmbience } from "./ambience.js";
import { openNotebook } from "./notebook.js";
import { openBoard } from "./board.js";
import { primeBook, bookUnseen, boardUnseen } from "./reason.js";
import { probeOf, probeStatus, probeOpen } from "./records.js";
import { openWeb } from "./probe-web.js";
import { openLedger } from "./probe-ledger.js";
import { openFlow } from "./probe-flow.js";
import { openAnswers } from "./probe-answers.js";
import { openTravel } from "./travel.js";
import { loadPhotos, savePhotos, clearPhotos, shrink } from "./photos.js";
import { sfx } from "./sfx.js";

const EYE = 1.6, WALK = 2.1, RUN = 3.4, REACH = 1.6, PITCH_MAX = 1.48;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const PROBES = { web: openWeb, ledger: openLedger, flow: openFlow, answers: openAnswers };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadModel(loader, def, opts) {
  const tries = (opts.blockout ? [def.blockout] : [def.model, def.blockout]).filter(Boolean); // 사실화 전의 장소는 model이 비어 있다
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
  const saved = !opts.fresh && loadSite(def);
  const st = saved || newSiteState(def);
  // 기자가 찍은 사진 (증거판의 카드에 붙는다). 처음부터 다시 하면 사진도 지운다.
  const saveKey = saveKeyOf(def);
  const photos = saved ? loadPhotos(saveKey) : {};
  if (!saved) clearPhotos(saveKey);
  // 여러 장소를 오가는 사건: 지금 어디에 있고, 이곳이 처음인지, 방금 어디서 왔는지
  st.at = def.id;
  st.visits ||= {};
  const firstVisit = !st.visits[def.id] && !(saved && !def.save && Object.keys(st.seen).length); // 예전 저장에는 visits가 없다: 살펴본 것이 있으면 와 본 곳이다
  st.visits[def.id] = (st.visits[def.id] || 0) + 1;
  const arrived = st.arrived || null;
  delete st.arrived;
  const spawnName = (saved && def.arrive) || def.start.spawn;
  const canvas = document.createElement("canvas");
  canvas.className = "s-canvas";
  root.append(canvas);
  const hud = makeHud(root);
  hud.setPlace(def.place);

  // ── 그리기 ──
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true }); // 증거를 얻는 순간의 화면을 사진으로 남긴다
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
      o.castShadow = !/^(glass|window|lamp|trace|hole|tile|sky|decal|plenum)|glass/.test(o.name) && !o.material?.transparent;
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
    const gain = ["lamp", "sky", "sun"].map((k) => Math.PI * LM.maps[k].range * (LM.maps[k].gain ?? 1)); // 구운 값(반사 밝기)을 받는 빛으로 되돌린다
    const U = { lmSky: { value: tex[1] }, lmSun: { value: tex[2] }, lmMix: { value: new THREE.Vector3(gain[0], gain[1], gain[2]) } };
    const chunk = THREE.ShaderChunk.lights_fragment_maps.replace(
      "vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;",
      "vec3 lightMapIrradiance = lightMapTexel.rgb * lmMix.x + texture2D( lmSky, vLightMapUv ).rgb * lmMix.y + texture2D( lmSun, vLightMapUv ).rgb * lmMix.z;");
    const lit = new Set();
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
    // 가구와 인물이 받을 빛을 찍는 자리. 안과 밖이 함께 있는 장소는 구역마다 하나씩 둔다:
    // 첫째가 기본(상자 없음)이고, 나머지는 바닥면의 상자 [minX, minZ, maxX, maxZ] 안에 든 것을 맡는다.
    const probes = (LM.probes?.length ? LM.probes : [{ at: [center.x, 1.4, center.z] }]).map((q) => ({ at: new THREE.Vector3(...q.at), box: q.box || null, mats: new Set(), clones: new Map(), rt: null }));
    const zoneOf = (v) => probes.find((q) => q.box && v.x >= q.box[0] && v.x <= q.box[2] && v.z >= q.box[1] && v.z <= q.box[3]) || probes[0];
    const owner = new Map();
    const tmpBox = new THREE.Box3(), tmpAt = new THREE.Vector3();
    const claim = (o, at, dark) => {
      const zone = zoneOf(at);
      const next = [].concat(o.material).map((m) => {
        if (lit.has(m) || !m.isMeshStandardMaterial) return m;
        let use = m;
        if (owner.has(m) && owner.get(m) !== zone) {
          // 같은 재질을 쓰는 물건이 다른 구역에도 있다: 이 구역 몫을 따로 둔다
          use = zone.clones.get(m) || m.clone();
          zone.clones.set(m, use);
        }
        owner.set(use, zone);
        zone.mats.add(use);
        use.envMapIntensity = dark ? 0.22 : 1;
        return use;
      });
      o.material = Array.isArray(o.material) ? next : next[0];
    };
    level.traverse((o) => {
      if (!o.isMesh) return;
      const name = `${o.name} ${o.parent?.name || ""}`;
      if (/glass/.test(name)) return void (o.material = glass);
      claim(o, tmpBox.setFromObject(o).getCenter(tmpAt), dim.test(o.name) || dim.test(o.parent?.name || ""));
    });
    for (const npc of npcs) npc.root.traverse((o) => o.isMesh && claim(o, npc.root.position, false));
    scene.environment = null;
    hemi.intensity = 0;
    const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.1, 80, cubeRT);
    scene.add(cubeCam);
    const keep = new Set([...LM.meshes, "lamps", "sky_backdrop"].map((n) => nodes[n]).filter(Boolean));
    let skyMat = null;
    nodes.sky_backdrop?.traverse((o) => o.isMesh && (skyMat ||= [].concat(o.material)[0]));
    const skyBase = skyMat?.emissiveIntensity ?? 1;
    const DUSK_SKY = new THREE.Color(0x5a6fb5);
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
        for (const q of probes) {
          cubeCam.position.copy(q.at);
          cubeCam.update(renderer, scene);
          const next = pmrem.fromCubemap(cubeRT.texture);
          for (const m of q.mats) m.envMap = next.texture;
          q.rt?.dispose();
          q.rt = next;
        }
        for (const o of hidden) o.visible = true;
      },
      dispose() {
        for (const q of probes) q.rt?.dispose();
        cubeRT.dispose();
        for (const t of tex) t.dispose();
      },
    };
    if (LM.exposure) renderer.toneMappingExposure = LM.exposure;
  }

  const nav = makeNav(boxes);
  primeBook(def, st); // 이어받은 것은 수첩에 이미 적혀 있다

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
  for (const npc of npcs) spots.push({ id: `talk_${npc.def.id}`, kind: "npc", npc, showIf: npc.def.when || null, label: npc.def.name, verb: "말을 건다", minutes: 0, pos: npc.headPos().clone().setY(npc.def.height * 0.86), radius: 3.2, reach: 2.0 });
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
    const sp = wpos(spawnName) || center;
    P.x = sp.x;
    P.z = sp.z;
    if (nodes[spawnName]) {
      const f = new THREE.Vector3(1, 0, 0).applyQuaternion(nodes[spawnName].getWorldQuaternion(new THREE.Quaternion()));
      P.yaw = Math.atan2(-f.x, -f.z);
    }
  }
  let mode = "walk"; // walk | ladder | focus | cine | inspect | talk | book | board
  let overlay = null; // 펼쳐 둔 수첩이나 증거판의 손잡이
  let busy = false;
  let tool = null;
  let tween = null;
  let walk = null; // { path, i, resolve }
  let focused = null;
  let scan = 0;
  let pointerLocked = false;
  let wantLock = false; // 플레이어가 마우스로 둘러보던 중인가 (손이 필요한 화면에서 돌아오면 다시 잡는다)
  let selfExit = false; // 방금 마우스를 놓은 것이 엔진인가
  let handsFree = 0; // 걷는 화면 위에 뜬 선택지처럼, 모드는 그대로인데 손끝이 필요한 때
  let hoverPick = false;
  let lockTipShown = false;
  const keys = new Set();
  const mouse = { x: 0, y: 0, inside: false };
  const ladderEye = () => wpos("view_ladder_top");

  // ── 시선 ──
  // 화면을 한 번 누르면 마우스가 화면에 잡히고, 그 뒤로는 마우스를 움직이는 대로 시선이 돈다.
  // 수첩이나 대화처럼 손끝이 필요한 화면에서는 마우스를 놓아 주고, 걷는 화면으로 돌아오면 다시 잡는다.
  const LOOK = new Set(["walk", "ladder"]);
  const HANDS = new Set(["inspect", "talk", "book", "board", "probe", "travel"]);
  const LOOK_SENS = 0.0021, LOOK_JUMP = 160;
  // 브라우저가 마우스를 잡게 해 주지 않는 곳(앱에 끼워 넣은 창 따위)에서는 잡지 않은 채로 따라간다:
  // 마우스를 움직이는 만큼 돌고, 화면 가장자리에 대고 있으면 계속 돈다.
  let follow = false, lockDeniedOnce = false;
  const looking = () => pointerLocked || follow;
  function markLook() {
    hud.layer.classList.toggle("locked", looking());
    canvas.style.cursor = follow ? "none" : "";
    if (looking() && !lockTipShown) {
      lockTipShown = true;
      hud.layer.classList.add("lock-tip");
      setTimeout(() => hud.layer.classList.remove("lock-tip"), 3600);
    }
  }
  function lockDenied() {
    lockDeniedOnce = true;
    if (wantLock && !pointerLocked) follow = true;
    markLook();
  }
  function grabLook() {
    wantLock = true;
    if (pointerLocked) return;
    if (lockDeniedOnce || !canvas.requestPointerLock) return lockDenied();
    try {
      canvas.requestPointerLock()?.catch?.(lockDenied);
    } catch {
      lockDenied();
    }
  }
  function releaseLook(keep = false) {
    wantLock = keep;
    if (!keep) follow = false;
    if (pointerLocked) {
      selfExit = true;
      document.exitPointerLock?.();
    }
    markLook();
  }
  function syncLock() {
    if (HANDS.has(mode) || handsFree) {
      if (pointerLocked) releaseLook(true);
    } else if (LOOK.has(mode) && wantLock && !pointerLocked) grabLook();
  }
  const setMode = (m) => {
    mode = m;
    hud.setMode(m);
    syncLock();
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
    // 인물의 하루: 올 시각이 아니면 그 자리에 없다
    for (const npc of npcs) {
      if (!npc.def.when) continue;
      const on = lockOpen(npc.def.when, st);
      npc.root.visible = on;
      setBoxEnabled(nav, `npc_${npc.def.id}`, on);
    }
    for (const d of runDeadlines(def, st)) if (d.note) hud.toast(d.note, "warn", 6000);
    const q = currentQuestion(def, st);
    hud.setQuestion(q, questionProgress(q, st));
    hud.setClock(fmtClock(st.minute), spent);
    const items = st.items.map((id) => def.items[id]).filter((it) => it?.tool);
    hud.setBelt(items, tool, st.holding ? "사다리" : null, { book: bookUnseen(def, st).total, board: boardUnseen(st), nudge: Boolean(q?.board) });
    saveSite(st);
  }
  // 지금 화면을 사진으로 남긴다. 말(진술)과 추론은 찍을 것이 없다.
  function snap(id, zoom = 1.3, shot = null) {
    const ev = def.evidence[id];
    if (!ev || photos[id] || ev.noPhoto || ev.kind === "진술" || ev.kind === "추론") return false;
    const url = shot || shrink(canvas, zoom);
    if (!url) return false;
    photos[id] = url;
    savePhotos(saveKey, photos);
    return true;
  }
  const announce = (fresh, zoom, taken) => {
    let shot = false;
    for (const id of fresh.evidence) {
      shot = snap(id, zoom, taken) || shot;
      hud.evidence(id, def.evidence[id] || { title: id, kind: "" }, photos[id]);
    }
    if (shot) {
      sfx.shutter();
      hud.flash();
    }
  };
  function bark(key) {
    if (!key) return;
    for (const npc of npcs) {
      const line = npc.root.visible && npc.def.barks?.[key];
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
      if (follow && mouse.inside) {
        // 가장자리 한 뼘 안에 마우스를 대고 있으면 그쪽으로 계속 돈다
        const nx = mouse.x / (canvas.clientWidth || 1), edge = 0.12;
        const push = nx < edge ? (edge - nx) / edge : nx > 1 - edge ? -(nx - (1 - edge)) / edge : 0;
        if (push) P.yaw += clamp(push, -1, 1) * 1.7 * dt;
      }
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
        P.yaw += angDiff(Math.atan2(-dx, -dz), P.yaw) * Math.min(1, dt * 4);
        P.pitch += (0 - P.pitch) * Math.min(1, dt * 2);
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
    const then = await interactNow(spot, how);
    if (typeof then === "function") await then(); // 살펴본 것이 다른 화면을 연다 (노트북, 벽의 판, 지도)
  }
  async function interactNow(spot, how) {
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
      const zoom = spot.kind === "scan" ? 2.4 : spot.far ? 2.2 : 1.3;
      if (spot.card) snap(spot.card, zoom); // 수첩의 관찰을 나중에 판으로 꺼낼 때 쓸 사진
      if (spot.lift) {
        await animate(0.9, (t) => tileState(spot.lift, true, t));
      }
      if (spot.text) await hud.caption(spot.text);
      announce(fresh, zoom);
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
      if (spot.gives?.until != null && st.minute - before >= 30) {
        // 오래 기다렸다: 화면이 어두워졌다 밝아지는 사이에 빛이 바뀐다
        await hud.fade(true, 500);
        refresh(st.minute - before);
        await sleep(350);
        await hud.fade(false, 900);
      } else refresh(st.minute - before);
      await runTriggers();
      if (spot.probe) return () => openProbe(spot.probe);
      if (spot.open) return () => openOverlay(spot.open);
      if (spot.travel) return () => openMap();
      if (spot.goto) return () => depart(spot.goto.site, spot.goto);
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
      snapAt: (fx, fy) => shrink(canvas, 2.6, fx, fy),
      onGain: (effect, shot) => {
        const fresh = apply(st, effect);
        announce(fresh, 1.3, shot);
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

  // ── 수첩과 증거판 ──
  // 펼친 동안은 걷지 못하고, 시계는 멈춘다(추리를 틀리거나 곰곰이 따져 볼 때만 흐른다).
  const mapData = () => ({
    bounds: { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z },
    boxes: boxes.filter((b) => !b.name.startsWith("npc_") && !nav.off.has(b.name)),
    labels: def.map?.labels || [],
    spots: spots.filter((sp) => sp.kind !== "npc" && !sp.instant).map((sp) => ({ id: sp.id, label: sp.label, x: sp.pos.x, y: sp.pos.y, z: sp.pos.z, status: spotStatus(sp, st) })).filter((sp) => sp.status === "open" || sp.status === "done"),
    me: { x: P.x, z: P.z, yaw: P.yaw, note: mode === "ladder" || st.flags.on_ladder ? "사다리 위" : "" },
    npcs: npcs.map((n) => ({ name: n.def.name, x: n.root.position.x, z: n.root.position.z })),
  });
  async function openOverlay(kind, tab) {
    if (busy || !(mode === "walk" || mode === "ladder")) return;
    busy = true;
    const back = mode, before = st.minute;
    walk?.resolve(false);
    walk = null;
    keys.clear();
    hud.setPrompt("", null);
    setMode(kind);
    let next = null;
    try {
      const view = kind === "book"
        ? openNotebook({ root, def, st, tab, map: mapData, photos, save: () => saveSite(st), onChange: () => refresh() })
        : openBoard({ root, def, st, photos, save: () => saveSite(st) });
      overlay = view.api;
      next = await view;
    } finally {
      overlay = null;
      setMode(back);
      busy = false;
    }
    refresh(st.minute - before);
    if (next === "board") return openOverlay("board");
    // 판에서 이은 것이 방 안의 일을 일으킨다 (가루와 사다리를 잇자 눈길이 위로 간다)
    busy = true;
    try {
      await runTriggers();
    } finally {
      busy = false;
    }
  }
  hud.onBelt = (k) => openOverlay(k);

  // ── 기록을 읽는 화면 (노트북) ──
  async function openProbe(id) {
    const probe = probeOf(def, id);
    if (busy || mode !== "walk" || !probe || probeStatus(def, st, probe) === "hidden") return;
    const before = st.minute, res = probeOpen(def, st, id);
    if (!res.ok) return;
    busy = true;
    walk?.resolve(false);
    walk = null;
    keys.clear();
    hud.setPrompt("", null);
    setMode("probe");
    let next = null;
    try {
      const view = PROBES[probe.kind]({ root, def, st, id: probe.ref, save: () => saveSite(st), spent: res.minutes });
      overlay = view.api;
      next = await view;
    } finally {
      overlay = null;
      setMode("walk");
      busy = false;
    }
    refresh(st.minute - before);
    if (next === "book" || next === "board") return openOverlay(next);
    busy = true;
    try {
      await runTriggers();
    } finally {
      busy = false;
    }
  }

  // ── 장소를 옮긴다 ──
  // 문을 나서면 손으로 그린 약도가 펼쳐진다. 고르면 시간이 가고, 그 장소의 현장을 새로 연다.
  async function openMap() {
    if (busy || mode !== "walk" || !def.places) return;
    busy = true;
    walk?.resolve(false);
    walk = null;
    keys.clear();
    hud.setPrompt("", null);
    setMode("travel");
    let pick = null;
    try {
      const view = openTravel({ root, def, st });
      overlay = view.api;
      pick = await view;
    } finally {
      overlay = null;
      setMode("walk");
      busy = false;
    }
    if (pick) await depart(null, { place: pick });
  }
  async function depart(site, how = {}) {
    busy = true;
    setMode("cine");
    if (how.place) site = travelTo(def, st, how.place)?.site;
    if (!site) {
      setMode("walk");
      busy = false;
      return;
    }
    saveSite(st);
    sfx.page();
    await hud.fade(true, 600);
    if (how.card) {
      const card = el("div.s-titlecard", how.card.map((l, i) => el(i ? "h1" : "p", l)));
      root.append(card);
      await sleep(3200);
    }
    const q = new URLSearchParams(location.search);
    q.set("site", site);
    q.delete("fresh");
    q.delete("case");
    if (how.carry) q.set("carry", saveKey);
    else q.delete("carry");
    location.href = `${location.pathname}?${q}`;
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
      if (mouse.inside && !looking()) {
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
    hoverPick = !!best && bestScore < 0;
    hud.layer.classList.toggle("free", active && !looking());
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
    if (mode === "inspect" || mode === "talk" || mode === "book" || mode === "board" || mode === "probe" || mode === "travel") return;
    keys.add(e.code);
    if (e.repeat) return;
    if (["KeyE", "Enter", "Space"].includes(e.code)) {
      e.preventDefault();
      if (!hud.advance() && focused) interact(focused);
    } else if (e.code === "Escape") {
      if (follow && !busy && LOOK.has(mode)) releaseLook(); // 잡힌 마우스는 브라우저가 Esc로 놓아 준다. 따라가는 중이면 여기서 놓는다
      else if (mode === "ladder" && !busy) interact(spots.find((s) => s.descend));
      else if (tool) setTool(tool);
    } else if (busy) return;
    else if (e.code === "KeyF" && st.items.includes("phone")) setTool("phone");
    else if (e.code === "KeyG" && st.items.includes("pen")) setTool("pen");
    else if (e.code === "KeyI") openInventory();
    else if (e.code === "Tab") openOverlay("book");
    else if (e.code === "KeyB") openOverlay("board");
    else if (e.code === "KeyH") openOverlay("book", "keys");
    else if (e.code === "KeyL") looking() ? releaseLook() : grabLook();
  };
  async function openInventory() {
    const list = st.items.map((id) => def.items[id]).filter((it) => it?.inspect);
    if (!list.length || busy) return;
    busy = true;
    handsFree++;
    syncLock();
    try {
      const pick = await choose(root, { prompt: "무엇을 꺼내 볼까", options: [...list.map((it) => ({ id: it.inspect, label: it.title, sub: it.hint || "" })), { id: null, label: "그만둔다", sub: "" }] });
      if (pick.id) {
        await inspect(pick.id, true);
        await runTriggers(); // 꺼내 본 것이 일을 일으킨다 (펜을 안경 너머로 본 뒤)
      }
    } finally {
      busy = false;
      handsFree--;
      syncLock();
    }
  }
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (hud.advance()) return; // 자막을 넘긴다
    if (busy || !LOOK.has(mode)) return;
    // 마우스를 잡고 있을 때는 눈길이 닿은 것을, 놓고 있을 때는 손끝으로 짚은 것만 살펴본다
    if (focused && (looking() || hoverPick)) return void interact(focused);
    if (!looking()) grabLook();
  };
  const onPointerMove = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.inside = true;
    if (!looking() || busy || !LOOK.has(mode)) return;
    // 잠근 직후나 창을 오갈 때 브라우저가 한 번씩 큰 값을 던진다. 그런 튐은 버린다.
    const mx = clamp(e.movementX, -LOOK_JUMP, LOOK_JUMP), my = clamp(e.movementY, -LOOK_JUMP, LOOK_JUMP);
    P.yaw -= mx * LOOK_SENS;
    P.pitch = clamp(P.pitch - my * LOOK_SENS, -PITCH_MAX, PITCH_MAX);
  };
  const onLock = () => {
    pointerLocked = document.pointerLockElement === canvas;
    if (!pointerLocked && !selfExit) wantLock = false; // 플레이어가 Esc로 마우스를 놓았다
    selfExit = false;
    if (pointerLocked) follow = false;
    markLook();
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", () => (mouse.inside = false));
  document.addEventListener("pointerlockchange", onLock);
  document.addEventListener("pointerlockerror", lockDenied);
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
    if (L.sunFrom != null && h < L.sunFrom) want.sun = 0; // 해가 이 시각부터 든다 (서쪽 창의 교실에는 아침 해가 들지 않는다)
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
    if (mode !== "inspect" && mode !== "board") { // 증거판은 화면을 다 덮는다
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

  // ── 사진관 ──
  // 이어받은 물건과 이 방의 인물을 한 번씩 찍어 둔다. 증거판의 카드와 수첩의 인물 쪽에 붙는다.
  // 그림 파일을 따로 두지 않고 3D 모델을 그대로 찍는다(모델을 고치면 사진도 따라 바뀐다).
  async function studioShots() {
    let taken = false;
    const shoot = (sc, cam, key, zoom = 1) => {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, canvas.clientWidth, canvas.clientHeight);
      cam.aspect = canvas.clientWidth / canvas.clientHeight;
      cam.updateProjectionMatrix();
      renderer.render(sc, cam);
      const url = shrink(canvas, zoom);
      if (url) {
        photos[key] = url;
        taken = true;
      }
    };
    const todo = Object.values(def.items).filter((it) => it.evidence && it.inspect && it.evidence in st.evidence && !photos[it.evidence]);
    if (todo.length) {
      const desk = new THREE.Scene();
      desk.background = new THREE.Color(0x2b2622);
      const gen = new THREE.PMREMGenerator(renderer);
      const envRT = gen.fromScene(new RoomEnvironment(), 0.04);
      desk.environment = envRT.texture;
      desk.environmentIntensity = 0.7;
      const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
      key.position.set(1.2, 2.4, 1.8);
      desk.add(key);
      const exposure = renderer.toneMappingExposure;
      renderer.toneMappingExposure = 1;
      for (const it of todo) {
        const idef = def.inspects[it.inspect];
        let prop = null;
        try {
          prop = (await loader.loadAsync(idef.model)).scene;
        } catch {
          prop = buildProp(idef.build);
        }
        desk.add(prop);
        prop.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(prop), mid = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2 || 0.1;
        const cam = new THREE.PerspectiveCamera(26, 1, r * 0.05, r * 40);
        const yaw = (idef.view?.yaw ?? 0.3) + 0.35, pitch = (idef.view?.pitch ?? 0.2) + 0.3, dist = (r / Math.sin((13 * Math.PI) / 180)) * 1.02;
        cam.position.set(mid.x + Math.sin(yaw) * Math.cos(pitch) * dist, mid.y + Math.sin(pitch) * dist, mid.z + Math.cos(yaw) * Math.cos(pitch) * dist);
        cam.lookAt(mid);
        shoot(desk, cam, it.evidence);
        desk.remove(prop);
      }
      renderer.toneMappingExposure = exposure;
      envRT.dispose();
      gen.dispose();
    }
    // 인물: 얼굴 높이에서, 그 사람이 서 있는 자리의 빛으로
    for (const npc of npcs) {
      const key = `who:${npc.def.id}`;
      if (photos[key]) continue;
      updateLight(0);
      const yaw = npc.root.rotation.y;
      npc.update(1 / 30, { x: npc.root.position.x + Math.sin(yaw) * 9, z: npc.root.position.z + Math.cos(yaw) * 9 }, 50); // 서 있는 자세를 잡는다
      scene.updateMatrixWorld(true);
      const head = npc.headPos();
      const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 40);
      cam.position.set(head.x + Math.sin(yaw + 0.22) * 1.25, head.y + 0.06, head.z + Math.cos(yaw + 0.22) * 1.25);
      cam.lookAt(head.x, head.y + 0.03, head.z);
      for (const m of markerAt.values()) m.sprite.visible = false;
      shoot(scene, cam, key, 1.7);
      for (const m of markerAt.values()) m.sprite.visible = true;
    }
    if (taken) savePhotos(saveKey, photos);
  }

  // ── 시작 ──
  if (st.flags.tile_open) tileState("tile24", true, 1);
  if (st.flags.on_ladder) setMode("ladder");
  else setMode("walk");
  if (st.flags.on_ladder) Object.assign(P, lookAngles(ladderEye(), wpos("spot_tile24")));
  syncView();
  refresh();
  try {
    await studioShots();
  } catch (e) {
    console.warn("[site] 사진을 찍지 못했다:", e?.message || e); // 사진이 없으면 카드에는 종류만 적힌다
  }
  const ambience = startAmbience(canvas);
  frame();
  // 처음 들어선 곳에서는 현장 스케치가, 옮겨 온 곳에서는 도착한 시각이 흐른다
  const hello = [...(arrived ? [`${def.title} · ${fmtClock(st.minute)}`] : []), ...(firstVisit && def.sketch ? def.sketch : [])];
  if (hello.length) hud.sketch(hello);
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
    // 수첩과 증거판 (검증용): book("facts"), board(), 펼친 것의 손잡이는 overlay()
    book: (tab) => openOverlay("book", tab),
    board: () => openOverlay("board"),
    probe: openProbe, travel: openMap, go: (place) => depart(null, { place }),
    npcs: () => npcs.map((n) => ({ id: n.def.id, here: n.root.visible })),
    overlay: () => overlay,
    photos, map: mapData,
    info: () => ({ tris: renderer.info.render.triangles, calls: renderer.info.render.calls, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, model: modelUrl, baked, light: { ...lightNow } }),
    reset: () => {
      clearSite(def);
      clearPhotos(saveKey);
      if (def.save) location.href = `${location.pathname}?case=${def.save}&fresh${opts.blockout ? "&blockout" : ""}`; // 사건은 첫 장소에서 다시 시작한다
      else location.reload();
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
      document.removeEventListener("pointerlockerror", lockDenied);
      renderer.dispose();
      hud.dispose();
      canvas.remove();
    },
  };
  return api;
}
