// 언론사 — 플레이어 매체와 경쟁사 아홉 곳
// 모든 인물·단체·매체는 허구. 국가 키는 world-atlas의 ISO 숫자 코드 문자열.

// speed: 속보 반응, depth: 심층 취재력, tone: 선정성, regions: 권역별 기본 점유율
export const OUTLETS = {
  player: { id: "player", name: "", short: "", color: "#e2452f", hq: "410", city: "서울" },
  meridian: {
    id: "meridian", name: "메리디언 미디어 그룹", short: "메리디언", color: "#8f72ff", hq: "826", city: "런던",
    desc: "런던에 본사를 둔 세계 최대 미디어 그룹. 품위 있는 논조, 막강한 유통망. 보도가 곧 '정설'이 된다는 평.",
    cred: 78, speed: 0.75, depth: 0.7, tone: 0.25, style: "analytic",
    cats: { pol: 1.2, eco: 1.3, int: 1.4, med: 1.1, soc: 0.8, sci: 1, cul: 0.8 },
    regions: { EUR: 0.13, NAM: 0.07, MEA: 0.06, AFR: 0.05, SAS: 0.05, OCE: 0.09, EAS: 0.03, SEA: 0.04, LAT: 0.03, CAS: 0.04 },
  },
  atlas: {
    id: "atlas", name: "애틀러스 와이어", short: "애틀러스", color: "#4f93dc", hq: "840", city: "뉴욕",
    desc: "뉴욕의 통신사. 건조하고 빠르다. 세계 모든 속보의 첫 줄은 대개 여기서 나온다.",
    cred: 74, speed: 0.95, depth: 0.35, tone: 0.1, style: "dry",
    cats: { pol: 1.1, eco: 1.2, int: 1.3, soc: 1, sci: 1, cul: 0.7, med: 0.8 },
    regions: { NAM: 0.1, LAT: 0.05, EUR: 0.05, EAS: 0.04, SEA: 0.04, SAS: 0.04, MEA: 0.04, AFR: 0.04, OCE: 0.06, CAS: 0.03 },
  },
  hanseong: {
    id: "hanseong", name: "한성일보", short: "한성일보", color: "#7f93b0", hq: "410", city: "서울",
    desc: "창간 90년의 국내 유력 일간지. 당신이 석 달 전까지 다니던 회사.",
    cred: 62, speed: 0.7, depth: 0.5, tone: 0.35, style: "analytic",
    cats: { pol: 1.4, eco: 1.2, soc: 1.2, med: 0.6, sci: 0.9, cul: 1, int: 0.7 },
    regions: { EAS: 0.004 }, countries: { "410": 0.21 },
  },
  pangea: {
    id: "pangea", name: "판게아 24", short: "판게아24", color: "#e58f3d", hq: "702", city: "싱가포르",
    desc: "싱가포르의 24시간 뉴스 채널. 아시아 전역에 지국을 둔 신흥 강자.",
    cred: 66, speed: 0.85, depth: 0.45, tone: 0.3, style: "dry",
    cats: { eco: 1.3, int: 1.2, sci: 1.2, pol: 1, soc: 1, cul: 0.9, med: 0.7 },
    regions: { SEA: 0.12, SAS: 0.07, EAS: 0.04, OCE: 0.04, MEA: 0.03 },
  },
  signal: {
    id: "signal", name: "르 시냘", short: "르 시냘", color: "#3fbba8", hq: "250", city: "파리",
    desc: "파리의 탐사보도 전문지. 느리지만 깊다. 신뢰도는 업계 최고.",
    cred: 86, speed: 0.4, depth: 0.95, tone: 0.05, style: "analytic",
    cats: { pol: 1.2, soc: 1.2, med: 1.4, int: 1.1, eco: 1, sci: 0.9, cul: 1 },
    regions: { EUR: 0.07, AFR: 0.04, MEA: 0.03, LAT: 0.02, NAM: 0.02 },
  },
  buzzline: {
    id: "buzzline", name: "버즈라인", short: "버즈라인", color: "#ea5fa2", hq: "840", city: "로스앤젤레스",
    desc: "로스앤젤레스의 바이럴 매체. 제목이 본문보다 길다. 조회수는 늘 1위.",
    cred: 31, speed: 0.9, depth: 0.15, tone: 0.95, style: "tabloid",
    cats: { cul: 1.6, sci: 1.2, soc: 1.2, pol: 0.9, eco: 0.6, int: 0.6, med: 1 },
    regions: { NAM: 0.09, EUR: 0.04, LAT: 0.05, OCE: 0.06, SEA: 0.04, EAS: 0.02, SAS: 0.03, AFR: 0.02, MEA: 0.02 },
  },
  kyokuto: {
    id: "kyokuto", name: "쿄쿠토 경제신문", short: "쿄쿠토", color: "#bfa640", hq: "392", city: "도쿄",
    desc: "도쿄의 경제 전문지. 숫자에 강하고 기업 내부 사정에 밝다.",
    cred: 72, speed: 0.6, depth: 0.7, tone: 0.1, style: "analytic",
    cats: { eco: 1.7, sci: 1.2, int: 1, pol: 0.8, soc: 0.6, cul: 0.6, med: 0.6 },
    regions: { EAS: 0.03, SEA: 0.03 }, countries: { "392": 0.19 },
  },
  nueva: {
    id: "nueva", name: "누에바 오라", short: "누에바 오라", color: "#62bd5c", hq: "076", city: "상파울루",
    desc: "상파울루에 본사를 둔 중남미 최대 뉴스 네트워크.",
    cred: 60, speed: 0.7, depth: 0.5, tone: 0.5, style: "tabloid",
    cats: { pol: 1.3, soc: 1.3, cul: 1.2, eco: 1, int: 0.8, sci: 0.7, med: 0.9 },
    regions: { LAT: 0.13, NAM: 0.02, EUR: 0.01 },
  },
  savanna: {
    id: "savanna", name: "사바나 트리뷴", short: "사바나", color: "#c9824c", hq: "404", city: "나이로비",
    desc: "나이로비의 범아프리카 일간지. 현장에 가장 가까운 매체.",
    cred: 68, speed: 0.6, depth: 0.6, tone: 0.2, style: "dry",
    cats: { pol: 1.2, soc: 1.3, eco: 1, int: 1.1, sci: 0.8, cul: 1, med: 1 },
    regions: { AFR: 0.11, MEA: 0.02 },
  },
};
export const RIVAL_IDS = Object.keys(OUTLETS).filter((k) => k !== "player");
