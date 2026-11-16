// DOM 도우미, 아이콘, 모달, 토스트
import { hold, release } from "../sim/clock.js";
import { sfx } from "../audio.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// h("div.cls#id", {onclick, style:{}, html, ...attrs}, ...children)
export function h(spec, props, ...kids) {
  const [first, ...extra] = String(spec).trim().split(/\s+/);
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(first) || [];
  const el = document.createElement(m[1] || "div");
  for (const c of extra) if (c) el.classList.add(c);
  if (m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) || []) {
      if (part[0] === ".") el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (props != null && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className += (el.className ? " " : "") + v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k in el && k !== "list") {
        try {
          el[k] = v;
        } catch {
          el.setAttribute(k, v);
        }
      } else el.setAttribute(k, v === true ? "" : v);
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}
export function mount(el, ...kids) {
  clear(el);
  append(el, kids);
  return el;
}

// ── 아이콘 (24px 선화) ──
const ICONS = {
  lead: '<path d="M4 6h16M4 12h10M4 18h13"/><circle cx="19" cy="12" r="2.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  article: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  manage: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  rank: '<path d="M8 21h8M12 17v4M6 4h12v5a6 6 0 0 1-12 0z"/><path d="M6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3"/>',
  stamp: '<path d="M9 3h6l-1 8h-4z"/><path d="M6 15c0-2.2 2-4 6-4s6 1.8 6 4v2H6z"/><path d="M5 21h14"/>',
  case: '<path d="M4 7h6l2 2h8v10H4z"/><circle cx="14" cy="14.5" r="2.2"/><path d="m15.7 16.2 2 2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  ff: '<path d="m4 5 8 7-8 7zM13 5l8 7-8 7z"/>',
  fff: '<path d="m2 6 6 6-6 6zM9 6l6 6-6 6zM16 6l6 6-6 6z"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/>',
  plane: '<path d="M21 3 3 10.500l6.500 2.500L12 19.500z"/><path d="M9.500 13 21 3"/>',
  search: '<circle cx="11" cy="11" r="6.500"/><path d="m16 16 5 5"/>',
  site: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900 7 7M17 17l2.100 2.100M19.100 4.900 17 7M7 17l-2.100 2.100"/>',
  check: '<path d="m4 12.500 5 5L20 6.500"/>',
  law: '<path d="M12 3v18M5 21h14M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  mega: '<path d="M4 10v4l3 .5 9 4.500V5L7 9.500z"/><path d="M19 9.500a3.500 3.500 0 0 1 0 5M8 15l1 5h2.500"/>',
  pen: '<path d="m4 20 1-4L16 5l3 3L8 19z"/><path d="m14 7 3 3"/>',
  phone: '<path d="M6 3h4l1.500 5-2.500 1.500a11 11 0 0 0 5.500 5.500L16 12.500l5 1.500v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
  talk: '<path d="M4 5h16v11H9l-5 4z"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  eye: '<path d="M2 12s3.500-7 10-7 10 7 10 7-3.500 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  fire: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  users: '<circle cx="9" cy="8" r="3.500"/><path d="M2 20c0-3.500 3-6 7-6s7 2.500 7 6"/><circle cx="17.500" cy="9" r="2.500"/><path d="M17 14c3 0 5 2 5 5"/>',
  coin: '<circle cx="12" cy="12" r="8.500"/><path d="M9 9.500h4a2 2 0 0 1 0 4H9v-7M9 13.500h5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.500 8 8 9 4.500-1 8-4 8-9V6z"/>',
  flag: '<path d="M5 21V4M5 4h12l-2.500 4 2.500 4H5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  back: '<path d="M10 6 4 12l6 6M4 12h16"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="m17 9.500 5 5M22 9.500l-5 5"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500v.500"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  home: '<path d="m4 11 8-7 8 7v9h-5v-6H9v6H4z"/>',
};
export function icon(name, size = 18) {
  const el = document.createElement("span");
  el.className = "ico";
  el.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  return el;
}

// 도장 인영 SVG (記定)
export function sealSvg(size = 64, text = "記定") {
  const [a, b] = [...text];
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="seal-svg" aria-hidden="true">
  <defs><filter id="sealrough"><feTurbulence type="fractalNoise" baseFrequency="0.900" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.400"/></filter>
  <mask id="sealwear"><rect width="100" height="100" fill="#fff"/><g fill="#000" opacity=".550"><circle cx="18" cy="72" r="3"/><circle cx="80" cy="22" r="2.200"/><circle cx="62" cy="86" r="1.800"/><circle cx="30" cy="16" r="1.600"/><rect x="44" y="46" width="14" height="1.600" transform="rotate(18 50 50)"/></g></mask></defs>
  <g filter="url(#sealrough)" mask="url(#sealwear)">
    <rect x="7" y="7" width="86" height="86" rx="7" fill="none" stroke="currentColor" stroke-width="6"/>
    <text x="50" y="45" text-anchor="middle" font-family="'Noto Serif KR',serif" font-weight="900" font-size="38" fill="currentColor">${a}</text>
    <text x="50" y="84" text-anchor="middle" font-family="'Noto Serif KR',serif" font-weight="900" font-size="38" fill="currentColor">${b || ""}</text>
  </g></svg>`;
}

export const portraitUrl = (key, thumb = false) => `/assets/portrait/${thumb ? "thumb/" : ""}${key}.jpg`;

// ── 토스트 ──
export function toast(text, kind = "info", ms = 4200) {
  const root = $("#toasts");
  const el = h(`div.toast.t-${kind}`, { html: "" }, text);
  root.append(el);
  if (root.children.length > 5) root.firstChild.remove();
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => {
    el.classList.remove("in");
    setTimeout(() => el.remove(), 350);
  }, ms);
  return el;
}

// ── 모달 ──
const stack = [];
export function modal({ title, body, buttons = [], cls = "", onClose, closable = true, holdClock = true, eyebrow }) {
  const root = $("#modal-root");
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    wrap.classList.remove("in");
    stack.splice(stack.indexOf(api), 1);
    document.removeEventListener("keydown", onKey);
    if (holdClock) release();
    setTimeout(() => wrap.remove(), 180);
    onClose?.(result);
  };
  const onKey = (e) => {
    if (e.key === "Escape" && closable && stack[stack.length - 1] === api) {
      e.stopPropagation();
      close();
    }
  };
  const btnRow = h("div.modal-btns");
  const setButtons = (list) => {
    clear(btnRow);
    for (const b of list) {
      btnRow.append(
        h(`button.btn${b.primary ? ".primary" : ""}${b.danger ? ".danger" : ""}${b.ghost ? ".ghost" : ""}`, {
          disabled: b.disabled, title: b.title,
          onclick: async (e) => {
            sfx("click");
            const r = await b.onclick?.(e, api);
            if (r !== false && !b.keep) close(b.value ?? r);
          },
        }, b.icon ? icon(b.icon, 16) : null, b.label),
      );
    }
    btnRow.classList.toggle("hidden", !list.length);
  };
  const bodyEl = h("div.modal-body", body);
  const box = h(`div.modal ${cls}`,
    title || closable ? h("div.modal-head", h("div", eyebrow ? h("div.eyebrow", eyebrow) : null, h("h2", title || "")), closable ? h("button.icon-btn", { onclick: () => close(), title: "닫기 (Esc)" }, icon("close")) : null) : null,
    bodyEl, btnRow);
  const wrap = h("div.modal-wrap", { onmousedown: (e) => e.target === wrap && closable && close() }, box);
  const api = { close, el: box, body: bodyEl, setButtons, wrap };
  setButtons(buttons);
  root.append(wrap);
  stack.push(api);
  if (holdClock) hold();
  document.addEventListener("keydown", onKey);
  requestAnimationFrame(() => wrap.classList.add("in"));
  return api;
}
export const modalOpen = () => stack.length > 0;

export function confirmDialog(text, { yes = "확인", no = "취소", title = "확인", danger = false, html = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title, cls: "small", body: html ? h("div.confirm-text", { html: text }) : h("div.confirm-text", text),
      buttons: [
        { label: no, ghost: true, onclick: () => { answered = true; resolve(false); } },
        { label: yes, primary: !danger, danger, onclick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => !answered && resolve(false),
    });
  });
}
export function alertDialog(text, { title = "알림", ok = "확인", html = false, cls = "small" } = {}) {
  return new Promise((resolve) => {
    modal({ title, cls, body: html ? h("div.confirm-text", { html: text }) : h("div.confirm-text", text), buttons: [{ label: ok, primary: true }], onClose: () => resolve() });
  });
}

// 막대
export function bar(value, max = 100, cls = "") {
  return h(`div.bar ${cls}`, h("i", { style: { width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` } }));
}
export function chip(text, cls = "", style) {
  return h(`span.chip ${cls}`, { style }, text);
}
export function stat(label, value, cls = "") {
  return h(`div.stat ${cls}`, h("label", label), h("b", value));
}
