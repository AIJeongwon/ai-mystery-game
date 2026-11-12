// 제1장 「이미 찍힌 문장」 — 열두 해 전 다른 언론사가 찍은 문장을 추적해 되돌린다.
import { MORO_CANON, MORO_SENTENCE, FINAL_FACTS } from "./canon.js";
import { EVIDENCE } from "./evidence.js";
import { DEDUCTIONS } from "./deductions.js";
import { BOX, GENEVA, LYON, NAIROBI, LONDON } from "./scenes.js";
import { BEATS } from "./beats.js";

export const CHAPTER1 = {
  id: "ch1",
  label: "제1장 · 이미 찍힌 문장",
  evidence: EVIDENCE,
  deductions: DEDUCTIONS,
  beats: BEATS,
  // 이 장이 쓰는 무대와 미리 정해 둔 문장 (콘텐츠 검사와 문서가 훑어본다. 실제로 세계에 놓는 일은 비트가 한다)
  scenes: [BOX, GENEVA, LYON, NAIROBI, LONDON],
  canons: [MORO_CANON],
  // 게임이 시작할 때 세계에 심어 둘 것: 열두 해 전의 문장은 세계의 시작부터 '상식'이다
  worldSetup(api, g) {
    if (!g.canon.list.some((x) => x.id === MORO_CANON.id)) api.plant(MORO_CANON);
  },
  // 환원에 성공한 뒤 직접 써야 하는 기사 (문장의 id → 설정). 수수께끼에 final: true가 붙은 문장만 해당한다.
  finals: {
    [MORO_CANON.id]: {
      ev: "c6_london", facts: FINAL_FACTS, minBody: 100, viewsMul: 8, publishLabel: "환원 기사 발행",
      guide: "열두 해 전의 문장을 푸는 기사다. 직접 써라.\n\n· 찍힌 문장을 그대로 인용할 것\n· 그 문장을 찍은 사람의 이름\n· 2019년 3월 17일 밤의 일\n· 보고서가 진짜였다는 근거 (시료, 실험 노트, 빈 서가)",
    },
  },
};

export { MORO_CANON, MORO_SENTENCE, FINAL_FACTS, EVIDENCE, DEDUCTIONS };
