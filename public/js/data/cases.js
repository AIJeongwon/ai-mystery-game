// 국가 지도와 거기에 꽂히는 사건 — 지도에서는 개요만 보인다. 자세한 것은 현장(3D)의 사건 자료(data/sites/)에 있다.
// 새 사건은 CASE_PINS에 한 줄을 더한다. 그 나라에 시·도 지도가 있어야 한다(NATION_MAPS).
//
//   id        사건의 이름. data/sites의 사건 id와 같다 (/site.html?case=<id>)
//   country   세계지도의 나라 번호      region  시·도의 번호(assets/geo/admin1-<나라>.json)      at  [경도, 위도]
//   eyebrow   제목 위의 작은 글씨       title   사건의 제목
//   where     곳 (지도에서 보이는 만큼만)       when  때       travel  가는 데 걸리는 시간
//   outline   개요. 누구나 아는 것만 적는다. 현장에서 알아낼 것은 적지 않는다
//   first     현장에 처음 들어설 곳과 시각. 사건 자료와 같아야 한다 (tests/nation.test.mjs가 본다)
//
// 실제 지명만 쓴다. 사람, 학교, 학원, 기관, 매체의 이름은 모두 지어낸 것이다.

// 시·도 지도가 있는 나라. 경계 자료는 tools/build-admin1.mjs가 만든다(assets/geo/admin1-<나라 번호>.json).
//   fit   처음에 화면에 채울 범위 [[서, 남], [동, 북]]. 멀리 떨어진 섬 때문에 본토가 작아지지 않게 한다
//   grat  경위선 간격(도)
export const NATION_MAPS = {
  "410": { fit: [[124.9, 33.0], [130.1, 38.75]], grat: 1 },
  "392": { fit: [[127.4, 25.9], [146.0, 45.7]], grat: 2 },
};
export const hasNationMap = (id) => Boolean(NATION_MAPS[id]);

// 기자가 사는 곳 — 국가 지도에 '현재 위치'로 찍힌다.
export const HOME_BASE = { country: "410", region: "KR-11", at: [126.905, 37.556], label: "망원동 옥탑방" };

export const CASE_PINS = [
  {
    id: "prologue", country: "410", region: "KR-11", at: [126.875, 37.527],
    eyebrow: "프롤로그", title: "「시험 전」",
    where: "서울", when: "수능 다음 날, 금요일 아침",
    travel: "서울 안이다. 가는 데 시간이 들지 않는다.",
    outline: [
      "목요일, 대학수학능력시험이 전국에서 치러졌다.",
      "당국은 시험이 시작되기 전에 부정행위를 모두 잡아냈다고 발표했다.",
      "그날 밤, 수험생 커뮤니티가 시끄러워졌다.",
    ],
    first: { place: "서울 마포구 · 망원동 옥탑방", clock: "금요일 오전 8시" },
  },
];

export const casesIn = (country) => CASE_PINS.filter((c) => c.country === country);
export const caseCounts = () => CASE_PINS.reduce((m, c) => ((m[c.country] = (m[c.country] || 0) + 1), m), {});
