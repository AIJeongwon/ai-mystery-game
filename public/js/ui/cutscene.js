// 컷신 재생기 — 배경 일러스트 + 내레이션/대사 + 연출(도장, 문자 메시지, 문서, 장 제목)
import { G } from "../core/store.js";
import { h, $, mount, icon, sealSvg, portraitUrl } from "./dom.js";
import { sleep } from "../core/util.js";
import { hold, release } from "../sim/clock.js";
import { sfx, music } from "../audio.js";

let active = null;
export const cutsceneOpen = () => Boolean(active);

const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

export function playCutscene(steps, vars = {}) {
  return new Promise((resolve) => {
    const root = $("#cutscene");
    const v = { reporter: G?.meta.reporter ?? "", outlet: G?.meta.outlet ?? "", ...vars };
    const bgA = h("div.cs-bg"), bgB = h("div.cs-bg");
    const portrait = h("div.cs-portrait.hidden");
    const who = h("div.cs-who");
    const text = h("div.cs-text");
    const hintEl = h("div.cs-next", "▼");
    const box = h("div.cs-box", who, text, hintEl);
    const stage = h("div.cs-stage");
    const skipBtn = h("button.cs-skip", { onclick: (e) => { e.stopPropagation(); skipAll(); } }, "건너뛰기 ≫");
    mount(root, bgA, bgB, h("div.cs-vignette"), stage, portrait, box, skipBtn);
    root.classList.remove("hidden");
    requestAnimationFrame(() => root.classList.add("in"));
    hold();
    let cur = bgA, i = 0, typing = false, skipType = false, waiter = null, done = false, skipping = false;
    const result = {};
    active = { root };

    const setBg = (name) => {
      const next = cur === bgA ? bgB : bgA;
      next.style.backgroundImage = name ? `url(/assets/bg/${name}.jpg)` : "none";
      next.classList.add("on");
      cur.classList.remove("on");
      cur = next;
    };
    const waitClick = () => new Promise((res) => (waiter = res));
    const advance = () => {
      if (typing) return (skipType = true);
      if (waiter) {
        const w = waiter;
        waiter = null;
        w();
      }
    };
    async function type(str) {
      typing = true;
      skipType = false;
      text.textContent = "";
      hintEl.classList.remove("on");
      for (let n = 0; n < str.length; n++) {
        if (skipType || skipping) {
          text.textContent = str;
          break;
        }
        text.textContent += str[n];
        if (n % 2 === 0) sfx("tick");
        await sleep(/[.,!?…—]/.test(str[n]) ? 90 : 24);
      }
      typing = false;
      hintEl.classList.add("on");
    }
    async function run() {
      while (i < steps.length && !done) {
        const s = steps[i++];
        if (s.bg !== undefined) setBg(s.bg);
        if (s.music) music(s.music);
        if (s.sfx) sfx(s.sfx);
        if (s.shake) {
          root.classList.add("shake");
          setTimeout(() => root.classList.remove("shake"), 500);
        }
        if (s.clear) mount(stage);
        if (skipping && !s.choice) {
          if (s.run) s.run(result);
          continue;
        }
        if (s.wait) await sleep(s.wait);
        if (s.title) {
          box.classList.add("hidden");
          portrait.classList.add("hidden");
          const card = h("div.cs-title", h("div.cs-title-over", fill(s.title.over || "", v)), h("div.cs-title-main", fill(s.title.main, v)), s.title.sub ? h("div.cs-title-sub", fill(s.title.sub, v)) : null);
          mount(stage, card);
          sfx("stamp");
          await sleep(60);
          card.classList.add("in");
          await Promise.race([waitClick(), sleep(s.title.ms || 4200)]);
          waiter = null;
          card.classList.remove("in");
          await sleep(500);
          mount(stage);
          box.classList.remove("hidden");
        }
        if (s.seal) {
          const el = h("div.cs-seal", { html: sealSvg(220, s.seal === true ? "記定" : s.seal) });
          stage.append(el);
          await sleep(40);
          el.classList.add("hit");
          sfx("canon");
          root.classList.add("shake");
          setTimeout(() => root.classList.remove("shake"), 500);
          await sleep(1500);
        }
        if (s.big) {
          const el = h("div.cs-big", fill(s.big, v));
          mount(stage, el);
          await sleep(40);
          el.classList.add("in");
        }
        if (s.phone) {
          const el = stage.querySelector(".cs-phone") || h("div.cs-phone", h("div.cs-phone-head", icon("phone", 14), fill(s.phone.from || "발신자 표시 없음", v)));
          if (!el.parentNode) mount(stage, el);
          const msg = h("div.cs-phone-msg", fill(s.phone.text, v));
          el.append(msg);
          sfx("ding");
          await sleep(40);
          msg.classList.add("in");
        }
        if (s.paper) {
          const body = h("div", { html: fill(s.paper.body, v) });
          const el = h("div.cs-paper.paperbox", s.paper.mast ? h("div.np-mast", h("span", fill(s.paper.mast, v)), h("span", fill(s.paper.date || "", v))) : null, s.paper.title ? h("h5", fill(s.paper.title, v)) : null, s.paper.by ? h("div.by", fill(s.paper.by, v)) : null, body);
          mount(stage, el);
          sfx("paper");
          await sleep(40);
          el.classList.add("in");
        }
        if (s.text) {
          const name = s.who ? fill(s.who, v) : "";
          who.textContent = name;
          who.classList.toggle("hidden", !name);
          box.classList.toggle("narr", !name);
          if (s.portrait) {
            portrait.style.backgroundImage = `url(${portraitUrl(s.portrait)})`;
            portrait.classList.remove("hidden");
          } else if (!s.keepPortrait) portrait.classList.add("hidden");
          await type(fill(s.text, v));
          if (!skipping) await waitClick();
        } else if (s.big || s.phone || s.paper) {
          hintEl.classList.add("on");
          await waitClick();
        }
        if (s.choice) {
          const pickV = await new Promise((res) => {
            const el = h("div.cs-choices", s.choice.map((c) => h("button.cs-choice", { onclick: (e) => { e.stopPropagation(); sfx("click"); res(c.value); } }, fill(c.label, v))));
            stage.append(el);
          });
          result[s.key || "choice"] = pickV;
          stage.querySelector(".cs-choices")?.remove();
        }
        if (s.run) s.run(result);
      }
      finish();
    }
    function skipAll() {
      skipping = true;
      skipType = true;
      advance();
    }
    function finish() {
      if (done) return;
      done = true;
      root.classList.remove("in");
      document.removeEventListener("keydown", onKey);
      root.onclick = null;
      setTimeout(() => {
        root.classList.add("hidden");
        mount(root);
        active = null;
        release();
        resolve(result);
      }, 500);
    }
    const onKey = (e) => {
      if (e.code === "Space" || e.key === "Enter") {
        e.preventDefault();
        advance();
      }
    };
    root.onclick = advance;
    document.addEventListener("keydown", onKey);
    run();
  });
}
