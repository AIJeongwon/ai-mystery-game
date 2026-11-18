// 목원고 12시험실 — 제1장 「오답 하나」의 교실 조사 (docs/roadmap/campaign-3d-design.md 9절)
// 자리는 glb 안의 이름에서 읽는다(tools/3d/room12_layout.py). 여기에는 내용과 규칙만 적는다.
// 시각은 분 단위, 0 = 금요일(D+1) 0시.

const FRI = 0, SAT = 1440, THU = -1440, WED = -2880; // 목요일이 수능 날(D), 수요일이 예비소집 날(D-1)

export const MOKWON_ROOM12 = {
  id: "mokwon_room12",
  title: "목원고 12시험실",
  place: "서울 양천구 · 목원고 3층",
  model: "/assets/3d/sites/mokwon_room12.glb",
  blockout: "/assets/3d/sites/mokwon_room12_blockout.glb",
  // 금요일 16시 50분, 해가 창으로 낮게 든다. 조사에 시간을 쓰는 동안 해가 지고(17시 24분), 교실에는 형광등 빛만 남는다.
  start: {
    minute: FRI + 16 * 60 + 50, spawn: "spawn_room12", items: ["phone", "pen", "glasses"],
    // 프롤로그에서 이어받은 것. 추리 ①과 ③은 풀었고(배수정이 문을 열어 준 까닭), 기사의 틈(②)은 아직 짚지 못했다.
    evidence: ["P2", "P1", "P4", "P5", "P7", "P8", "I1", "I4"],
    links: { I1: { a: "P4", b: "P5", rel: "contra" }, I4: { a: "P8", b: "P2", rel: "contra" } },
    board: { P2: [44, 34], P1: [262, 50], P8: [70, 252], I4: [262, 236], P4: [520, 40], P5: [504, 252], I1: [760, 120], P7: [776, 288] },
  },
  sketch: ["시험이 끝난 교실. 책상마다 수험번호 스티커가 아직 붙어 있다.", "배수정 선생이 문을 열어 주고 교탁 옆에 선다. \"스물네 명이 여기서 봤어요.\""],
  // 해의 방향·색·세기는 tools/3d/bake_room12.py의 SUN_*과 같아야 한다 (three.js 좌표: x, 위, -y).
  light: { sun: { dir: [-0.35, 0.18, 1], color: 0xffa861, intensity: 4.0 }, sunset: 17.4, sky: 0xcfd9e6, ground: 0x6b6257, ambient: 0.4, exposure: 0.82, lamp: 1.7, skyBg: 0xd9b48c },
  // 구운 조명 (사실화 공간에서만 쓴다). range는 bake_room12.py의 RANGE와 같아야 한다.
  lightmap: {
    meshes: ["static", "tile24"], exposure: 1.0, nightGain: 0.35,
    maps: {
      lamp: { url: "/assets/3d/sites/mokwon_room12_lm_lamp.jpg", range: 0.8 },
      sky: { url: "/assets/3d/sites/mokwon_room12_lm_sky.jpg", range: 0.8 },
      sun: { url: "/assets/3d/sites/mokwon_room12_lm_sun.jpg", range: 0.45 },
    },
  },

  // 수첩의 '장소' 쪽에 손으로 적는 이름 (three.js 좌표: x는 칠판 → 뒷벽, z는 복도 → 창)
  map: { labels: [{ text: "칠판", x: -4.5, z: 0, turn: -90, side: "out" }, { text: "창", x: 0, z: 3.6, side: "below" }, { text: "복도", x: 0, z: -3.6, side: "above" }, { text: "뒷벽", x: 4.5, z: 0, turn: 90, side: "out" }] },

  // 처음에 숨겨 둘 노드 (상태가 보이게 한다)
  nodes: { ladder_folded: false, ladder_open: false, col_ladder_open: false },

  questions: [
    { id: "q_seat", text: "24번 자리에는 무엇이 남아 있나", cards: ["C1", "C2", "C3", "C4"], when: null,
      hints: ["책상 위만 보지 않는다. 상판 밑과, 책상 줄 사이의 바닥도 본다."] },
    { id: "q_link", text: "가루와 사다리 자국은 무슨 사이인가", sub: "증거판(B)에서 두 장을 잇는다", board: true, cards: ["I5"], when: { evidence: ["C1", "C2"] },
      hints: ["둘은 어긋나지 않는다. 같은 쪽을 가리킨다.", "석고 가루와 사다리 자국을 '같다'로 잇는다."] },
    { id: "q_above", text: "24번 자리 위에는 무엇이 있나", cards: ["C5"], when: { flags: ["look_up"] },
      hints: ["눈에 보이지 않는 빛도 카메라에는 보인다. F를 누르고 24번 위 천장을 화면 가운데에 붙든다."] },
    { id: "q_reach", text: "저 구멍까지 어떻게 올라가나", cards: ["C6"], when: { flags: ["ceiling_found"] },
      hints: ["뒷문 옆의 사다리를 들어, 바닥의 자국 위에 세운다."] },
    { id: "q_who", text: "누가, 언제 이것을 올렸나", cards: ["C7", "C8", "C9", "C10"], when: { flags: ["tile_open"] },
      hints: ["묶여 있는 것을 먼저 알아본다. 그다음에 묶은 방식, 작은 화면, 배관의 스티커."] },
    { id: "q_card", text: "메모리 카드를 어떻게 할 것인가", cards: [], when: { evidence: ["C7"] } },
    { id: "q_night", text: "그날 밤을 한 문장으로 맞춘다", sub: "증거판(B)의 원고지에 카드를 끼운다", board: true, cards: ["I5", "I12", "C9"],
      when: { any: [{ flags: ["card_reported"] }, { flags: ["card_pulled"] }, { flags: ["tile_open", "device_gone"] }] },
      hints: ["봉인한 시각과 점검표의 시각은 앞뒤 사이다. 배수정에게 전날 밤 누가 들어올 수 있었는지 묻는다.", "'누가' 칸에는 카드가 아니라 쪽지가 들어간다. 봉인 진술에서 점검표로 '앞뒤'를 긋는다."] },
    { id: "q_next", text: "점검표와 케이블 타이의 주인을 찾는다: 행정실과 시설관리실로", cards: [], when: { flags: ["deduced_night"] } },
  ],

  // 토요일 새벽 5시, 오기철이 장치를 거둬 간다. 그 전에 텍스를 열었으면 일어나지 않는다.
  deadlines: [
    { id: "retrieval", at: SAT + 5 * 60, unless: { flags: ["tile_open"] }, effect: { flags: ["device_gone"] }, warn: "토요일 새벽 5시 · 화재감지기 재점검(용역)" },
  ],

  evidence: {
    // ── 프롤로그에서 이어받은 것 (carried) ──
    P1: {
      title: "일간 세한의 기사", kind: "기사", carried: true, at: THU + 19 * 60, source: "일간 세한 · 목요일 19시",
      head: "이번 수능 철저한 감독 이행 끝에 시험 전 AI부정행위 전부 검거.",
      body: ["올해 대학수학능력시험이 오늘 전국 시험장에서 치러졌다.", "국가시험관리원은 철저한 감독 끝에 입실 검색에서 금속탐지기와 육안 검사로 전자기기를 지닌 수험생 7명을 모두 적발했다고 밝혔다.", "올해 처음으로 전파 차단기와 시험실 녹화를 시범 운영했다."],
      text: "「이번 수능 철저한 감독 이행 끝에 시험 전 AI부정행위 전부 검거.」",
    },
    P2: {
      title: "국가시험관리원 보도자료", kind: "문서", carried: true, at: THU + 18 * 60, source: "국가시험관리원 · 목요일 18시",
      head: "대학수학능력시험 시행 결과",
      body: ["올해 대학수학능력시험이 오늘 전국 시험장에서 치러졌다.", "입실 검색에서 금속탐지기와 육안 검사로 전자기기를 지닌 수험생 7명을 적발했다.", "시험 중 부정행위 여부는 감독 보고서를 모아 확인할 예정이다.", "올해 처음으로 전파 차단기와 시험실 녹화를 시범 운영했다."],
      text: "입실 검색에서 7명 적발. 전파 차단기와 시험실 녹화를 시범 운영했다.",
    },
    P4: { title: "커뮤니티의 의혹 글", kind: "글", carried: true, at: THU + 22 * 60 + 20, source: "수험생 커뮤니티 · 목요일 밤", refutedBy: "I1", text: "\"작년 5·6·5·4·5가 한 해 만에 전 과목 1등급? 그 뿔테, 스마트 안경이다.\"" },
    P5: { title: "배수정의 진술: 안경", kind: "진술", who: "배수정", carried: true, text: "\"그 학생 안경은 제가 직접 검사했어요. 회로는 없었어요. 플라스틱뿐이었어요.\"" },
    P7: { title: "뿔테 안경", kind: "물건", carried: true, text: "도현이 버린 무광 뿔테. 회로는 없다. 왼쪽 알만 반사색이 다르다." },
    P8: { title: "개조된 사인펜", kind: "물건", carried: true, text: "뒤 끝에 바늘구멍, 라벨의 검은 네모는 화면, 뚜껑 쪽에 작은 창. 왼쪽 알 너머로만 글자가 보인다." },
    I1: { title: "안경은 미끼", kind: "추론", carried: true, text: "사람들은 안경을 의심했지만, 그 안경은 감독관이 직접 검사해 통과시켰다. 눈길을 끌려고 쓴 것이다." },
    I4: { title: "빛이 닿는 곳", kind: "추론", carried: true, text: "전파는 막혀 있었는데 펜은 답을 받았다. 왼쪽 알 너머로만 보이는 것은 빛이다. 두뇌는 빛이 닿는 곳, 시험실 안에 있다." },
    // ── 12시험실에서 잇는 쪽지 ──
    I2: { title: "'시험 전'의 틈", kind: "추론", text: "기사는 '시험 전'만 말했다. 보도자료의 「시험 중 부정행위 여부는 확인할 예정」은 지워졌고, 그 뒤로 아무도 확인하지 않았다." },
    I5: { title: "위에서 내려온 것", kind: "추론", text: "가루는 위에서 떨어졌고, 사다리는 위로 오르는 물건이다. 둘 다 24번 자리의 위를 가리킨다." },
    I6: { title: "옮겨진 자리", kind: "추론", text: "24번 책상은 예비소집 뒤에 창 쪽으로 한 칸 옮겨졌다. 누군가 이 자리를 무엇의 바로 아래에 맞췄다." },
    I7: { title: "먼저 와 있던 펜", kind: "추론", text: "상판 밑의 자국은 이 펜의 길이다. 펜은 도현과 함께 들어오지 않았다. 검색대를 지난 것은 빈손이었다." },
    I12: { title: "봉인 뒤의 손", kind: "추론", text: "시험실은 전날 18시에 봉인됐다. 점검표의 시각은 그 뒤다. 들어올 수 있던 것은 당직과 시설 쪽뿐이고, 서명은 '오'다." },
    I13: { title: "귀도 있었다", kind: "추론", text: "카메라는 소리를 듣지 못한다. 천장 속의 마이크가 방송 스피커를 향해 있었다. 듣기는 그것이 들었다." },
    // ── 수첩의 관찰을 판으로 꺼낸 것 ──
    N1: { title: "좌석 배치도", kind: "문서", text: "뒷벽의 시험실 좌석 배치도. 그림 속 24번은 다른 줄과 나란하다." },
    N2: { title: "방송 스피커", kind: "물건", text: "영어 듣기는 이 스피커에서 나왔다. 펜 끝의 카메라로는 소리를 들을 수 없다." },
    C1: { title: "석고 가루", kind: "흔적", text: "24번 책상 한가운데에만 떨어진 하얗고 고운 가루. 위에서 떨어진 건축 자재다." },
    C2: { title: "사다리 자국", kind: "흔적", text: "책상 줄 사이 바닥에 격자무늬 고무 자국 넷. 직사각형으로 대칭이다." },
    C3: { title: "책상의 옛 자국", kind: "흔적", text: "왁스에 눌린 책상 다리 자국. 24번 책상은 원래 여기 있었고, 창 쪽으로 한 칸 옮겨졌다." },
    C4: { title: "상판 밑 테이프 자국", kind: "흔적", text: "24번 책상 상판 밑, 펜 한 자루 길이의 끈적한 자국." },
    C5: { title: "깜빡이는 구멍", kind: "흔적", text: "24번 자리 바로 위 텍스의 구멍 하나가 카메라 화면에서만 보랏빛으로 깜빡인다." },
    C6: { title: "깨진 텍스 모서리", kind: "흔적", text: "그 텍스만 모서리가 깨져 있고, 코팅 장갑의 고무 자국이 묻어 있다." },
    C7: { title: "천장 속 장치", kind: "물건", text: "작은 기판과 보조배터리 둘, 빛 신호 장치, 방송 스피커 쪽을 향한 마이크." },
    C8: { title: "노란 케이블 타이", kind: "물건", text: "장치는 화재감지기 배관에 노란 케이블 타이로 반듯하게 묶여 있다. 익숙한 사람의 솜씨다." },
    C9: { title: "화재감지기 점검표", kind: "문서", at: WED + 21 * 60 + 40, text: "배관의 점검표 스티커. 시험 전날 21시 40분, 서명 '오'." },
    C10: { title: "전원 기록 05:40", kind: "기록", at: THU + 5 * 60 + 40, text: "장치는 시험 날 새벽 5시 40분에 켜졌다." },
    C11: { title: "AI 로그", kind: "기록", noPhoto: true, text: "메모리 카드의 로그: 몇 시 몇 분에 어떤 문제를 읽었고 어떤 답을 내려보냈는지." },
    C17: { title: "배수정의 진술: 옮겨진 자리", kind: "진술", who: "배수정", text: "\"예비소집 날 본 것보다 24번이 창 쪽으로 한 칸 붙어 있었어요.\"" },
    C29: { title: "배수정의 진술: 봉인", kind: "진술", who: "배수정", at: WED + 18 * 60, text: "\"전날 저녁 6시에 시험실을 봉인했어요. 그 뒤로 들어올 수 있는 건 당직과 시설 쪽뿐이에요.\"" },
  },

  // ── 증거판: 카드 둘을 교정 부호로 이으면 추론 쪽지가 생긴다 (site/reason.js) ──
  // rel: contra 맞지 않는다 / same 같다 / time 앞뒤(먼저 → 나중) / source 원문.  alt는 같은 쪽지에 닿는 다른 길.
  links: {
    I1: { from: ["P4", "P5"], rel: "contra", alt: [{ from: ["P4", "P7"], rel: "contra" }] },
    I4: { from: ["P8", "P2"], rel: "contra" },
    // 원문으로 이으면 두 문서가 겹쳐진다. 지워진 구절을 직접 짚어야 쪽지가 된다.
    I2: { from: ["P2", "P1"], rel: "source", compare: { target: "시험 중 부정행위 여부는", prompt: "기사는 보도자료를 어떻게 옮겼나. 가장 무거운 차이 하나를 짚는다.", miss: "꾸밈이 달라졌을 뿐이다. 덧붙인 말보다 사라진 말을 본다." } },
    I5: { from: ["C1", "C2"], rel: "same", close: true },
    I6: { from: ["C3", "C17"], rel: "same", alt: [{ from: ["N1", "C3"], rel: "contra" }] },
    I7: { from: ["C4", "P8"], rel: "same" },
    I12: { from: ["C29", "C9"], rel: "time", alt: [{ from: ["C29", "C10"], rel: "time" }] },
    I13: { from: ["N2", "C7"], rel: "same" },
  },
  // 이어지지 않는 쌍 가운데, 까닭을 따로 적어 둔 것
  misses: [
    { pair: ["C1", "C4"], text: "가루는 상판 위에, 자국은 상판 밑에 있다. 따로 생긴 것이다." },
    { pair: ["C2", "C3"], text: "둘 다 바닥의 자국이지만 무늬가 다르다. 하나는 사다리의 발, 하나는 책상의 다리다." },
    { pair: ["C1", "C5"], text: "가루와 구멍. 가깝다. 하지만 구멍은 무엇이 가루를 떨어뜨렸는지 말해 주지 않는다." },
    { pair: ["C9", "C10"], text: "밤 9시 40분과 새벽 5시 40분. 같은 손일 수는 있어도, 이 두 장만으로는 아직 모른다." },
    { pair: ["P1", "P4"], text: "기사와 의혹 글은 서로를 모른다." },
    { pair: ["C6", "C8"], text: "장갑 자국과 케이블 타이. 같은 사람의 것일 수 있다. 하지만 그것을 말해 줄 장부가 이 방에는 없다." },
  ],

  // ── 빈칸 추리: 문장의 빈칸에 카드를 끼운다. 틀리면 게임 속 30분이 흐른다 ──
  deductions: [
    {
      id: "night", no: "④", title: "그날 밤", when: { flags: ["tile_open"] }, wrongMinutes: 30,
      parts: ["두뇌는 ", { slot: "where" }, " 위 천장에 있었다. 봉인된 방에 ", { slot: "who" }, " 들어와 ", { slot: "up" }, "에 그것을 올리고, ", { slot: "on" }, "에 켰다."],
      // 장치를 놓쳤으면 켠 시각은 이 방에서 알 수 없다
      variants: [{ when: { flags: ["device_gone"] }, parts: ["두뇌는 ", { slot: "where" }, " 위 천장에 있었다. 봉인된 방에 ", { slot: "who" }, " 들어와 ", { slot: "up" }, "에 그것을 올렸다. 켠 시각은 아직 모른다."] }],
      slots: {
        where: { label: "어디", accept: { I5: "24번 자리" }, near: { I6: "자리가 옮겨진 것은 맞다. 하지만 '위'를 가리킨 것은 다른 쪽지다.", C5: "구멍은 올려다본 뒤에 찾은 것이다. 왜 위를 보게 됐는지를 넣는다.", C7: "장치는 거기서 나온 것이다. 그 자리를 가리킨 쪽지를 넣는다." }, miss: "이것으로는 '어디 위'인지 알 수 없다." },
        who: { label: "누가", accept: { I12: "시설 쪽의 '오'가" }, near: { C9: "서명 한 글자만으로는 좁혀지지 않는다. 봉인과 이어야 한다.", C29: "봉인은 '누가 들어올 수 있었나'까지만 말한다. 점검표와 이어야 한다.", C8: "묶은 솜씨는 익숙한 사람이라는 것까지만 말한다." }, miss: "이것은 사람을 가리키지 않는다." },
        up: { label: "언제 올렸나", accept: { C9: "시험 전날 밤 9시 40분" }, near: { C10: "그것은 켠 시각이다.", C29: "그것은 문을 잠근 시각이다." }, miss: "여기에는 시각이 적힌 카드가 들어간다." },
        on: { label: "언제 켰나", accept: { C10: "시험 날 새벽 5시 40분" }, near: { C9: "그것은 올린 시각이다." }, miss: "여기에는 시각이 적힌 카드가 들어간다." },
      },
      effect: { flags: ["deduced_night"] },
    },
  ],

  // ── 시간 띠: 시각이 있는 카드를 올리면 제자리를 찾는다. 시험 시간표가 기본으로 깔려 있다 ──
  timeline: {
    from: WED + 16 * 60, to: SAT + 7 * 60,
    blocks: [
      { from: THU + 8 * 60 + 10, to: THU + 8 * 60 + 40, label: "입실", thin: true },
      { from: THU + 8 * 60 + 40, to: THU + 10 * 60, label: "1교시 국어" },
      { from: THU + 10 * 60 + 30, to: THU + 12 * 60 + 10, label: "2교시 수학" },
      { from: THU + 13 * 60 + 10, to: THU + 14 * 60 + 20, label: "3교시 영어" },
      { from: THU + 14 * 60 + 50, to: THU + 16 * 60 + 37, label: "4교시 탐구" },
    ],
    // 봉인 진술을 올리면 잠긴 시간이 띠 위에 그어진다
    bands: [{ id: "seal", card: "C29", from: WED + 18 * 60, to: THU + 8 * 60 + 10, label: "봉인", note: "문은 잠겨 있었다. 그 안에서 무언가가 올라가고, 켜졌다." }],
    marks: [{ at: SAT + 5 * 60, label: "재점검 예정", when: { notFlags: ["deadline_retrieval"] } }],
  },

  // ── 수첩의 인물 쪽 ──
  people: [
    { id: "bae", npc: "bae", where: "금요일 15~17시에는 교무실. 지금은 12시험실에 함께 있다.", lines: ["도현의 안경을 직접 검사해 통과시켰다. 그 일이 마음에 걸려 있다.", { text: "천장에서 나온 것을 보고 자신을 탓했다.", when: { evidence: ["C7"] } }] },
    { id: "dohyeon", name: "한도현", role: "재수생 · 12시험실 24번", where: "목동. 아직 만나지 못했다.", lines: ["작년 5·6·5·4·5. 올해 가채점은 전 과목 1등급, 수학 하나를 틀렸다.", "수능 다음 날 새벽에 필통을 버렸다. 안에 뿔테와 펜이 있었다.", { text: "24번 자리는 그가 앉기 전에 한 칸 옮겨져 있었다.", when: { evidence: ["I6"] } }] },
    { id: "oh", name: "'오'", role: "점검표에 남은 서명", unknown: true, when: { evidence: ["C9"] }, where: "누구인지 모른다.", lines: ["화재감지기 점검표의 마지막 줄. 밤 9시 40분에 서명했다. 앞의 두 줄은 낮이고 서명은 '김'이다.", { text: "봉인 뒤에 들어올 수 있던 것은 당직과 시설 쪽뿐이다.", when: { evidence: ["I12"] } }, { text: "토요일 새벽 5시에도 다녀갔다.", when: { flags: ["device_gone", "tile_open"] } }] },
  ],
  // ── 수첩의 법칙 쪽: 도장을 찍어 봐야 배운다. 이 방에서는 찍을 일이 없다 ──
  laws: { note: "찍기 전에는 세 번 읽어라", known: [] },
  choiceNotes: { card: { report: "메모리 카드에는 손대지 않았다. 사진을 찍고 윤태경에게 신고했다. 로그는 하루 뒤에 온다.", pull: "메모리 카드를 직접 뽑았다. 이제 '기자가 손댄 증거'다." } },

  items: {
    phone: { title: "휴대폰 카메라", key: "F", tool: "phone", hint: "화면 속에서는 눈에 보이지 않는 빛이 보인다" },
    pen: { title: "개조된 사인펜", key: "G", tool: "pen", inspect: "pen", evidence: "P8", hint: "뚜껑 쪽을 위로 향하면 신호를 찾는다" },
    glasses: { title: "뿔테 안경", inspect: "glasses", evidence: "P7" },
  },

  // 조건이 맞는 순간 한 번 일어나는 일
  triggers: [
    {
      id: "look_up", when: { evidence: ["I5"] },
      lookAt: "spot_ceiling24", hold: 2.6,
      caption: ["가루는 위에서 떨어졌다. 사다리는 위로 오르는 물건이다.", "시선이 저절로 올라간다. 똑같은 텍스 수십 장."],
      effect: { flags: ["look_up"] },
    },
  ],

  spots: [
    {
      id: "desk23", node: "spot_desk23_top", kind: "trace", label: "23번 책상", minutes: 3,
      text: ["23번 책상. 지우개 가루와 샤프심 부스러기.", "다른 책상도 다 이렇다."],
      gives: { flags: ["saw_other_desk"] }, note: "23번 책상에는 지우개 가루와 샤프심뿐. 다른 책상도 다 그렇다.",
    },
    {
      id: "desk24", node: "spot_desk24_top", kind: "trace", label: "24번 책상", minutes: 5,
      text: ["24번 책상 한가운데. 지우개 가루가 아니다.", "손끝에 묻어나는 하얗고 고운 가루. 분필? 칠판은 교실 반대편 끝이다.", "위에서, 수직으로 떨어진 것이다."],
      gives: { evidence: ["C1"] }, bark: "bark_dust",
    },
    {
      id: "desk24_under", node: "spot_desk24_under", kind: "trace", label: "상판 밑", verb: "들여다본다", minutes: 5, view: { crouch: 0.5, dist: 0.75 },
      text: ["몸을 숙여 상판 밑을 본다.", "손이 닿는 자리에 끈적한 자국. 테이프를 붙였다 뗀 자리다.", "길이는 딱 펜 한 자루."],
      gives: { evidence: ["C4"] },
    },
    {
      id: "floor_ladder", node: "spot_floor_ladder", kind: "trace", label: "바닥의 자국", minutes: 5, view: { dist: 1.3 },
      text: ["왁스 칠한 바닥에 격자무늬 고무 자국 넷.", "직사각형으로 대칭이다. 책상 다리는 이렇게 넓지 않다.", "사다리의 발이다."],
      gives: { evidence: ["C2"] },
    },
    {
      id: "floor_old", node: "spot_floor_old", kind: "trace", label: "눌린 자국", minutes: 5, view: { dist: 1.2 },
      text: ["왁스가 동그랗게 눌린 작은 자국 넷. 책상 다리 간격이다.", "그런데 여기에는 책상이 없다.", "24번은 창 쪽으로 한 칸 더 가 있다. 다른 줄과 어긋나게."],
      gives: { evidence: ["C3"] },
    },
    {
      id: "ceiling24", node: "spot_ceiling24", kind: "scan", tool: "phone", label: "24번 위 천장", minutes: 10, radius: 4.2, far: true,
      showIf: { flags: ["look_up"] }, once: true, keep: true,
      idle: ["똑같은 텍스 수십 장. 맨눈으로는 무엇도 다르지 않다.", "눈에 보이지 않는 빛이라면, 카메라에는 보인다. (F: 휴대폰 카메라)"],
      text: ["휴대폰 화면 속에서, 텍스 구멍 하나가 보랏빛으로 깜빡인다.", "화면에서 눈을 떼면 아무것도 없다. 아직 켜져 있다.", "\"사다리가 있어야겠네요.\" 배수정이 시설관리실에 다녀온다. 뒷문 옆에 접이식 사다리가 놓인다."],
      gives: { evidence: ["C5"], flags: ["ceiling_found", "ladder_borrowed"], show: ["ladder_folded"] }, bark: "bark_ir",
    },
    {
      id: "ladder", node: "spot_ladder", kind: "object", label: "접이식 사다리", verb: "든다", minutes: 2,
      showIf: { flags: ["ceiling_found"] }, hideIf: { flags: ["ladder_taken"] },
      text: ["배수정이 시설관리실에서 빌려 온 알루미늄 사다리.", "발에는 격자무늬 고무가 끼워져 있다. 바닥의 자국과 같은 무늬다."],
      gives: { flags: ["ladder_taken"], holding: "ladder", hide: ["ladder_folded"] }, bark: "bark_ladder", instant: true,
    },
    {
      id: "ladder_place", node: "spot_ladder_place", kind: "object", label: "사다리를 세울 자리", verb: "세운다", minutes: 3,
      showIf: { holding: "ladder" },
      text: ["사다리를 펼쳐 세운다.", "네 발이 바닥의 고무 자국에 그대로 들어맞는다."],
      gives: { flags: ["ladder_placed"], holding: null, show: ["ladder_open", "col_ladder_open"] }, instant: true,
    },
    {
      id: "ladder_climb", node: "spot_ladder_climb", kind: "object", label: "사다리", verb: "오른다", minutes: 1,
      showIf: { flags: ["ladder_placed"], notFlags: ["on_ladder"] },
      gives: { flags: ["on_ladder"] }, climb: "view_ladder_top", instant: true,
    },
    {
      id: "tile24", node: "spot_tile24", kind: "trace", label: "텍스 모서리", minutes: 5, radius: 3, far: true,
      showIf: { flags: ["on_ladder"] }, view: { stay: true },
      text: ["이 텍스만 모서리가 살짝 깨져 있다.", "가장자리에 검은 고무 자국. 코팅 장갑이 미끄러진 자리다.", "누군가 이것을 밀어 올렸다."],
      gives: { evidence: ["C6"] },
    },
    {
      id: "tile24_push", node: "spot_tile24", kind: "object", label: "텍스", verb: "밀어 올린다", minutes: 2, radius: 3, far: true,
      showIf: { flags: ["on_ladder"], evidence: ["C6"], notFlags: ["tile_open"] }, view: { stay: true },
      gives: { flags: ["tile_open"] }, lift: "tile24", bark: "bark_tile", instant: true,
    },
    {
      id: "plenum", node: "spot_tile24", kind: "object", label: "천장 속", verb: "들여다본다", minutes: 5, radius: 3, far: true,
      showIf: { flags: ["on_ladder", "tile_open"], notFlags: ["device_gone"] }, view: { stay: true },
      inspect: "plenum",
    },
    {
      id: "plenum_empty", node: "spot_tile24", kind: "object", label: "천장 속", verb: "들여다본다", minutes: 5, radius: 3, far: true,
      showIf: { flags: ["on_ladder", "tile_open", "device_gone"] }, view: { stay: true },
      inspect: "plenum_empty",
    },
    {
      id: "ladder_down", node: "spot_ladder_climb", kind: "object", label: "사다리", verb: "내려온다", minutes: 0, radius: 3,
      showIf: { flags: ["on_ladder"] }, gives: { unflag: ["on_ladder"] }, descend: true, instant: true,
    },
    {
      id: "blackboard", node: "spot_blackboard", kind: "doc", label: "칠판", minutes: 3, view: { dist: 2.2 },
      text: ["지워지지 않은 판서. \"4교시 탐구 14:50 ~ 16:37\".", "그 아래 붉은 분필로 \"반입 금지: 전자기기 일체\"."],
      note: "칠판에 4교시 탐구 14:50~16:37. 그 아래 \"반입 금지: 전자기기 일체\".",
    },
    {
      id: "clock", node: "spot_clock", kind: "object", label: "벽시계", minutes: 2, far: true, radius: 3.5,
      text: ["시험 날 아침 방송에 맞춰 둔 벽시계. 지금도 일 초도 틀리지 않는다."],
      note: "벽시계는 시험 날 아침 방송에 맞춰 둔 그대로다.",
    },
    {
      id: "speaker", node: "spot_speaker", kind: "object", label: "방송 스피커", minutes: 2, far: true, radius: 3.5,
      text: ["영어 듣기는 이 스피커에서 나왔다.", "카메라로는 소리를 들을 수 없다. 그런데 도현은 듣기도 다 맞혔다."],
      gives: { flags: ["saw_speaker"] }, note: "영어 듣기는 칠판 위 방송 스피커에서 나왔다. 도현은 듣기도 다 맞혔다.", card: "N2",
    },
    {
      id: "window", node: "spot_window", kind: "object", label: "창", minutes: 2, view: { dist: 1.6 },
      text: ["운동장 너머로 해가 기운다. 창틀에는 아무것도 없다.", "전파는 이 창을 넘지 못했다. 그날은 차단기가 돌고 있었다."],
      note: "창틀에는 아무것도 없다. 그날 전파는 차단기에 막혀 있었다.",
    },
    {
      id: "notice", node: "spot_notice", kind: "doc", label: "뒷벽 게시판", minutes: 3, view: { dist: 1.5 },
      text: ["\"시험실 좌석 배치도\". 4열 6줄, 24번은 창 쪽 맨 뒤.", "그림 속 24번은 다른 줄과 나란하다."],
      gives: { flags: ["saw_chart"] }, note: "뒷벽의 좌석 배치도. 그림 속 24번은 다른 줄과 나란하다.", card: "N1",
    },
  ],

  npcs: [
    {
      id: "bae", name: "배수정", role: "12시험실 감독관 · 다른 학교 국어 교사", node: "npc_bae_front", model: "/assets/3d/chars/bae.glb",
      trust: 60, height: 1.62,
      persona: "마흔다섯. 차분하고 꼼꼼한 교사 말투의 존댓말. 말이 빠르지 않고, 확실하지 않은 것은 확실하지 않다고 말한다. 도현의 안경을 직접 검사해 통과시킨 일이 마음에 걸려 기자를 시험실에 들여보냈다.",
      situation: "수능 다음 날 금요일 저녁, 수업이 끝난 목원고 12시험실. 기자와 단둘이 있다. 행정실에는 '감독 보고서 확인'이라고 말해 두었다.",
      again: ["더 물어볼 게 있어요?", "네, 말씀하세요."],
      opening: ["천천히 보세요. 행정실에는 감독 보고서를 확인한다고만 해 뒀어요.", "뭐라도 나오면… 저도 알아야겠어요."],
      deflect: ["그건 제가 본 게 없어서 말씀드리기 어려워요.", "확실하지 않은 얘기는 하지 않을게요.", "제가 아는 건 시험실 안에서 본 것뿐이에요."],
      facts: [
        { id: "b1", text: "도현의 뿔테 안경은 입실 때 내가 직접 검사했다. 다리까지 살폈지만 회로는 없었고 플라스틱뿐이었다.", say: "그 학생 안경은 제가 직접 봤어요. 다리까지 살폈는데 회로 같은 건 없었어요. 그냥 플라스틱이었어요.", rule: [{ always: true }] },
        { id: "b2", text: "도현은 문제를 읽을 때 펜을 거꾸로 쥐고 줄마다 긁었고, 펜을 볼 때마다 오른눈을 찡그렸다.", say: "문제를 읽을 때 펜을 거꾸로 쥐고 줄마다 긁더라고요. 그리고 펜을 볼 때마다 오른눈을 찡그렸어요. 버릇인 줄 알았죠.", rule: [{ ask: [["펜", "버릇", "이상", "행동", "읽", "태도"]] }, { trust: 70 }], hint: "시험 중에 도현이 문제를 어떻게 읽었는지 묻지 않았다." },
        { id: "b3", text: "예비소집 날에는 24번 책상이 다른 줄과 나란했다. 그런데 시험 날 아침에 보니 24번만 창 쪽으로 한 칸 붙어 있었다. 줄이 안 맞았지만 고칠 겨를이 없었다. 누가 언제 옮겼는지는 모른다.", say: "예비소집 날 본 것보다 24번이 창 쪽으로 한 칸 붙어 있었어요. 줄이 안 맞는다 싶었는데, 시험 날 아침엔 고칠 겨를이 없었어요.", gives: "C17", rule: [{ shown: ["C3"] }, { ask: [["자리", "책상", "줄", "배치", "옮", "위치"]] }], hint: "「책상의 옛 자국」을 내밀어 보지 않았다.", hintWhen: { evidence: ["C3"] } },
        { id: "b4", text: "시험 전날 저녁 6시에 시험실을 봉인했다. 그 뒤로 들어올 수 있는 사람은 당직과 시설 관리 직원뿐이다.", say: "전날 저녁 6시에 시험실을 봉인했어요. 그 뒤로 들어올 수 있는 건 당직하고 시설 쪽뿐이에요.", gives: "C29", rule: [{ shown: ["C2"] }, { shown: ["C6"] }, { ask: [["전날", "밤", "봉인", "들어", "출입", "누가"]] }], hint: "전날 밤 이 방에 누가 들어올 수 있었는지 묻지 않았다.", hintWhen: { any: [{ evidence: ["C2"] }, { evidence: ["C6"] }] } },
        { id: "b5", text: "천장에서 장치가 나온 것을 보고, 안경만 보고 통과시킨 자신을 탓한다.", say: "…제가 통과시켰어요. 안경만 보고. 정작 봐야 할 건 머리 위에 있었는데.", rule: [{ evidence: ["C7"] }] },
      ],
      barks: {
        bark_dust: "시험 날엔 칠판을 안 써요. 분필 가루일 리가 없는데.",
        bark_ir: "저는 아무것도 안 보이는데… 화면에는 보이네요.",
        bark_ladder: "조심하세요. 시설실에서 빌려 온 거라 돌려줘야 해요.",
        bark_tile: "잠깐만요, 그게… 열려요?",
        bark_device: "세상에. 저게 시험 내내 저 위에 있었다고요?",
      },
    },
  ],

  inspects: {
    plenum: {
      title: "천장 속", model: "/assets/3d/props/plenum.glb", build: "plenum", dark: true, flashlight: true,
      view: { yaw: 0, pitch: -0.03, fixed: true, radius: 0.8, near: 0.5, torch: 4 },
      intro: ["어두운 천장 속, 철골 사이. 손전등을 비춘다.", "화재감지기 배관에 무언가 묶여 있다."],
      details: [
        { id: "device", node: "detail_device", label: "묶여 있는 것", text: ["작은 기판에서 쿨링팬이 아직 돌고 있다. 보조배터리 둘.", "텍스 구멍 쪽으로 반듯하게 내려 세운 빛 신호 장치."], gives: { evidence: ["C7"] }, bark: "bark_device" },
        { id: "mic", node: "detail_mic", label: "가느다란 선", text: ["선 끝의 작은 마이크가 칠판 쪽을 향해 있다. 방송 스피커가 있는 쪽이다.", "영어 듣기는 이것이 들었다."], needs: ["device"] },
        { id: "ties", node: "detail_ties", label: "묶은 방식", text: ["노란 케이블 타이. 던져 올린 게 아니라 배관에 간격을 맞춰 묶었다.", "천장 속을 잘 아는 사람의 솜씨다."], gives: { evidence: ["C8"] }, needs: ["device"] },
        { id: "sticker", node: "detail_sticker", label: "배관의 스티커", text: ["화재감지기 점검표. 마지막 줄의 날짜는 시험 전날, 21시 40분.", "서명 칸에는 '오' 한 글자."], gives: { evidence: ["C9"] } },
        { id: "power", node: "detail_power", label: "기판의 작은 화면", text: ["가동 시간이 올라가고 있다. 거꾸로 세면 켜진 시각은 시험 날 05:40.", "수험생이 들어오기 두 시간 반 전이다."], gives: { evidence: ["C10"] }, needs: ["device"] },
        {
          id: "card", node: "detail_card", label: "메모리 카드", needs: ["device"], text: ["기판 옆구리에 메모리 카드가 꽂혀 있다.", "이 안에 그날의 기록이 있다."],
          choice: {
            id: "card", prompt: "메모리 카드를 어떻게 할까",
            options: [
              { id: "report", label: "손대지 않는다", sub: "사진을 찍고 윤태경에게 신고한다. 로그는 하루 뒤에 본다.", text: ["사진을 여러 장 찍고 텍스를 도로 덮는다. 손은 대지 않았다.", "윤태경에게 전화를 건다. \"지금 목원고 3층입니다. 직접 보셔야 할 게 있습니다.\""], effect: { flags: ["card_reported", "log_pending"], minutes: 15 } },
              { id: "pull", label: "직접 뽑는다", sub: "지금 로그를 본다. 대신 '기자가 손댄 증거'가 된다.", text: ["카드를 뽑아 주머니에 넣는다. 팬 소리가 멎는다.", "이제 이것은 '기자가 손댄 증거'다. 그 값은 나중에 치르게 된다."], effect: { flags: ["card_pulled"], evidence: ["C11"], minutes: 5 } },
            ],
          },
        },
      ],
    },
    plenum_empty: {
      title: "천장 속", model: "/assets/3d/props/plenum_empty.glb", build: "plenum_empty", dark: true, flashlight: true,
      view: { yaw: 0, pitch: -0.03, fixed: true, radius: 0.8, near: 0.5, torch: 4 },
      intro: ["어두운 천장 속. 손전등을 비춘다.", "아무것도 없다. 누군가 먼저 다녀갔다."],
      details: [
        { id: "ties", node: "detail_ties", label: "배관에 남은 것", text: ["잘린 노란 케이블 타이 끝이 배관에 그대로 남아 있다.", "무언가를 묶었다가 급히 끊어 낸 자리다."], gives: { evidence: ["C8"] } },
        { id: "sticker", node: "detail_sticker", label: "배관의 스티커", text: ["화재감지기 점검표. 시험 전날 21시 40분, 그리고 오늘 새벽 5시 줄이 하나 더 생겼다.", "서명은 둘 다 '오'."], gives: { evidence: ["C9"] } },
      ],
    },
    pen: {
      title: "개조된 사인펜", model: "/assets/3d/props/pen.glb", build: "pen", view: { yaw: 0.25, pitch: 0.2 },
      intro: ["시험장에서 나눠 주는 것과 똑같이 생긴 컴퓨터용 사인펜."],
      details: [
        { id: "cam", node: "detail_cam", label: "뒤 끝", text: ["둥근 뒷마개 한가운데에 바늘구멍. 안쪽에서 렌즈가 빛을 받는다."] },
        { id: "label", node: "detail_label", label: "라벨의 검은 네모", text: ["라벨 무늬처럼 보이는 검은 네모. 맨눈으로는 그냥 인쇄다."] },
        { id: "cap", node: "detail_cap", label: "뚜껑 쪽", text: ["뚜껑 끝에 손톱만 한 어두운 창. 펜을 거꾸로 쥐면 이쪽이 천장을 향한다."] },
      ],
      combine: { with: "glasses", lens: "left", at: "detail_label", text: ["왼쪽 알 너머로 보자, 검은 네모에 글자가 떠오른다: E.", "오른쪽 알로는 아무것도 보이지 않는다."], gives: { flags: ["pen_decoded"] } },
    },
    glasses: {
      title: "뿔테 안경", model: "/assets/3d/props/horn_glasses.glb", build: "glasses", view: { yaw: -0.5, pitch: 0.25 },
      intro: ["두꺼운 무광 뿔테. 스마트 안경처럼 보이지만 가볍다."],
      details: [
        { id: "temple", node: "detail_temple", label: "안경다리", text: ["다리 속까지 통짜 플라스틱. 배터리도 회로도 없다."] },
        { id: "left", node: "detail_left", label: "왼쪽 알", text: ["형광등 아래에서 왼쪽 알만 반사가 무지갯빛으로 갈라진다.", "얇은 필름이 한 겹 붙어 있다."] },
        { id: "right", node: "detail_right", label: "오른쪽 알", text: ["오른쪽 알은 평범한 도수 렌즈다."] },
      ],
    },
  },
};

export const SITES = { [MOKWON_ROOM12.id]: MOKWON_ROOM12 };
