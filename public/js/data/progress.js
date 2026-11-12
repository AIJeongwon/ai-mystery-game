// 기정사실 — 성장 체계: 매체 등급, 설비, 기자 역량, 도장(記定) 각인

// ── 매체 등급 ──
export const TIERS = [
  { lv: 1, name: "1인 미디어", need: {}, staff: 0, bureaus: 0, reach: 1, desc: "옥탑방의 노트북 한 대." },
  { lv: 2, name: "인터넷 신문", need: { subs: 400, cred: 42 }, staff: 2, bureaus: 1, reach: 1.25, cost: 2_000_000, desc: "정식 등록 매체. 기자를 고용할 수 있다." },
  { lv: 3, name: "종합 일간지", need: { subs: 5000, cred: 52, bureaus: 1 }, staff: 5, bureaus: 3, reach: 1.6, cost: 30_000_000, desc: "편집국과 해외 지국을 갖춘 신문사." },
  { lv: 4, name: "미디어 그룹", need: { subs: 60000, cred: 62, bureaus: 3 }, staff: 9, bureaus: 6, reach: 2.1, cost: 300_000_000, desc: "방송과 플랫폼을 거느린 그룹." },
  { lv: 5, name: "글로벌 미디어", need: { subs: 600000, cred: 72, bureaus: 6 }, staff: 14, bureaus: 12, reach: 2.8, cost: 2_500_000_000, desc: "세계가 읽는 이름." },
];

// ── 설비·조직 투자 ── (lv별 비용 배열)
export const UPGRADES = {
  site: {
    name: "웹사이트·앱", icon: "site", max: 4, cost: [1_500_000, 12_000_000, 90_000_000, 600_000_000],
    desc: "광고 단가와 구독 전환율이 오른다.", eff: (lv) => `광고 단가 +${lv * 20}% · 구독 전환 +${lv * 15}%`,
  },
  gear: {
    name: "취재 장비", icon: "gear", max: 3, cost: [1_000_000, 8_000_000, 50_000_000],
    desc: "자료 조사와 현장 취재가 빨라지고 깊어진다.", eff: (lv) => `취재 시간 -${lv * 12}% · 심층 단서 확률 +${lv * 8}%`,
  },
  factcheck: {
    name: "팩트체크 데스크", icon: "check", max: 2, cost: [3_000_000, 40_000_000],
    desc: "발행 전 교열 검토를 받을 수 있다. 오보 위험을 미리 경고한다.", eff: (lv) => (lv >= 2 ? "교열 검토 + 오보 피해 -50%" : "발행 전 교열 검토 가능"),
  },
  legal: {
    name: "법무팀", icon: "law", max: 3, cost: [4_000_000, 35_000_000, 250_000_000],
    desc: "정정·소송 비용과 신뢰도 타격을 줄인다.", eff: (lv) => `소송 비용 -${lv * 25}%`,
  },
  marketing: {
    name: "마케팅", icon: "mega", max: 4, cost: [2_000_000, 15_000_000, 100_000_000, 700_000_000],
    desc: "기사의 확산력과 신규 독자 유입이 늘어난다.", eff: (lv) => `확산 +${lv * 15}%`,
  },
  desk: {
    name: "편집 데스크", icon: "pen", max: 2, cost: [5_000_000, 60_000_000],
    desc: "수집한 사실로 초안을 잡아 주는 데스크 보조. 초안은 반드시 직접 고쳐 써야 한다.", eff: (lv) => (lv >= 2 ? "초안 보조 + 제목 제안" : "초안 보조 가능"),
  },
};

// ── 기자(플레이어) 역량 ──
export const SKILLS = {
  research: { name: "취재력", max: 5, desc: "자료 조사에서 더 깊은 사실을 건진다.", eff: (lv) => `심층 단서 확률 +${lv * 7}%` },
  network: { name: "인맥", max: 5, desc: "소문 단계의 사건을 더 일찍, 더 멀리서 포착한다. 취재원의 첫 신뢰가 오른다.", eff: (lv) => `소문 포착 +${lv * 12}% · 초기 신뢰 +${lv * 4}` },
  mobility: { name: "기동력", max: 5, desc: "이동 시간과 출장비가 줄어든다.", eff: (lv) => `이동 시간·비용 -${lv * 10}%` },
  sense: { name: "감식안", max: 5, desc: "찍힌 문장의 흔적(잔향)을 알아본다. 제1장 이후 쓸모가 생긴다.", eff: (lv) => `잔향 감지 범위 +${lv * 20}%` },
};
export const XP_PER_LEVEL = (lv) => Math.round(60 * Math.pow(lv, 1.45));

// ── 도장 각인 ── 인주(印朱)로 강화한다.
export const SCOPES = [
  { key: "local", ko: "한 사건", mult: 1 },
  { key: "country", ko: "한 나라", mult: 2.5 },
  { key: "region", ko: "한 권역", mult: 6 },
  { key: "world", ko: "온 세계", mult: 14 },
];
export const STAMP = {
  scope: { name: "범위", max: 4, cost: [0, 30, 110, 320], desc: "문장이 닿는 범위.", eff: (lv) => SCOPES[lv - 1].ko },
  power: { name: "강도", max: 5, cost: [0, 20, 60, 150, 360], desc: "문장이 세계를 움직이는 세기.", eff: (lv) => `세기 ${lv}단까지` },
  hold: { name: "지속", max: 4, cost: [0, 25, 90, 280], desc: "문장이 상식으로 남는 기간.", eff: (lv) => ["이틀", "이레", "한 달", "영구"][lv - 1] },
  slots: { name: "동시 유지", max: 4, cost: [0, 35, 120, 300], desc: "동시에 유지할 수 있는 기정문의 수.", eff: (lv) => `${[1, 2, 3, 5][lv - 1]}문장` },
  veil: { name: "은폐", max: 4, cost: [0, 30, 100, 260], desc: "세계에 남는 왜곡의 흔적을 줄인다.", eff: (lv) => `왜곡 -${(lv - 1) * 20}%` },
};
export const HOLD_MIN = [2 * 1440, 7 * 1440, 30 * 1440, null];
export const SLOT_COUNT = [1, 2, 3, 5];
export const INK_CAP = (canonLv) => 30 + (canonLv.scope + canonLv.power + canonLv.hold + canonLv.slots + canonLv.veil - 5) * 12;

// 기정문 1회 비용
export function decreeCost(scopeIdx, magnitude) {
  return Math.round(4 * SCOPES[scopeIdx].mult * Math.pow(magnitude, 1.25));
}
export function decreeDistortion(scopeIdx, magnitude, veilLv) {
  return SCOPES[scopeIdx].mult * magnitude * 1.6 * (1 - (veilLv - 1) * 0.2);
}

// ── 직원 ──
export const STAFF_ROLES = {
  reporter: { name: "취재기자", desc: "담당 지역의 사건을 자동으로 취재해 단신을 낸다. 당신의 취재도 돕는다." },
};
export const BEATS = { pol: "정치", eco: "경제", soc: "사회", sci: "IT·과학", int: "국제", cul: "생활·문화", med: "언론" };

// ── 경제 상수 ──
export const ECON = {
  startCash: 3_000_000,
  startSubs: 12,
  startCred: 38,
  cpm: 4200, // 1000뷰당 광고 수익(원)
  platformRate: 0.9, // 뷰당 플랫폼 정산(원)
  subFeeDaily: 210, // 구독자 1명당 하루 수익(원)
  rentDaily: [30_000, 120_000, 900_000, 6_000_000, 30_000_000], // 등급별 운영비
  bureauCost: (gdp, n) => Math.round((8_000_000 + gdp * 4_000_000) * Math.pow(1.5, n)),
  bureauDaily: (gdp) => 80_000 + gdp * 50_000,
  hireCost: (skill) => Math.round(600_000 + skill * 2_400_000),
  salaryDaily: (skill) => Math.round(60_000 + skill * 140_000),
  travelCost: (km) => Math.round(120_000 + km * 150),
  travelMin: (km) => Math.round(150 + (km / 820) * 60),
};
