// 시험 공용 도우미 — 브라우저·LLM 없이 규칙 엔진만 돌리는 새 게임을 만든다.
// (파일 이름이 *.test.mjs가 아니므로 시험으로 실행되지는 않는다.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setG, newGame } from "../public/js/core/store.js";
import { initDirector } from "../public/js/sim/director.js";
import { initChronicle } from "../public/js/sim/chronicle.js";
import { initPress, refreshCandidates } from "../public/js/sim/press.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function fresh(seed = 7) {
  const g = newGame({ reporter: "시험", outlet: "시험일보", skipPrologue: true, seed });
  setG(g);
  initDirector();
  initChronicle();
  initPress();
  refreshCandidates();
  return g;
}

// 폴더 아래의 파일을 모두 찾는다
export const walk = (dir, ext = ".js") => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), ext) : e.name.endsWith(ext) ? [path.join(dir, e.name)] : []));
