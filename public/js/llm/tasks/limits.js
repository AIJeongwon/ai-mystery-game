// LLM 작업 목록과 작업별 출력 상한(토큰).
// 새 작업을 더하면 여기에 이름과 상한을 적고, 서버의 TASK_CAPS(server/tasks.js)에도 같은 이름을 넣는다.
// 서버의 상한이 여기 값보다 작으면 공유 접속자의 응답이 잘린다 (tests/llm-tasks.test.mjs가 확인한다).
export const TASK_LIMITS = {
  director: 4500, //  사건 연출
  chronicle: 3000, // 국면 전개
  npc: 700, //        인물 연기
  judge: 3500, //     기사 판정
  decree: 2500, //    기정문 해석
  draft: 1500, //     초안 보조
};
