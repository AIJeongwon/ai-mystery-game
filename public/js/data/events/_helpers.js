// 사건 유형을 적을 때 쓰는 도우미
// hint: LLM 연출가에게 주는 서사 지침.  fb: LLM이 없을 때 쓰는 규칙 기반 서사 틀.
// 치환자: {actor} 주요 행위자, {org} 조직, {city} 도시, {country} 국가, {n1}{n2} 숫자, {p1}{p2}{p3} 인물 이름
// dur: 단계별 지속 시간(시간) [소문→발생, 발생→전개, 전개→수습, 수습→종결]
// impact: 종결 시 세계 수치에 주는 방향 (언론 압력에 비례해 증폭)
// w: 그 나라에서 이 유형이 생길 가중치. 나라의 고정 값과 움직이는 값을 합친 객체를 받는다.

export const T = (cat, label, o) => ({ cat, label, sig: [1, 3], start: 1, dur: [8, 14, 26, 16], w: () => 1, impact: {}, ...o });
export const low = (c) => (100 - c.stab) / 40; // 불안정할수록 ↑
export const rich = (c) => c.gdp / 3;
export const free = (c) => c.press / 60;
export const unfree = (c) => (100 - c.press) / 45;
