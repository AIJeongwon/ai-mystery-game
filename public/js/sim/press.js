// 플레이어의 언론사 — 묶음 내보내기. 규칙은 sim/press/ 아래에 일별로 나뉘어 있다.
export * from "./press/base.js"; //        시간 쓰기, 투자·역량 단계
export * from "./press/notebook.js"; //    취재 수첩
export * from "./press/investigate.js"; // 자료 조사, 현장 취재, 심층 추적
export * from "./press/trust.js"; //       인터뷰 신뢰도
export * from "./press/travel.js"; //      이동
export * from "./press/money.js"; //       지출과 수입
export * from "./press/reach.js"; //       독자 도달(조회수 추정)
export * from "./press/judge.js"; //       규칙 기반 기사 판정
export * from "./press/publish.js"; //     발행
export * from "./press/readership.js"; //  조회수 정산 (30분 틱)
export * from "./press/aftermath.js"; //   정정보도와 보도 적중
export * from "./press/growth.js"; //      경험치, 등급, 설비
export * from "./press/bureaus.js"; //     지국
export * from "./press/staff.js"; //       직원
export * from "./press/settlement.js"; //  하루 정산
export * from "./press/draft.js"; //       초안 보조
