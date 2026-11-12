// 화면과 프롬프트에 쓰는 이름표: 국면, 규모, 취재원의 태도, 사실의 깊이
export const STAGES = [
  { key: "rumor", ko: "소문", color: "#8a93a3" },
  { key: "breaking", ko: "발생", color: "#ff6a55" },
  { key: "developing", ko: "전개", color: "#f0b24f" },
  { key: "aftermath", ko: "수습", color: "#6fb7d6" },
  { key: "closed", ko: "종결", color: "#5d6675" },
];

export const SIG_LABEL = ["", "지역", "전국", "주요국", "국제", "세계적"];
export const STANCE_KO = { friendly: "우호적", neutral: "중립", evasive: "회피적", hostile: "방어적" };
export const DEPTH_KO = ["공개 사실", "현장 사실", "내부 사정", "핵심 진상"];
