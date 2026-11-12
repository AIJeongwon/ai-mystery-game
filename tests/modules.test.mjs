// 모든 클라이언트 모듈이 서로 맞물리는지 확인한다.
// 브라우저 없이 모듈을 하나씩 불러 본다. 없는 내보내기를 가져오거나 경로가 틀리면 여기서 걸린다.
// (화면 모듈은 불러오기만 하고 실행하지 않는다. 화면 동작은 브라우저에서 따로 확인한다.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JS = path.join(ROOT, "public", "js");

// 모듈을 불러올 때 건드릴 수 있는 브라우저 전역의 빈 대역
const noop = () => {};
const el = () => new Proxy(function () {}, { get: (_, k) => (k === "style" || k === "classList" || k === "dataset" ? el() : k === Symbol.toPrimitive ? () => "" : el()), apply: () => el(), set: () => true });
globalThis.window ??= globalThis;
globalThis.addEventListener ??= noop;
globalThis.removeEventListener ??= noop;
globalThis.d3 ??= el(); // index.html이 먼저 읽는 전역 라이브러리
globalThis.topojson ??= el();
globalThis.document ??= { addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, createElementNS: el, body: el(), documentElement: el(), fonts: { ready: Promise.resolve() } };
globalThis.localStorage ??= { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame ??= noop;
globalThis.cancelAnimationFrame ??= noop;
globalThis.location ??= { search: "", href: "http://localhost/" };

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []));
const files = walk(JS).filter((f) => path.basename(f) !== "main.js"); // main.js는 불러오는 즉시 게임을 시작한다

test(`클라이언트 모듈 ${files.length}개가 모두 불러와진다`, async () => {
  const failed = [];
  for (const f of files) {
    try {
      await import(pathToFileURL(f).href);
    } catch (e) {
      failed.push(`${path.relative(ROOT, f)}: ${e.message}`);
    }
  }
  assert.deepEqual(failed, []);
});

test("main.js가 가져오는 이름이 모두 내보내져 있다", async () => {
  const src = fs.readFileSync(path.join(JS, "main.js"), "utf8");
  const missing = [];
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"(\.[^"]+)"/g)) {
    const mod = await import(pathToFileURL(path.resolve(JS, m[2])).href);
    for (const name of m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!(name in mod)) missing.push(`${m[2]} → ${name}`);
  }
  assert.deepEqual(missing, []);
});
