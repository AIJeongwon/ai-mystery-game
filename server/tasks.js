// 바깥(공유) 접속자가 쓸 수 있는 LLM 작업과 작업별 출력 상한(토큰).
// 이름은 클라이언트의 public/js/llm/tasks/limits.js와 같아야 하고, 상한은 그쪽 값 이상이어야 한다
// (tests/llm-tasks.test.mjs가 확인한다). 이 파일은 불러와도 아무 일도 일어나지 않는다.
export const TASK_CAPS = { npc: 900, director: 5000, chronicle: 3500, judge: 4000, decree: 3000, draft: 2000 };
