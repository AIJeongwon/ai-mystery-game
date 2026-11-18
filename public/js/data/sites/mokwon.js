// 목원고 12시험실 — 제1장 「오답 하나」의 교실 조사 (docs/roadmap/campaign-3d-design.md 9절)
// 자리는 glb 안의 이름에서 읽는다(tools/3d/room12_layout.py). 여기에는 내용과 규칙만 적는다.
// 시각은 분 단위, 0 = 금요일(D+1) 0시.

const FRI = 0, SAT = 1440;

export const MOKWON_ROOM12 = {
  id: "mokwon_room12",
  title: "목원고 12시험실",
  place: "서울 양천구 · 목원고 3층",
  model: "/assets/3d/sites/mokwon_room12.glb",
  blockout: "/assets/3d/sites/mokwon_room12_blockout.glb",
  // 금요일 16시 50분, 해가 창으로 낮게 든다. 조사에 시간을 쓰는 동안 해가 지고(17시 24분), 교실에는 형광등 빛만 남는다.
  start: { minute: FRI + 16 * 60 + 50, spawn: "spawn_room12", items: ["phone", "pen", "glasses"], evidence: ["P7", "P8"] },
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

  // 처음에 숨겨 둘 노드 (상태가 보이게 한다)
  nodes: { ladder_folded: false, ladder_open: false, col_ladder_open: false },

  questions: [
    { id: "q_seat", text: "24번 자리에는 무엇이 남아 있나", cards: ["C1", "C2", "C3", "C4"], when: null },
    { id: "q_above", text: "24번 자리 위에는 무엇이 있나", cards: ["C5"], when: { flags: ["look_up"] } },
    { id: "q_reach", text: "저 구멍까지 어떻게 올라가나", cards: ["C6"], when: { flags: ["ceiling_found"] } },
    { id: "q_who", text: "누가, 언제 이것을 올렸나", cards: ["C7", "C8", "C9", "C10"], when: { flags: ["tile_open"] } },
    { id: "q_card", text: "메모리 카드를 어떻게 할 것인가", cards: [], when: { evidence: ["C7"] } },
    { id: "q_next", text: "점검표와 케이블 타이의 주인을 찾는다: 행정실과 시설관리실로", cards: [], when: { any: [{ flags: ["card_reported"] }, { flags: ["card_pulled"] }] } },
  ],

  // 토요일 새벽 5시, 오기철이 장치를 거둬 간다. 그 전에 텍스를 열었으면 일어나지 않는다.
  deadlines: [
    { id: "retrieval", at: SAT + 5 * 60, unless: { flags: ["tile_open"] }, effect: { flags: ["device_gone"] }, warn: "토요일 새벽 5시 · 화재감지기 재점검(용역)" },
  ],

  evidence: {
    P7: { title: "뿔테 안경", kind: "물건", text: "도현이 버린 무광 뿔테. 회로는 없다. 왼쪽 알만 반사색이 다르다." },
    P8: { title: "개조된 사인펜", kind: "물건", text: "뒤 끝에 바늘구멍, 라벨의 검은 네모는 화면, 뚜껑 쪽에 작은 창. 왼쪽 알 너머로만 글자가 보인다." },
    C1: { title: "석고 가루", kind: "흔적", text: "24번 책상 한가운데에만 떨어진 하얗고 고운 가루. 위에서 떨어진 건축 자재다." },
    C2: { title: "사다리 자국", kind: "흔적", text: "책상 줄 사이 바닥에 격자무늬 고무 자국 넷. 직사각형으로 대칭이다." },
    C3: { title: "책상의 옛 자국", kind: "흔적", text: "왁스에 눌린 책상 다리 자국. 24번 책상은 원래 여기 있었고, 창 쪽으로 한 칸 옮겨졌다." },
    C4: { title: "상판 밑 테이프 자국", kind: "흔적", text: "24번 책상 상판 밑, 펜 한 자루 길이의 끈적한 자국." },
    C5: { title: "깜빡이는 구멍", kind: "흔적", text: "24번 자리 바로 위 텍스의 구멍 하나가 카메라 화면에서만 보랏빛으로 깜빡인다." },
    C6: { title: "깨진 텍스 모서리", kind: "흔적", text: "그 텍스만 모서리가 깨져 있고, 코팅 장갑의 고무 자국이 묻어 있다." },
    C7: { title: "천장 속 장치", kind: "물건", text: "작은 기판과 보조배터리 둘, 빛 신호 장치, 방송 스피커 쪽을 향한 마이크." },
    C8: { title: "노란 케이블 타이", kind: "물건", text: "장치는 화재감지기 배관에 노란 케이블 타이로 반듯하게 묶여 있다. 익숙한 사람의 솜씨다." },
    C9: { title: "화재감지기 점검표", kind: "문서", text: "배관의 점검표 스티커. 시험 전날 21시 40분, 서명 '오'." },
    C10: { title: "전원 기록 05:40", kind: "기록", text: "장치는 시험 날 새벽 5시 40분에 켜졌다." },
    C11: { title: "AI 로그", kind: "기록", text: "메모리 카드의 로그: 몇 시 몇 분에 어떤 문제를 읽었고 어떤 답을 내려보냈는지." },
    C17: { title: "배수정의 진술: 옮겨진 자리", kind: "진술", text: "\"예비소집 날 본 것보다 24번이 창 쪽으로 한 칸 붙어 있었어요.\"" },
    C29: { title: "배수정의 진술: 봉인", kind: "진술", text: "\"전날 저녁 6시에 시험실을 봉인했어요. 그 뒤로 들어올 수 있는 건 당직과 시설 쪽뿐이에요.\"" },
  },

  items: {
    phone: { title: "휴대폰 카메라", key: "F", tool: "phone", hint: "화면 속에서는 눈에 보이지 않는 빛이 보인다" },
    pen: { title: "개조된 사인펜", key: "G", tool: "pen", inspect: "pen", evidence: "P8", hint: "뚜껑 쪽을 위로 향하면 신호를 찾는다" },
    glasses: { title: "뿔테 안경", inspect: "glasses", evidence: "P7" },
  },

  // 조건이 맞는 순간 한 번 일어나는 일
  triggers: [
    {
      id: "look_up", when: { evidence: ["C1", "C2"] },
      lookAt: "spot_ceiling24", hold: 2.6,
      caption: ["가루는 위에서 떨어졌다. 사다리는 위로 오르는 물건이다.", "시선이 저절로 올라간다. 똑같은 텍스 수십 장."],
      effect: { flags: ["look_up"] },
    },
  ],

  spots: [
    {
      id: "desk23", node: "spot_desk23_top", kind: "trace", label: "23번 책상", minutes: 3,
      text: ["23번 책상. 지우개 가루와 샤프심 부스러기.", "다른 책상도 다 이렇다."],
      gives: { flags: ["saw_other_desk"] },
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
    },
    {
      id: "clock", node: "spot_clock", kind: "object", label: "벽시계", minutes: 2, far: true, radius: 3.5,
      text: ["시험 날 아침 방송에 맞춰 둔 벽시계. 지금도 일 초도 틀리지 않는다."],
    },
    {
      id: "speaker", node: "spot_speaker", kind: "object", label: "방송 스피커", minutes: 2, far: true, radius: 3.5,
      text: ["영어 듣기는 이 스피커에서 나왔다.", "카메라로는 소리를 들을 수 없다. 그런데 도현은 듣기도 다 맞혔다."],
      gives: { flags: ["saw_speaker"] },
    },
    {
      id: "window", node: "spot_window", kind: "object", label: "창", minutes: 2, view: { dist: 1.6 },
      text: ["운동장 너머로 해가 기운다. 창틀에는 아무것도 없다.", "전파는 이 창을 넘지 못했다. 그날은 차단기가 돌고 있었다."],
    },
    {
      id: "notice", node: "spot_notice", kind: "doc", label: "뒷벽 게시판", minutes: 3, view: { dist: 1.5 },
      text: ["\"시험실 좌석 배치도\". 4열 6줄, 24번은 창 쪽 맨 뒤.", "그림 속 24번은 다른 줄과 나란하다."],
      gives: { flags: ["saw_chart"] },
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
        { id: "b2", text: "도현은 문제를 읽을 때 펜을 거꾸로 쥐고 줄마다 긁었고, 펜을 볼 때마다 오른눈을 찡그렸다.", say: "문제를 읽을 때 펜을 거꾸로 쥐고 줄마다 긁더라고요. 그리고 펜을 볼 때마다 오른눈을 찡그렸어요. 버릇인 줄 알았죠.", rule: [{ ask: [["펜", "버릇", "이상", "행동", "읽", "태도"]] }, { trust: 70 }] },
        { id: "b3", text: "예비소집 날에는 24번 책상이 다른 줄과 나란했다. 그런데 시험 날 아침에 보니 24번만 창 쪽으로 한 칸 붙어 있었다. 줄이 안 맞았지만 고칠 겨를이 없었다. 누가 언제 옮겼는지는 모른다.", say: "예비소집 날 본 것보다 24번이 창 쪽으로 한 칸 붙어 있었어요. 줄이 안 맞는다 싶었는데, 시험 날 아침엔 고칠 겨를이 없었어요.", gives: "C17", rule: [{ shown: ["C3"] }, { ask: [["자리", "책상", "줄", "배치", "옮", "위치"]] }] },
        { id: "b4", text: "시험 전날 저녁 6시에 시험실을 봉인했다. 그 뒤로 들어올 수 있는 사람은 당직과 시설 관리 직원뿐이다.", say: "전날 저녁 6시에 시험실을 봉인했어요. 그 뒤로 들어올 수 있는 건 당직하고 시설 쪽뿐이에요.", gives: "C29", rule: [{ shown: ["C2"] }, { shown: ["C6"] }, { ask: [["전날", "밤", "봉인", "들어", "출입", "누가"]] }] },
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
