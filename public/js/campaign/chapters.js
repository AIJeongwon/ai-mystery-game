// 장(章) 등록 — 새 장은 폴더를 만들고 아래 목록에 한 줄을 더한다. 목록의 순서가 진행 순서다.
//
// 장이 내보내는 것:
//   id, label        이름
//   beats            비트의 배열 (enter / objective / watch / done / exit)
//   evidence         (선택) 증거 정의
//   deductions       (선택) 추리 정의
//   worldSetup       (선택) 게임이 시작할 때 세계에 심어 둘 것. (api, g)를 받는다
//   finals           (선택) 환원 뒤 직접 써야 하는 기사 설정. 문장의 id → { ev, facts, minBody, viewsMul, guide }
//   scenes, canons   (선택) 이 장이 쓰는 각본 사건과 미리 정해 둔 문장의 목록. 콘텐츠 검사(tests/campaign.test.mjs)가 훑어본다
//   quietDecree      (선택) true면 이 장에서 도장을 찍은 뒤의 연출을 줄인다
import { PROLOGUE } from "./prologue/index.js";
import { CHAPTER1 } from "./ch1/index.js";

const LIST = [PROLOGUE, CHAPTER1];

export const CHAPTERS = Object.fromEntries(LIST.map((ch) => [ch.id, ch]));
export const ORDER = LIST.map((ch) => ch.id);
