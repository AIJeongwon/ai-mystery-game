// 제1장의 문장들 — 열두 해 전 메리디언이 찍은 문장과 그 환원 수수께끼
export const MORO_SENTENCE = "모로 보고서는 국제 조사위원회의 검증 결과 조작으로 판명됐다.";
export const MORO_CANON = {
  id: "cn_moro", by: "meridian", ancient: true, silent: true, known: false, scope: "world", mag: 5, country: "826",
  text: MORO_SENTENCE,
  belief: "2019년에 나온 '모로 보고서'(오르비스 그룹의 정수 첨가제 클라로가 신장을 손상시킨다는 보고서)는 국제 조사위원회의 검증 결과 조작으로 판명됐다. 작성자 이사벨 모로는 학계에서 퇴출됐고, 이를 단독 보도한 한국의 세계시보는 오보의 책임을 지고 폐간했다. 그 뒤로 '모로 같은 소리'는 조작된 자료를 뜻하는 관용구가 됐다.",
  origin: { outlet: "meridian", whenText: "2019년 3월 17일" },
  effects: [
    { kind: "actor", id: "ch_orbis", attr: "rep", sign: 1, mag: 5, name: "오르비스 그룹" },
    { kind: "outlet", id: "meridian", attr: "cred", sign: 1, mag: 3, name: "메리디언 미디어 그룹" },
  ],
  puzzle: {
    label: "열두 해 전, 누군가 찍은 문장 — 「모로 보고서」에 관한 것",
    cost: 20, final: true,
    sentences: [
      { id: "s1", text: MORO_SENTENCE, need: ["e19"] },
      { id: "s2", text: "모로 보고서는 한 편의 사기극이었다.", need: ["e17"] },
      { id: "s3", text: "모로 보고서는 조작된 것으로 드러났다.", need: [] },
    ],
    stampers: [
      { id: "crane", name: "에드먼드 크레인 (당시 메리디언 발행인, 승인란의 E.C.)", need: ["e19"] },
      { id: "lang", name: "빅토리아 랭 (당시 메리디언 수습 교열기자)", need: ["e20"] },
      { id: "mun", name: "문정호 (당시 세계시보 교열부장, 3번 도장의 주인)", need: [] },
      { id: "helvig", name: "라스 헬빅 (오르비스 그룹 CEO)", need: ["e15"] },
    ],
    answer: { sentence: "s1", stamper: "lang" },
    wrong: {
      sentence: "인주가 번졌다. 문장이 정확하지 않다 — 찍힌 문장은 토씨 하나까지 그대로 옮겨야 한다.",
      stamper: "인주가 번졌다. 문장은 맞지만 이름이 틀렸다 — 승인한 사람과 '찍은' 사람은 다를 수 있다.",
    },
  },
};

// 환원 기사를 판정할 때 근거로 인정되는, 앞 단계에서 확인한 사실들
export const FINAL_FACTS = [
  "모로 보고서는 조작되지 않았다. '조작으로 판명됐다'는 문장은 사실이 아니다.",
  "모로 보고서를 검증했다는 국제 조사위원회는 한 번도 열리지 않았고, 최종보고서는 존재하지 않는다.",
  "국제보건환경기구의 보도자료는 2019년 3월 17일까지 보고서를 '검토 중'이라 썼고 18일부터 '조작으로 판명된'이라고 썼다.",
  "이사벨 모로의 원본 실험 노트 14권에는 고쳐 쓴 흔적이 없다.",
  "나이로비에서 2018년에 봉인된 시료의 독립 분석 결과는 모로 보고서의 수치와 일치한다.",
  "나이로비 카왕과레 진료소의 만성 신장 질환 환자는 6년 새 네 배가 됐다.",
  "오르비스 그룹의 최대주주는 메리디언 회장 에드먼드 크레인의 가문 신탁이다.",
  "2019년 3월 17일 밤 교정쇄의 그 문장에 도장을 찍은 사람은 당시 수습 교열기자 빅토리아 랭이다.",
];

// 메리디언이 플레이어의 매체를 향해 찍는 문장 (비트 5)
export const SLANDER = (outlet) => `「${outlet}」은 오보를 상습적으로 내는 매체다.`;
