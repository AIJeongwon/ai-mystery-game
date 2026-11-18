// 열람 — 물건을 집어 들고 돌려 본다. 천장 속처럼 좁은 곳은 손전등으로 훑는다.
// 볼 곳(detail_*)은 소품 glb 안의 이름에서 읽는다. 어두운 곳에서는 빛이 닿아야 볼 곳이 드러난다.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { el } from "./hud.js";
import { buildProp } from "./props.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function openInspect({ id, root, renderer, loader, def, idef, st, hud, onGain, onBark, choose }) {
  const seenKey = (d) => `${id}.${d}`;
  const seen = (d) => Boolean(st.seen[seenKey(d)]);

  // ── 소품 ──
  let prop = null;
  if (idef.model) {
    try {
      prop = (await loader.loadAsync(idef.model)).scene;
    } catch {
      prop = null; // 정식 소품이 아직 없으면 대역을 쓴다
    }
  }
  const made = Boolean(prop); // 정식 소품(glb)인가
  prop ||= buildProp(idef.build);
  const view = (made && idef.view) || prop.userData.view || idef.view || {};
  // 안경알: 재질 이름으로 알아보고 유리로 바꾼다 (필름을 붙인 알만 반사가 무지갯빛으로 갈라진다)
  prop.traverse((o) => {
    if (!o.isMesh || !/lens/.test(o.material?.name || "")) return;
    const film = /lens_film/.test(o.material.name);
    o.material = new THREE.MeshPhysicalMaterial({ color: film ? 0xa9b0f2 : 0xdfe8ee, roughness: 0.04, metalness: 0, transparent: true, opacity: film ? 0.55 : 0.2, iridescence: film ? 1 : 0, iridescenceIOR: 1.9, iridescenceThicknessRange: [180, 620], clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(idef.dark ? 0x030405 : 0x14161a);
  const pivot = new THREE.Group();
  pivot.add(prop);
  scene.add(pivot);
  prop.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(prop);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  prop.getObjectByName("view_center")?.getWorldPosition(mid); // 소품이 눈길의 중심을 정해 두었으면 그것을 따른다
  prop.position.sub(mid);
  const radius = view.radius ?? (Math.max(size.x, size.y, size.z) / 2 || 0.1);
  const cam = new THREE.PerspectiveCamera(32, 1, radius * 0.02, radius * 40);
  let dist = radius * (idef.dark ? 1.7 : 4.2), yaw = view.yaw ?? 0, pitch = view.pitch ?? 0.2;
  const home = { yaw, pitch };

  let torch = null, pmrem = null;
  if (idef.dark) {
    scene.add(new THREE.AmbientLight(0x8fa0c0, 0.05));
    torch = new THREE.SpotLight(0xfff0d8, radius * radius * (view.torch ?? 34), radius * 14, 0.24, 0.6, 1.6);
    scene.add(torch, torch.target);
  } else {
    pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    const key = new THREE.DirectionalLight(0xfff3e2, 2.2);
    key.position.set(1.5, 2.5, 2);
    scene.add(key, new THREE.HemisphereLight(0xdfe6f0, 0x54504a, 0.5));
  }

  // ── 화면 ──
  const marks = el("div.s-ins-marks");
  const lensEl = el("div.s-ins-lens.off", el("div.s-ins-lens-text"));
  const tools = el("div.s-ins-tools");
  const hint = el("div.s-ins-hint", idef.dark ? "마우스로 빛을 옮긴다 · 붉은 동그라미를 누른다 · Esc 닫기" : "끌어서 돌린다 · 휠로 당긴다 · 붉은 동그라미를 누른다 · Esc 닫기");
  let done = null;
  const layer = el("div.s-inspect", { "data-dark": idef.dark ? "1" : null },
    el("div.s-ins-title", el("span", "살펴보는 것"), el("b", idef.title)),
    marks, lensEl, tools, hint,
    el("button.s-ins-close", { onclick: () => close() }, "내려놓는다"));
  root.append(layer);

  let talking = false;
  async function say(lines) {
    if (!lines?.length) return;
    talking = true;
    await hud.caption(lines);
    talking = false;
  }

  const details = (idef.details || []).map((d) => {
    const node = prop.getObjectByName(d.node);
    if (!node) console.warn("[inspect] 볼 곳이 없다:", d.node);
    const mark = el("button.s-ins-mark", { title: d.label, onclick: () => pick(entry) }, el("i"), el("span", d.label));
    const entry = { d, node, mark, lit: 0 };
    marks.append(mark);
    return entry;
  });
  const openFor = (d) => (d.needs || []).every(seen);

  async function pick(entry) {
    if (talking) return void hud.advance();
    const { d } = entry;
    const first = !seen(d.id);
    st.seen[seenKey(d.id)] = (st.seen[seenKey(d.id)] || 0) + 1;
    await say(d.text);
    if (first && d.gives) onGain(d.gives);
    if (first) onBark?.(d.bark);
    if (d.choice && !(d.choice.id in st.choices)) {
      talking = true;
      const opt = await choose({ prompt: d.choice.prompt, options: d.choice.options });
      talking = false;
      st.choices[d.choice.id] = opt.id;
      await say(opt.text);
      onGain(opt.effect || {});
      if (opt.effect?.flags?.includes("card_reported") || opt.effect?.flags?.includes("card_pulled")) return close();
    }
  }

  // ── 겹쳐 보기: 다른 물건(안경의 알) 너머로 본다 ──
  let lens = null; // "left" | "right" | null
  const cb = idef.combine;
  if (cb && st.items.includes(cb.with)) {
    const other = def.items[cb.with];
    for (const side of ["left", "right"]) {
      tools.append(el("button.s-ins-tool", { "data-side": side, onclick: () => setLens(lens === side ? null : side) }, `${other.title} · ${side === "left" ? "왼쪽" : "오른쪽"} 알 너머로`));
    }
  }
  function setLens(side) {
    lens = side;
    lensEl.classList.toggle("off", !side);
    lensEl.dataset.side = side || "";
    for (const b of tools.children) b.classList.toggle("on", b.dataset.side === side);
    hint.textContent = side ? "알을 볼 곳 위로 옮긴다 · 같은 단추를 다시 누르면 내려놓는다" : "끌어서 돌린다 · 휠로 당긴다 · 붉은 동그라미를 누른다 · Esc 닫기";
  }
  let lensHold = 0;

  // ── 입력 ──
  const mouse = { x: 0, y: 0, down: false, moved: 0 };
  const canvas = renderer.domElement;
  const onDown = (e) => {
    if (e.target.closest("button")) return;
    mouse.down = true;
    mouse.moved = 0;
  };
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    if (!mouse.down || talking) return;
    mouse.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (view.fixed) {
      yaw = clamp(yaw - e.movementX * 0.002, home.yaw - 0.5, home.yaw + 0.5);
      pitch = clamp(pitch - e.movementY * 0.002, home.pitch - 0.25, home.pitch + 0.35);
    } else {
      yaw -= e.movementX * 0.008;
      pitch = clamp(pitch + e.movementY * 0.008, -1.4, 1.4);
    }
  };
  const onUp = () => {
    if (mouse.down && mouse.moved < 5 && talking) hud.advance();
    mouse.down = false;
  };
  const onWheel = (e) => {
    e.preventDefault();
    dist = clamp(dist * (e.deltaY > 0 ? 1.1 : 0.9), radius * (view.near ?? 1.3), radius * (view.fixed ? 2.2 : 6));
  };
  const onKey = (e) => {
    if (["KeyE", "Enter", "Space"].includes(e.code)) {
      e.preventDefault();
      hud.advance();
    } else if (e.code === "Escape") {
      if (lens) setLens(null);
      else close();
    }
  };
  layer.addEventListener("pointerdown", onDown);
  layer.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  layer.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKey);

  // ── 한 프레임 ──
  const v = new THREE.Vector3(), ndc = new THREE.Vector2(), ray = new THREE.Raycaster();
  let raf = 0, last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    if (view.fixed) {
      // 좁은 틈을 올려다본다: 카메라가 고개를 돌린다
      cam.position.set(radius * 0.12, -radius * 0.12, dist);
      cam.rotation.set(pitch, yaw, 0, "YXZ");
    } else {
      pivot.rotation.set(pitch, yaw, 0, "XYZ");
      cam.position.set(0, 0, dist);
      cam.lookAt(0, 0, 0);
    }
    cam.updateMatrixWorld();
    ndc.set((mouse.x / w) * 2 - 1, -(mouse.y / h) * 2 + 1);
    if (torch) {
      ray.setFromCamera(ndc, cam);
      torch.position.copy(cam.position).add(new THREE.Vector3(radius * 0.08, -radius * 0.1, 0));
      torch.target.position.copy(ray.ray.origin).addScaledVector(ray.ray.direction, radius * 3);
    }
    pivot.updateMatrixWorld(true);
    for (const entry of details) {
      const { d, node, mark } = entry;
      if (!node || !openFor(d)) {
        mark.style.display = "none";
        continue;
      }
      node.getWorldPosition(v).project(cam);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const front = v.z < 1 && x > 20 && x < w - 20 && y > 60 && y < h - 60;
      // 어두운 곳: 빛이 가까이 닿아야 드러난다. 한 번 본 곳은 남는다.
      const near = Math.hypot(x - mouse.x, y - mouse.y);
      const want = !front ? 0 : !torch || seen(d.id) ? 1 : near < 110 ? 1 : 0;
      entry.lit += (want - entry.lit) * Math.min(1, dt * 7);
      mark.style.display = entry.lit > 0.03 && !lens ? "" : "none";
      mark.style.opacity = entry.lit.toFixed(2);
      mark.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      mark.classList.toggle("seen", seen(d.id));
      mark.classList.toggle("hot", near < 34);
    }
    if (lens && cb) {
      lensEl.style.transform = `translate(${mouse.x}px, ${mouse.y}px)`;
      const node = prop.getObjectByName(cb.at);
      let over = false;
      if (node) {
        node.getWorldPosition(v).project(cam);
        over = v.z < 1 && Math.hypot((v.x * 0.5 + 0.5) * w - mouse.x, (-v.y * 0.5 + 0.5) * h - mouse.y) < 46;
      }
      const shows = over && lens === cb.lens;
      lensEl.classList.toggle("shows", shows);
      lensEl.firstChild.textContent = shows ? "E" : "";
      lensHold = over ? lensHold + dt : 0;
      if (lensHold > 0.9 && !talking) {
        lensHold = -99;
        const flag = `lens_${id}_${lens}`;
        if (lens === cb.lens) {
          const first = !st.flags[flag];
          st.flags[flag] = true;
          say([cb.text[0]]).then(() => first && onGain(cb.gives || {}));
        } else {
          st.flags[flag] = true;
          say([cb.text[1] || "아무것도 보이지 않는다."]);
        }
      }
      if (!over && lensHold < 0) lensHold = 0;
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.render(scene, cam);
  }

  function close() {
    if (talking || !done) return;
    cancelAnimationFrame(raf);
    layer.removeEventListener("pointerdown", onDown);
    layer.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    layer.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKey);
    layer.remove();
    scene.environment?.dispose();
    pmrem?.dispose();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      for (const m of [].concat(o.material)) {
        m.map?.dispose();
        m.dispose();
      }
    });
    const d = done;
    done = null;
    d();
  }

  const closed = new Promise((r) => (done = r));
  mouse.x = canvas.clientWidth / 2;
  mouse.y = canvas.clientHeight / 2;
  frame(performance.now());
  const introKey = `inspect.${id}`;
  if (!st.seen[introKey]) {
    st.seen[introKey] = 1;
    await say(idef.intro);
  }
  return closed;
}
