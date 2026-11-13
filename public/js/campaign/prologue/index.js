// 프롤로그 「첫 문장」 — 도장을 '어떻게' 얻었는지 보여 준다. '왜'는 다음 장의 몫이다.
import { EVICT } from "./scene.js";
import { BEATS } from "./beats.js";

export const PROLOGUE = {
  id: "prologue",
  label: "프롤로그 · 첫 문장",
  beats: BEATS,
  scenes: [EVICT],
  // 이 장에서는 도장을 찍은 뒤의 연출(지도의 물결)을 줄인다. 무슨 일이 일어났는지는 다음 비트의 컷신이 보여 준다.
  quietDecree: true,
};
