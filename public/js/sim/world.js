// 세계 규칙 엔진 — 세계 상태의 유일한 권위자. LLM은 서사만 제안하고, 수치는 여기서만 바뀐다.
// 묶음 내보내기. 규칙은 sim/world/ 아래에 일별로 나뉘어 있다.
export * from "./world/query.js"; //     나라·행위자·사건 조회, 현지 기반
export * from "./world/actors.js"; //    행위자 만들기
export * from "./world/feed.js"; //      와이어
export * from "./world/seeds.js"; //     사건 씨앗(나라·유형·규모 뽑기)
export * from "./world/narrative.js"; // 규칙 기반 서사
export * from "./world/events.js"; //    사건 생성·발견·국면·종결
export * from "./world/schedule.js"; //  일정표
export * from "./world/tick.js"; //      30분·1시간 틱
