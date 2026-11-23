// 현장의 인물 — 3D 모델과 동작. 모델(glb)이 아직 없으면 마네킹 대역을 세운다.
// 동작은 glb 안의 클립 이름에서 읽는다: idle(서 있기), talk(말하기). 따로 내보낸 클립 파일은 def.clips에 적는다.
import * as THREE from "three";

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function mannequin(height) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x6f7480, roughness: 0.9 });
  const k = height / 1.62;
  const part = (geo, m, y, x = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x * k, y * k, z * k);
    o.scale.setScalar(k);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  part(new THREE.CapsuleGeometry(0.075, 0.62, 4, 10), cloth, 0.42, -0.09);
  part(new THREE.CapsuleGeometry(0.075, 0.62, 4, 10), cloth, 0.42, 0.09);
  const torso = part(new THREE.CapsuleGeometry(0.17, 0.34, 6, 14), cloth, 1.08);
  torso.scale.set(k, k, k * 0.72);
  part(new THREE.CapsuleGeometry(0.048, 0.5, 4, 8), cloth, 1.02, -0.225);
  part(new THREE.CapsuleGeometry(0.048, 0.5, 4, 8), cloth, 1.02, 0.225);
  part(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), skin, 1.39);
  const head = part(new THREE.SphereGeometry(0.105, 18, 14), skin, 1.51);
  head.scale.set(k * 0.92, k * 1.08, k);
  head.name = "Head";
  return { group: g, head };
}

export async function loadNpc(loader, def, at, yaw) {
  const root = new THREE.Group();
  root.name = `npc_${def.id}_root`;
  root.position.copy(at);
  root.rotation.y = yaw;
  const height = def.height || 1.65;
  let mixer = null, headNode = null, placeholder = null;
  const actions = {};

  let gltf = null;
  if (def.model) {
    try {
      gltf = await loader.loadAsync(def.model);
    } catch {
      gltf = null;
    }
  }
  if (gltf) {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const s = height / (box.max.y - box.min.y || 1);
    model.scale.multiplyScalar(s);
    model.position.y -= box.min.y * s;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false; // 뼈대로 움직이는 메시는 경계 상자가 맞지 않는다
      }
      if (!headNode && o.isBone && /head/i.test(o.name) && !/end|top|nub/i.test(o.name)) headNode = o;
    });
    root.add(model);
    mixer = new THREE.AnimationMixer(model);
    const clips = [...gltf.animations];
    for (const [name, url] of Object.entries(def.clips || {})) {
      try {
        const extra = await loader.loadAsync(url);
        if (extra.animations[0]) clips.push(Object.assign(extra.animations[0], { name }));
      } catch { /* 클립 파일이 없으면 그 동작 없이 간다 */ }
    }
    for (const clip of clips) {
      const key = /talk|speak|gesture/i.test(clip.name) ? "talk" : /idle|stand|breath/i.test(clip.name) ? "idle" : clip.name;
      actions[key] ||= mixer.clipAction(clip);
    }
    actions.idle ||= clips[0] ? mixer.clipAction(clips[0]) : null;
    actions.idle?.play();
    // 끄덕임(agree)은 한 번만 하고 서 있기로 돌아온다
    if (actions.agree && actions.agree !== actions.idle) {
      actions.agree.setLoop(THREE.LoopOnce, 1);
      actions.agree.clampWhenFinished = true;
      mixer.addEventListener("finished", (e) => {
        if (e.action !== actions.agree) return;
        actions.idle.reset().fadeIn(0.5).play();
        actions.agree.fadeOut(0.5);
      });
    }
  } else {
    placeholder = mannequin(height);
    root.add(placeholder.group);
    headNode = placeholder.head;
  }

  const homeYaw = yaw;
  let talking = false, pulse = 0, t = Math.random() * 10;
  const head = new THREE.Vector3();
  const npc = {
    def, root, isPlaceholder: !gltf,
    headPos() {
      if (headNode) return headNode.getWorldPosition(head);
      return head.copy(root.position).setY(root.position.y + height * 0.93);
    },
    setTalking(on) {
      if (talking === on) return;
      talking = on;
      if (actions.talk && actions.idle) {
        const [from, to] = on ? [actions.idle, actions.talk] : [actions.talk, actions.idle];
        to.reset().play();
        from.crossFadeTo(to, 0.4, false);
      }
    },
    speak() {
      pulse = 1;
    },
    nod() {
      pulse = 1;
      const a = actions.agree;
      if (!a || a === actions.idle || (a.isRunning() && a.getEffectiveWeight() > 0.5)) return;
      a.reset().fadeIn(0.3).play();
      actions.idle.fadeOut(0.3);
    },
    update(dt, eye, trust = 50) {
      t += dt;
      mixer?.update(dt);
      // 기자가 가까이 오면 몸을 돌려 마주 본다. 멀어지면 제자리로.
      const dx = eye.x - root.position.x, dz = eye.z - root.position.z, d = Math.hypot(dx, dz);
      const want = d < 4.5 || talking ? Math.atan2(dx, dz) : homeYaw;
      root.rotation.y += angDiff(want, root.rotation.y) * Math.min(1, dt * (talking ? 4 : 1.6));
      pulse = Math.max(0, pulse - dt * 1.6);
      if (placeholder) {
        // 숨, 말할 때의 고갯짓. 믿음이 낮으면 몸을 조금 뒤로 뺀다.
        const g = placeholder.group;
        g.position.y = Math.sin(t * 1.4) * 0.004;
        g.rotation.x = (trust < 40 ? -0.05 : trust > 70 ? 0.03 : 0) + Math.sin(pulse * Math.PI) * 0.05;
        placeholder.head.rotation.x = Math.sin(pulse * Math.PI * 2) * 0.12 + (talking ? Math.sin(t * 5) * 0.02 : 0);
      } else if (headNode && pulse > 0) {
        headNode.rotation.x += Math.sin(pulse * Math.PI * 2) * 0.1;
      }
    },
  };
  return npc;
}
