// 프롤로그 「시험 전」 — 의혹 → 미끼 → 두뇌는 어디에 (docs/roadmap/campaign-3d-design.md 9절)
// 네 장소(옥탑방, 목동 가람아파트, 서로재수학원, 목원고 1층)가 한 사건의 상태(카드, 판, 수첩, 시계)를 함께 쓴다.
// 자리는 glb 안의 이름에서 읽는다(tools/3d/prologue_layout.py). 여기에는 내용과 규칙만 적는다.
// 인물·학교·학원·아파트·업체·언론사는 모두 허구다. 시각은 분 단위, 0 = 금요일(D+1) 0시.
import { MOKWON_ROOM12 as ROOM } from "./mokwon.js";
import { PROLOGUE_CARDS } from "./suneung-cards.js";
import { DESK_WEB, DESK_MATH } from "./mokwon-desk.js";

const FRI = 0, SAT = 1440;
const at = (day, h, m = 0) => day + h * 60 + m;
const own = (id) => { const { carried: _carried, ...ev } = ROOM.evidence[id]; return ev; }; // 제1장에서는 이어받은 카드, 여기서는 직접 얻는 카드

// ── 노트북: 어젯밤 올라온 글 넷 ──
const page = (id, clips, miss, more = {}) => {
  const p = DESK_WEB.pages[id];
  return { ...p, terms: undefined, miss, ...more, blocks: (more.blocks || p.blocks).map((b) => (clips[b.id] ? { ...b, clip: { card: clips[b.id] } } : b)) };
};
const WEB = {
  home: "find",
  terms: ["전부 검거", "기적의 재수"], // 밤사이 메신저에 쌓인 말. 수첩 맨 앞에 적혀 있다
  sites: Object.fromEntries(["find", "sehan", "nea", "plaza", "blog"].map((k) => [k, DESK_WEB.sites[k]])),
  pages: {
    sehan_article: page("sehan_article", { p1: "P1" }, "기사에서 판에 붙일 것은 '몇 명을 어떻게 잡았다'는 문장이다."),
    nea_press: page("nea_press", { p1: "P2", p2: "P2" }, "보도자료에서 판에 붙일 것은 무엇을 했고 무엇을 아직 하지 않았는지다.",
      { blocks: DESK_WEB.pages.nea_press.blocks.filter((b) => b.t !== "link") }),
    nea_jammer: { ...DESK_WEB.pages.nea_jammer, terms: undefined, miss: "시범 운영을 알리는 공지다. 같은 말이 보도자료에도 있다." },
    blog_miracle: page("blog_miracle", { p1: "P3" }, "자랑하는 글이다. 판에 붙일 것은 성적이 얼마나 뛰었는지다."),
    plaza_post: page("plaza_post", { p1: "P4" }, "댓글은 떠도는 말이다. 판에 붙일 것은 무엇을 의심하는지 적은 본문이다.", {
      blocks: [
        ...DESK_WEB.pages.plaza_post.blocks.filter((b) => !["c2", "c3", "c4"].includes(b.id)),
        { id: "c5", t: "comment", who: "익명2", text: "시험장 목원고였음. 12시험실. 같은 방에서 본 애가 그러는데 감독관이 입실 때 그 안경 직접 벗겨서 검사했다더라." },
        { id: "c6", t: "comment", who: "익명3", text: "걔 목동 가람아파트 107동 삼. 오늘 새벽에 분리수거장에 뭐 버리고 가는 거 봤다는 글 올라왔다가 지워짐." },
        { id: "c7", t: "comment", who: "익명4", text: "서로재수학원 다니는데 걔 9월 모의고사 게시판에 이름 없었음. 진짜임." },
      ],
    }),
  },
};

// ── 장소와 이동 ──
// 지도의 자리는 손으로 그린 서울 약도(900 x 620, site/travel.js) 위의 좌표다.
const PLACES = [
  { id: "rooftop", site: "prologue_rooftop", name: "옥탑방", sub: "마포구 망원동", at: [560, 190] },
  { id: "academy", site: "prologue_academy", name: "서로재수학원", sub: "양천구 목동 · 학원가", at: [330, 392], when: { evidence: ["P3"] } },
  { id: "apt", site: "prologue_apt", name: "가람아파트 107동", sub: "양천구 목동", at: [236, 470], when: { evidence: ["P4"] } },
  { id: "gate", site: "prologue_gate", name: "목원고", sub: "양천구 목동 · 수능 시험장", at: [410, 500], when: { evidence: ["P4"] },
    // 약도에서 그곳 옆에 적어 두는 말
    notes: [{ text: "감독관들 · 오후 3시", when: { flags: ["know_bae_time"], before: at(FRI, 15) } }, { text: "배수정 · 6시까지", when: { flags: ["know_bae_time"], after: at(FRI, 15), before: at(FRI, 18), notFlags: ["room_open"] } }] },
];
// 걸리는 시간(분). 강을 건너면 40분, 목동 안에서는 걸어서 10~15분.
const ROUTES = { "rooftop|academy": 40, "rooftop|apt": 40, "rooftop|gate": 40, "academy|apt": 10, "academy|gate": 12, "apt|gate": 15 };

// ── 인물 ──
const GUARD = {
  id: "guard", name: "방인수", role: "가람아파트 107동 경비원", node: "npc_guard", trust: 55, height: 1.66, model: "/assets/3d/chars/guard.glb",
  persona: "예순넷. 무뚝뚝하지만 한번 말문이 트이면 길게 말한다. \"~했지\", \"~라고\" 하는 반말 섞인 말투. 주민 일을 함부로 떠들지는 않지만, 본 것은 본 대로 말한다.",
  situation: "수능 다음 날 금요일 아침, 가람아파트 107동 경비실 앞. 빗자루를 들고 있다. 처음 보는 기자가 말을 건다.",
  again: ["또 뭐.", "말해 봐요."],
  opening: ["누구 찾아왔어요? 여긴 107동인데.", "기자? …어제도 몇 왔다 갔어."],
  deflect: ["그건 내가 본 게 아니라서.", "주민 일을 내가 이러쿵저러쿵할 건 아니고.", "모르는 건 모른다고 해야지."],
  facts: [
    { id: "g1", text: "오늘 새벽 6시 10분쯤 103호 아들(한도현)이 분리수거장에 새 필통을 통째로 버렸다. 아까워서 경비실 분실물 선반에 올려 두었다.", say: "새벽 6시 10분쯤에 103호 아들이 새 필통을 통째로 버리더라고. 아까워서 분실물 선반에 올려놨지.", gives: "P11", rule: [{ always: true }] },
    { id: "g2", text: "필통 안에 수험표가 들어 있어 주인을 안다. 돌려주려고 인터폰을 눌렀지만 103호에서 받지 않았다. 버린 물건이니 기자가 열어 봐도 된다.", say: "안에 수험표가 있어서 누구 건지는 알아. 돌려주려고 인터폰을 눌렀는데 안 받아. 버린 물건인데 뭐, 열어 봐요.", rule: [{ ask: [["선반", "열어", "봐도", "볼 수", "가져", "돌려", "주인", "수험표"]] }, { evidence: ["P11"] }], hint: "분실물 선반의 필통을 열어 봐도 되는지 묻지 않았다.", hintWhen: { evidence: ["P11"] } },
    { id: "g3", text: "103호 어머니는 어제저녁부터 인터폰을 받지 않는다. 기자 같은 사람이 몇 다녀갔다.", say: "그 집 엄마는 어제저녁부터 인터폰을 안 받아. 기자인지 뭔지 몇이 왔다 갔지.", rule: [{ ask: [["어머니", "엄마", "집", "가족", "103"]] }, { trust: 62 }] },
    { id: "g4", text: "도현은 일 년 내내 밤 열두 시가 넘어 학원 가방을 메고 들어왔다. 인사는 꼬박꼬박 했다.", say: "걔가 일 년 내내 열두 시 넘어서 가방 메고 들어왔어. 인사는 꼬박꼬박 했고. …그래서 나는 잘 모르겠어, 사람들이 하는 말.", rule: [{ ask: [["어떤", "평소", "성격", "공부", "학생", "아들"]] }, { trust: 66 }] },
  ],
  barks: { bark_case: "새 건데 아깝잖아. 뭐가 들었나 봐요." },
};
const TUTOR = {
  id: "tutor", name: "권혜원", role: "서로재수학원 담임 강사", node: "npc_tutor", trust: 52, height: 1.6, model: "/assets/3d/chars/tutor.glb",
  persona: "서른여덟. 조심스러운 존댓말. 학원의 눈치를 보지만 학생 이야기에는 거짓말을 못 한다. 말끝을 흐리다가도 숫자는 정확히 말한다.",
  situation: "수능 다음 날 금요일 오전, 텅 빈 서로재수학원 상담실. 재수생들은 오늘 아무도 나오지 않았다. 기자가 찾아왔다.",
  again: ["네, 더 물어보실 게 있으세요?", "말씀하세요."],
  opening: ["기자님이시라고요. …블로그 글 때문에 오신 거죠.", "원장님은 안 계세요. 제가 아는 것만 말씀드릴게요."],
  deflect: ["그건 제가 말씀드릴 수 있는 게 아니에요.", "그건 저도 잘 몰라요.", "학원 입장은 원장님께 물어보셔야 해요."],
  facts: [
    { id: "t1", text: "도현의 9월 모의고사는 국어 5, 수학 5, 영어 4등급이었다. 10월 학원 모의고사도 비슷했다. 두 달 만에 전 과목 1등급이 되는 것은 처음 본다.", say: "9월 모의고사요? 국어 5, 수학 5, 영어 4였어요. 10월 학원 모의고사도 비슷했고요. 두 달 만에 이렇게 되는 건… 저도 처음 봐요.", gives: "P9", rule: [{ always: true }] },
    { id: "t2", text: "도현의 자리는 자습실 뒤에서 둘째 줄, 통로 옆이다. 오늘은 아무도 나오지 않았으니 둘러봐도 된다.", say: "도현이 자리는 자습실 뒤에서 둘째 줄, 통로 옆이에요. 오늘은 아무도 안 나왔으니까… 보셔도 돼요.", rule: [{ always: true }] },
    { id: "t3", text: "10월부터 도현은 자습실에서 문제를 풀지 않고, 펜을 거꾸로 쥐고 문제지를 줄마다 문지르고 있었다. 물으니 암기법이라고 했다.", say: "10월부터는 문제를 푸는 게 아니라, 펜을 거꾸로 쥐고 문제지를 줄마다 문지르고 있었어요. 물어보니까 암기법이래요.", rule: [{ ask: [["자습", "펜", "10월", "이상", "버릇", "연습", "달라"]] }, { shown: ["P10"] }, { trust: 64 }], hint: "10월에 도현이 자습실에서 어떻게 공부했는지 묻지 않았다." },
    { id: "t4", text: "홍보 글은 원장이 가채점표를 받자마자 올렸다. 나는 말렸다.", say: "그 글은 원장님이 가채점표 받자마자 올리셨어요. 저는… 좀 더 보고 올리자고 했는데.", rule: [{ ask: [["홍보", "블로그", "글", "원장", "기적", "현수막"]] }, { shown: ["P3"] }] },
    { id: "t5", text: "10월 초에 도현의 어머니가 외부 컨설팅을 받는다며 학원 상담을 끊었다. 업체 이름은 듣지 못했다.", say: "10월 초에 어머님이 외부 컨설팅을 받으신다고 학원 상담을 끊으셨어요. 어디인지는 말씀 안 하셨고요.", rule: [{ ask: [["어머니", "어머님", "컨설팅", "상담", "외부", "명함"]] }, { shown: ["P12"] }, { trust: 70 }], hint: "「명문설계 명함」을 내밀어 보지 않았다.", hintWhen: { evidence: ["P12"] } },
  ],
  barks: {},
};
const CHIEF = {
  id: "chief", name: "곽명숙", role: "목원고 행정실장", node: "npc_chief", trust: 40, height: 1.58, model: "/assets/3d/chars/chief.glb",
  persona: "쉰다섯. 딱딱하고 짧은 공무원 말투의 존댓말. 규정에 없는 것은 하지 않는다. 묻는 것에만 답한다.",
  situation: "수능 다음 날 금요일, 목원고 행정실 민원 창구. 시험장 뒷정리로 바쁘다. 기자가 창구 앞에 섰다.",
  again: ["네.", "용건만 말씀하세요."],
  opening: ["어떻게 오셨어요.", "취재는 교육청 공보실을 통해 주세요."],
  deflect: ["그건 제가 답할 수 있는 게 아닙니다.", "규정상 말씀드릴 수 없습니다.", "공보실로 문의하세요."],
  facts: [
    { id: "c1", text: "외부인은 1층 민원 창구까지만 들어올 수 있다. 3층 시험실 구역은 감독 보고서 확인이 끝날 때까지 잠가 두었고, 열쇠는 행정실에 있다.", say: "외부인은 1층 민원 창구까지입니다. 3층 시험실 구역은 감독 보고서 확인이 끝날 때까지 잠가 뒀어요. 열쇠는 여기 있고요.", rule: [{ always: true }] },
    { id: "c2", text: "감독관으로 왔던 다른 학교 교사들이 오늘 오후 3시에 감독 보고서를 내러 교무실에 온다. 12시험실 감독관은 배수정 교사다.", say: "감독관으로 오셨던 선생님들은 오늘 오후 3시에 보고서 내러 교무실로 오십니다. 12시험실은 배수정 선생님이고요.", effect: { flags: ["know_bae_time"] }, rule: [{ always: true }] },
    { id: "c3", text: "게시판의 시설 점검 일정은 용역 업체가 올린 것이다. 화재감지기 점검은 시험 전날 밤에 했고, 재점검이 토요일 새벽 5시에 잡혀 있다. 누가 나오는지는 업체에서 정한다.", say: "게시판 일정은 용역 업체가 올린 겁니다. 화재감지기 점검은 시험 전날 밤에 했고, 재점검이 내일 새벽 5시예요. 누가 나오는지는 업체가 정합니다.", rule: [{ ask: [["점검", "게시판", "용역", "화재", "시설", "일정"]] }, { shown: ["P13"] }] },
  ],
  barks: {},
};
const BAE = {
  ...ROOM.npcs.find((n) => n.id === "bae"), node: "npc_bae_office",
  // 금요일 오후 3시에 보고서를 내러 온다. 놓치면 토요일 아침에 보고서를 고치러 다시 온다.
  when: { any: [{ after: at(FRI, 15), before: at(FRI, 18) }, { after: at(SAT, 9) }] },
  situation: "수능 다음 날, 감독 보고서를 내러 목원고 교무실에 와 있다. 다른 학교 교사라 빈 자리에 서서 보고서를 고치고 있다. 기자가 찾아왔다.",
  opening: ["기자님이세요? …12시험실 얘기라면, 저도 하고 싶은 말이 있긴 해요.", "여기서 오래는 못 있어요."],
  facts: [
    { id: "p1", text: "도현의 뿔테 안경은 입실 때 내가 직접 검사했다. 다리까지 살폈지만 회로는 없었고 플라스틱뿐이었다.", say: "그 학생 안경은 제가 직접 봤어요. 다리까지 살폈는데 회로 같은 건 없었어요. 그냥 플라스틱이었어요.", gives: "P5", rule: [{ always: true }] },
    { id: "p2", text: "도현은 문제를 읽을 때 펜을 거꾸로 쥐고 줄마다 긁었고, 펜을 볼 때마다 오른눈을 찡그렸다.", say: "문제를 읽을 때 펜을 거꾸로 쥐고 줄마다 긁더라고요. 그리고 펜을 볼 때마다 오른눈을 찡그렸어요. 버릇인 줄 알았죠.", gives: "P6", rule: [{ ask: [["펜", "버릇", "이상", "행동", "읽", "태도"]] }, { shown: ["P8"] }, { shown: ["P10"] }, { trust: 70 }], hint: "시험 중에 도현이 문제를 어떻게 읽었는지 묻지 않았다." },
    { id: "p3", text: "3층 시험실 구역은 잠겨 있다. 감독 보고서를 확인한다고 하면 내가 열쇠를 받을 수는 있다. 하지만 근거도 없이 기자를 시험실에 들일 수는 없다.", say: "3층은 잠겨 있어요. 감독 보고서를 확인한다고 하면 제가 열쇠를 받을 수는 있어요. 하지만 근거도 없이 기자님을 들일 수는 없어요.", rule: [{ ask: [["시험실", "들어", "열쇠", "3층", "볼 수", "보여"]] }, { trust: 66 }], hint: "시험실에 들어가 볼 수 있는지 묻지 않았다." },
    { id: "p4", text: "기자가 내민 쪽지가 그럴듯하다. 하지만 무엇이 미끼였고 두뇌가 어디 있다는 것인지 한 문장으로 맞춰 오면 믿겠다.", say: "그럴듯해요. 그런데 한 문장으로 말해 줄 수 있어요? 무엇이 미끼였고, 그 두뇌가 어디 있다는 건지.", // 추리 둘을 다 맞춘 뒤에는 이 말을 건너뛰고 바로 p5로 간다
      rule: ["I4", "I3", "I1"].flatMap((id) => [{ shown: [id], notFlags: ["deduced_decoy"] }, { shown: [id], notFlags: ["deduced_brain"] }]) },
    { id: "p5", text: "안경은 미끼였고 두뇌는 시험실 안에 있다는 기자의 추리를 듣고, 수업이 끝나는 4시 50분에 3층 12시험실을 열어 주기로 했다. 행정실에는 감독 보고서를 확인한다고 말해 둔다.", say: "…안경만 보고 통과시킨 게 저예요. 그 방 안에 뭐가 있다면 저도 알아야겠어요. 열쇠를 받아 올게요. 행정실에는 감독 보고서를 확인한다고 해 둘게요.", effect: { flags: ["room_open"] }, rule: [{ flags: ["deduced_decoy", "deduced_brain"], shown: ["I4"] }, { flags: ["deduced_decoy", "deduced_brain"], shown: ["I1"] }], hint: "추리 ①과 ③을 맞춘 뒤 「빛이 닿는 곳」을 내밀어 보지 않았다.", hintWhen: { flags: ["deduced_decoy", "deduced_brain"] } },
  ],
  barks: {},
};
const CAST = [GUARD, TUTOR, CHIEF, BAE];

// ── 네 장소 ──
const SITES = [
  {
    id: "prologue_rooftop", key: "rooftop", title: "옥탑방", place: "서울 마포구 · 망원동 옥탑방", spawn: "spawn_rooftop", arrive: "spawn_rooftop_stairs",
    sketch: ["금요일 아침 여덟 시. 수능 다음 날.", "밤사이 메신저에 두 마디가 쌓였다. 「전부 검거」, 그리고 「기적의 재수」."],
    light: { sun: { dir: [0.55, 0.42, 0.72], color: 0xffe2bd, intensity: 3.2 }, sunset: 17.4, sky: 0xcfd9e6, ground: 0x6b6257, ambient: 0.5, exposure: 0.9, lamp: 1.1, skyBg: 0xbcd0e4 },
    map: { labels: [{ text: "방", x: 0, z: 0 }, { text: "옥상", x: -1.5, z: -4.6 }, { text: "계단실", x: 3.9, z: -3.15 }] },
    spots: [
      { id: "rt_laptop", node: "spot_laptop", kind: "doc", label: "노트북", verb: "연다", minutes: 0, probe: "web", instant: true },
      { id: "rt_board", node: "spot_board", kind: "object", label: "벽의 증거판", verb: "본다", minutes: 0, open: "board", instant: true },
      { id: "rt_parcel", node: "spot_parcel", kind: "object", label: "택배 상자", minutes: 3, inspect: "parcel" },
      { id: "rt_rail", node: "spot_rail", kind: "object", label: "옥상 난간", verb: "내다본다", minutes: 1, view: { dist: 1.1 },
        text: ["망원동의 낮은 지붕들. 멀리 성산대교 쪽으로 버스가 지나간다.", "강 건너가 목동이다."], note: "옥탑방에서 강 건너 목동까지는 버스로 사십 분." },
      { id: "rt_stairs", node: "spot_stairs", kind: "object", label: "계단실", verb: "나선다", minutes: 0, travel: true, instant: true },
    ],
    npcs: [],
  },
  {
    id: "prologue_apt", key: "apt", title: "가람아파트 107동", place: "서울 양천구 목동 · 가람아파트 107동", spawn: "spawn_apt",
    sketch: ["오래된 복도식 아파트. 금요일은 분리수거 날이다.", "경비원이 마당을 쓸고 있다."],
    light: { sun: { dir: [0.7, 0.45, 0.6], color: 0xe9eef2, intensity: 2.2 }, sunset: 17.4, sky: 0xd5dbe0, ground: 0x6b6b66, ambient: 0.62, exposure: 0.9, lamp: 1.2, skyBg: 0xc9d0d6 },
    map: { labels: [{ text: "분리수거장", x: 6.5, z: 4 }, { text: "경비실", x: -5.1, z: -0.3 }, { text: "로비", x: 0, z: -5.5 }, { text: "정문", x: 0, z: 6.6 }] },
    spots: [
      { id: "apt_gate", node: "spot_apt_gate", kind: "object", label: "단지 정문", verb: "나선다", minutes: 0, travel: true, instant: true },
      { id: "apt_bins", node: "spot_bins", kind: "trace", label: "플라스틱 수거함", minutes: 4,
        text: ["플라스틱 수거함 옆구리에 테이프로 붙인 쪽지.", "「새 필통 버리신 분, 경비실에 보관 중. 수험표 들어 있음.」", "경비원의 글씨다."],
        gives: { flags: ["saw_bin_note"] }, note: "분리수거장의 쪽지: 「새 필통 버리신 분, 경비실에 보관 중. 수험표 들어 있음.」" },
      { id: "apt_shelf", node: "spot_guard_shelf", kind: "object", label: "분실물 선반", verb: "필통을 연다", minutes: 5,
        lock: { any: [{ evidence: ["P11"] }, { flags: ["saw_bin_note"] }] }, lockText: "경비실 선반에 분실물이 놓여 있다. 까닭 없이 남의 것을 뒤질 수는 없다.",
        inspect: "pencilcase", bark: "bark_case" },
      { id: "apt_mailbox", node: "spot_mailbox", kind: "object", label: "우편함", minutes: 2,
        text: ["103호 칸에 고지서와 전단이 꽂혀 있다.", "맨 위는 입시 컨설팅 전단. 업체 이름 자리만 손으로 뜯겨 있다."], note: "103호 우편함의 입시 컨설팅 전단. 업체 이름 자리만 뜯겨 있다." },
      { id: "apt_board", node: "spot_lobby_board", kind: "doc", label: "로비 게시판", minutes: 2,
        text: ["「분리수거는 화·금 06:00~09:00」. 오늘은 금요일이다.", "새벽 여섯 시에 내놓으면 가장 먼저 실려 간다."], note: "가람아파트의 분리수거는 화·금 06:00~09:00. 여섯 시에 내놓으면 가장 먼저 실려 간다." },
      { id: "apt_door", node: "spot_door103", kind: "object", label: "103호", verb: "초인종을 누른다", minutes: 3,
        text: ["초인종 소리. 한참 뒤, 걸쇠가 걸린 채로 문이 한 뼘 열린다.", "\"기자세요? 우리 애는 밤새 공부했어요. 일 년 내내요.\"", "\"더 할 말 없어요.\" 문이 닫힌다. 안에서 텔레비전 소리가 커진다."],
        gives: { flags: ["met_mother"] }, note: "도현의 어머니는 문을 한 뼘만 열었다. \"우리 애는 밤새 공부했어요.\"" },
    ],
    npcs: [GUARD],
  },
  {
    id: "prologue_academy", key: "academy", title: "서로재수학원", place: "서울 양천구 목동 · 서로재수학원", spawn: "spawn_academy",
    sketch: ["학원가 건물 4층. 형광등만 웅웅거린다.", "수능 다음 날, 재수생들은 아무도 나오지 않았다."],
    light: { sun: { dir: [0.8, 0.5, 0.25], color: 0xf3ece0, intensity: 2.4 }, sunset: 17.4, sky: 0xd5dbe0, ground: 0x6b6257, ambient: 0.5, exposure: 0.9, lamp: 1.5, skyBg: 0xc9d0d6 },
    map: { labels: [{ text: "로비", x: 0, z: 2.6 }, { text: "자습실", x: -2.6, z: -6.9 }, { text: "상담실", x: 2.5, z: -0.6 }] },
    spots: [
      { id: "ac_exit", node: "spot_academy_exit", kind: "object", label: "승강기", verb: "나선다", minutes: 0, travel: true, instant: true },
      { id: "ac_rank", node: "spot_rank_board", kind: "doc", label: "성적 게시판", minutes: 3, view: { dist: 1.5 },
        text: ["「9월 모의고사 성적 우수자」. 서른 명의 이름.", "한도현은 없다. 10월 학원 모의고사 게시물에도 없다.", "그런데 현수막은 그를 '기적'이라고 부른다."],
        gives: { flags: ["saw_rank"] }, note: "학원 성적 게시판의 9월·10월 우수자 서른 명 가운데 한도현은 없다." },
      { id: "ac_banner", node: "spot_banner", kind: "object", label: "현수막", minutes: 1, far: true, radius: 3.5,
        text: ["「기적의 재수! 5·6·5·4·5 → 전 과목 1등급」.", "어젯밤에 뽑은 현수막이다. 아직 잉크 냄새가 난다."], note: "학원은 가채점이 나온 그날 밤에 현수막부터 뽑았다." },
      { id: "ac_desk", node: "spot_dohyeon_desk", kind: "object", label: "도현의 자리", verb: "연습지를 든다", minutes: 5, inspect: "practice" },
      { id: "ac_gap", node: "spot_desk_gap", kind: "trace", label: "책상 틈", verb: "들여다본다", minutes: 3, view: { dist: 0.7 },
        text: ["책상과 칸막이 사이 틈에 명함 한 장이 끼어 있다.", "「명문설계 입시컨설팅」. 뒷면에 손글씨로 추천 코드 MS-1114."], gives: { evidence: ["P12"] } },
      { id: "ac_other", node: "spot_other_desk", kind: "object", label: "건너편 자리", minutes: 2,
        text: ["건너편 자리의 연습지. 여백마다 풀이가 빽빽하다. 지우고 다시 쓴 자국.", "수학 문제를 푼 종이는 이렇게 생겼다."],
        gives: { flags: ["saw_other_sheet"] }, note: "건너편 자리의 연습지는 여백마다 풀이가 빽빽하다. 지우고 다시 쓴 자국까지." },
    ],
    npcs: [TUTOR],
  },
  {
    id: "prologue_gate", key: "gate", title: "목원고", place: "서울 양천구 목동 · 목원고 본관 1층", spawn: "spawn_gate",
    sketch: ["어제의 시험장. 현관 위에 현수막이 아직 걸려 있다.", "운동장에서 호루라기 소리. 학교는 평소의 금요일로 돌아갔다."],
    light: { sun: { dir: [-0.6, 0.5, 0.7], color: 0xffdcae, intensity: 3.2 }, sunset: 17.4, sky: 0xcfd9e6, ground: 0x6b6257, ambient: 0.48, exposure: 0.88, lamp: 1.5, skyBg: 0xc4d6e8 },
    map: { labels: [{ text: "교문", x: 0, z: 8.6 }, { text: "행정실", x: -5.7, z: -3.4 }, { text: "교무실", x: 1.5, z: -3.6 }, { text: "계단", x: 7.2, z: -3.2 }] },
    spots: [
      { id: "gt_exit", node: "spot_school_gate", kind: "object", label: "교문", verb: "나선다", minutes: 0, travel: true, instant: true },
      { id: "gt_banner", node: "spot_gate_banner", kind: "object", label: "현관의 현수막", minutes: 1, far: true, radius: 6,
        text: ["「대학수학능력시험 시험장 · 목원고등학교」.", "어제 걸었던 것이 아직 그대로다."], note: "목원고 현관에는 수능 시험장 현수막이 아직 걸려 있다." },
      { id: "gt_board", node: "spot_office_board", kind: "doc", label: "행정실 게시판", minutes: 3, view: { dist: 1.3 },
        text: ["「시설 점검 일정(용역)」.", "수요일 21:00 화재감지기 점검 · 3층. 토요일 05:00 화재감지기 재점검 · 3층.", "시험 전날 밤과 내일 새벽. 둘 다 3층 시험실 구역이다."], gives: { evidence: ["P13"] } },
      { id: "gt_wait", node: "spot_wait_bench", kind: "object", label: "복도 의자", verb: "3시까지 기다린다", minutes: 0,
        showIf: { flags: ["know_bae_time"], before: at(FRI, 15) }, once: true,
        text: ["복도 의자에 앉아 기다린다. 운동장의 호루라기 소리, 종소리.", "오후 3시. 낯선 교사들이 하나둘 교무실로 들어간다."], gives: { until: at(FRI, 15) } },
      { id: "gt_wait_sat", node: "spot_wait_bench", kind: "object", label: "복도 의자", verb: "내일 아침을 기다린다", minutes: 0,
        showIf: { after: at(FRI, 18), before: at(SAT, 9), notFlags: ["room_open"] }, once: true,
        text: ["교무실 불이 꺼졌다. 배수정은 돌아갔다.", "문 옆 일정표에 한 줄이 남아 있다. 「감독 보고서 정정 · 토요일 09:00」.", "밤을 넘긴다. 토요일 오전 9시."], gives: { until: at(SAT, 9) } },
      { id: "gt_stairs", node: "spot_stairs3", kind: "object", label: "3층으로 가는 계단", verb: "올라간다", minutes: 0,
        lock: { flags: ["room_open"] }, lockText: "접이식 철문이 내려와 있다. 「3층 시험실 구역 · 감독 보고서 확인 중 · 관계자 외 출입 금지」.",
        text: ["배수정이 행정실에서 열쇠를 받아 온다. 접이식 철문이 걷힌다.", "3층 복도 끝, 12시험실."], gives: { flags: ["prologue_done"] },
        goto: { site: "mokwon_room12", carry: true, card: ["프롤로그 「시험 전」 끝", "제1장 「오답 하나」"] } },
    ],
    npcs: [CHIEF, BAE],
  },
];

// ── 열람 ──
const INSPECTS = {
  parcel: {
    title: "택배 상자", build: "parcel", view: { yaw: 0.4, pitch: 0.5 },
    intro: ["열흘 전에 온 택배 상자. 보낸 사람 칸은 비어 있다."],
    details: [
      { id: "stamp", node: "detail_stamp", label: "도장", text: ["나무 손잡이가 닳은 도장. 새긴 면에는 인주가 말라붙어 있다.", "아직 한 번도 찍지 않았다."] },
      { id: "ink", node: "detail_ink", label: "인주통", text: ["놋쇠 인주통. 뚜껑을 열면 붉은 인주가 반쯤 남아 있다."] },
      { id: "memo", node: "detail_memo", label: "쪽지", text: ["쪽지 한 장. 「찍기 전에는 세 번 읽어라」.", "누가 보냈는지는 적혀 있지 않다."], gives: { flags: ["saw_parcel"] } },
    ],
  },
  pencilcase: {
    title: "새 필통", build: "pencilcase", view: { yaw: 0.2, pitch: 0.75 },
    intro: ["지퍼 달린 천 필통. 가격표를 뗀 자국이 그대로다.", "안에 든 것은 셋."],
    details: [
      { id: "ticket", node: "detail_ticket", label: "수험표", text: ["수험표. 한도현. 시험장 목원고, 12시험실 24번.", "주인이 누구인지는 이것으로 안다."], gives: { flags: ["know_seat"] } },
      { id: "glasses", node: "detail_glasses", label: "뿔테 안경", text: ["두꺼운 무광 뿔테. 의혹 글이 말한 그 안경이다.", "들어 보니 가볍다. 다리 속까지 통짜 플라스틱. 회로도 배터리도 없다."], gives: { evidence: ["P7"], items: ["glasses"] } },
      { id: "pen", node: "detail_pen", label: "컴퓨터용 사인펜", text: ["시험장에서 나눠 주는 것과 똑같은 사인펜. 그런데 지급 펜은 시험장에 두고 나온다.", "뒤 끝이 이상하다. 따로 꺼내 본다. (I: 소지품)"], gives: { items: ["pen"], flags: ["got_pen"] } },
    ],
  },
  practice: {
    title: "수학 연습지", build: "practice", dark: true, flashlight: true, view: { yaw: 0, pitch: 0.95, radius: 0.34, torch: 9 },
    intro: ["도현의 자리에 남은 수학 연습지. 스탠드를 끄고 휴대폰 불빛을 비스듬히 비춘다."],
    details: [
      { id: "margin", node: "detail_margin", label: "여백", text: ["킬러 문항 다섯 개. 여백에 풀이가 한 줄도 없다.", "답만 적혀 있다. 전부 맞았다."] },
      { id: "gloss", node: "detail_gloss", label: "문제의 줄", text: ["빛이 종이를 스치자 문제의 줄마다 광택이 떠오른다.", "왼쪽에서 오른쪽으로, 한 줄씩. 연필 자국이 아니다.", "단단하고 둥근 것으로 눌러 지나간 자리다."], gives: { evidence: ["P10"] } },
    ],
  },
  pen: {
    ...ROOM.inspects.pen, title: "컴퓨터용 사인펜",
    combine: { ...ROOM.inspects.pen.combine, text: ["왼쪽 알 너머로 보자, 검은 네모에 글자가 떠오른다: E.", "오른쪽 알로는 아무것도 보이지 않는다. 맨눈으로도.", "이 펜은 무언가를 받아 적는 물건이다. 지금은 받을 것이 없을 뿐이다."], gives: { evidence: ["P8"], flags: ["pen_decoded"] } },
  },
  glasses: ROOM.inspects.glasses,
};

// ── 사건 전체가 함께 쓰는 것 ──
const CASE = {
  save: "prologue", caseTitle: "프롤로그 「시험 전」",
  start: { minute: at(FRI, 8), items: [], evidence: [] },
  places: PLACES, routes: ROUTES,
  probes: [{ id: "web", kind: "web", label: "노트북", minutes: 0 }],
  records: { web: WEB, answers: { math: DESK_MATH } },
  deadlines: [],
  nodes: {},

  questions: [
    { id: "q_news", text: "어젯밤 무엇이 올라왔나", sub: "책상의 노트북을 연다", cards: ["P1", "P2", "P3", "P4"], when: null,
      hints: ["검색창 옆의 쪽지 둘을 차례로 눌러 본다. 글마다 판에 붙일 한 대목을 골라 오려 둔다.", "기사 끝에는 보도자료로 가는 고리가 있다."] },
    { id: "q_gap", text: "기사는 보도자료를 어떻게 옮겼나", sub: "증거판(B)에서 두 장을 '원문'으로 잇는다", board: true, cards: ["I2"], when: { evidence: ["P1", "P2"] }, until: { evidence: ["I2"] },
      hints: ["보도자료가 먼저, 기사가 나중이다. 보도자료 → 기사를 '원문'으로 잇는다.", "겹쳐 놓고, 기사에서 사라진 문장을 짚는다."] },
    { id: "q_trace", text: "도현의 두 달을 따라간다", sub: "목동의 재수학원과 아파트 · 문을 나서면 약도가 펼쳐진다", cards: ["P9", "P10", "P11", "P7", "P8"], when: { evidence: ["P3", "P4"] },
      hints: ["학원에는 성적을 아는 사람이, 아파트에는 새벽을 본 사람이 있다.", "필통에서 나온 둘은 따로 보지 말고 겹쳐 본다. 소지품(I)에서 펜을 들고, 안경의 알 너머로 본다."] },
    { id: "q_leap", text: "9월과 11월은 무슨 사이인가", sub: "증거판(B)에서 두 장을 '앞뒤'로 잇는다", board: true, cards: ["I0"], when: { evidence: ["P9", "P3"] }, until: { evidence: ["I0"] },
      hints: ["먼저 있었던 것에서 나중 것으로 긋는다. 9월 모의고사 → 수능 가채점."] },
    { id: "q_school", text: "그 안경을 직접 본 사람을 찾는다", sub: "목원고 · 12시험실의 감독관", cards: ["P5", "P6", "P13"], when: { evidence: ["P7", "P8"] },
      hints: ["행정실 창구에서 감독관이 언제 오는지 묻는다.", "감독관에게는 안경만이 아니라, 시험 중에 도현이 문제를 어떻게 읽었는지도 묻는다."] },
    { id: "q_ded", text: "미끼와 두뇌를 한 문장씩 맞춘다", sub: "증거판(B)의 원고지에 카드를 끼운다", board: true, cards: ["I1", "I3", "I4"], when: { evidence: ["P5"] },
      hints: ["의혹 글과 감독관의 말은 어긋난다. '맞지 않는다'로 잇는다.", "감독관이 본 버릇과 연습지의 광택은 같은 동작이다. '같다'로 잇는다.", "전파는 막혀 있었다. 그런데 펜에는 글자가 떴다. 보도자료와 펜을 '맞지 않는다'로 잇는다."] },
    { id: "q_door", text: "배수정에게 추리를 보여 준다", sub: "「빛이 닿는 곳」을 내민다", cards: [], when: { flags: ["deduced_decoy", "deduced_brain"] },
      hints: ["대화에서 카드를 내밀 수 있다. 쪽지 「빛이 닿는 곳」을 내민다."] },
    { id: "q_enter", text: "12시험실로 올라간다", sub: "1층 복도 끝의 계단", cards: [], when: { flags: ["room_open"] } },
  ],

  evidence: {
    P1: own("P1"), P2: own("P2"), P4: own("P4"), P5: own("P5"), P7: own("P7"), P8: own("P8"),
    I1: own("I1"), I2: own("I2"), I4: own("I4"),
    ...PROLOGUE_CARDS,
  },
  links: {
    I0: { from: ["P9", "P3"], rel: "time" },
    I1: ROOM.links.I1,
    I2: ROOM.links.I2,
    I3: { from: ["P6", "P10"], rel: "same" },
    I4: ROOM.links.I4,
  },
  misses: [
    { pair: ["P3", "P4"], text: "한쪽은 자랑하고 한쪽은 의심한다. 하지만 둘 다 같은 성적표를 보고 있다. 어긋나는 데가 없다." },
    { pair: ["P7", "P8"], text: "안경과 펜은 같은 필통에서 나왔다. 선으로 잇기보다 겹쳐 봐야 한다. 소지품(I)에서 펜을 들고 안경 너머로 본다." },
    { pair: ["P5", "P7"], text: "감독관의 말과 실물은 같은 것을 말한다. 쪽지가 되는 것은 '의심'과 어긋나는 쪽이다. 의혹 글과 잇는다." },
    { pair: ["P6", "P8"], text: "버릇과 펜. 가깝다. 하지만 '긁어 읽었다'는 것을 보여 주는 것은 연습지다." },
    { pair: ["P9", "P10"], text: "성적과 연습지. 둘 사이를 이어 줄 말이 아직 없다." },
    { pair: ["P1", "P4"], text: "기사와 의혹 글은 서로를 모른다." },
    { pair: ["P11", "P13"], text: "둘 다 새벽의 일이지만 날도 곳도 다르다." },
  ],
  deductions: [
    {
      id: "decoy", no: "①", title: "의혹의 과녁", when: { evidence: ["P4", "P7"] }, wrongMinutes: 30,
      parts: ["사람들은 ", { slot: "what" }, "을 의심했다. 하지만 그것은 ", { slot: "who" }, " 통과시킨 것이다. 눈길을 끌려고 쓴 미끼다."],
      slots: {
        what: { label: "무엇", accept: { P7: "뿔테 안경", P4: "뿔테 안경" }, near: { P8: "펜은 아무도 의심하지 않았다. 사람들이 손가락질한 것을 넣는다.", P3: "성적은 의심의 까닭이다. 사람들이 '이것으로 했다'고 짚은 물건을 넣는다." }, miss: "여기에는 사람들이 의심한 물건이 들어간다." },
        who: { label: "누가", accept: { I1: "감독관이 직접 검사해", P5: "감독관 배수정이 직접 검사해" }, near: { P7: "실물은 회로가 없다는 것까지만 말한다. 누가 통과시켰는지를 넣는다.", P11: "경비원은 버리는 것을 봤을 뿐이다.", P6: "그것은 펜 이야기다. 안경을 검사한 이야기를 넣는다." }, miss: "여기에는 그것을 검사한 사람의 말이 들어간다." },
      },
      effect: { flags: ["deduced_decoy"] },
    },
    {
      id: "gap", no: "②", title: "기사의 틈", when: { evidence: ["P1", "P2"] }, wrongMinutes: 30,
      parts: ["기사는 ", { slot: "said" }, "만 말했다. ", { slot: "unsaid" }, "은 아직 아무도 확인하지 않았다."],
      slots: {
        said: { label: "말한 것", accept: { P1: "'시험 전'" }, near: { P2: "보도자료는 둘 다 말했다. 하나만 말한 쪽을 넣는다.", I2: "그 쪽지는 사라진 말을 짚은 것이다. 둘째 칸에 들어간다." }, miss: "여기에는 기사가 들어간다." },
        unsaid: { label: "말하지 않은 것", accept: { I2: "'시험 중'" }, near: { P2: "보도자료에는 그 말이 있다. 기사에서 그것이 사라졌다는 쪽지를 넣는다. 판에서 보도자료와 기사를 '원문'으로 잇는다.", P1: "기사는 첫 칸에 들어간다." }, miss: "여기에는 기사가 지운 말을 짚은 쪽지가 들어간다." },
      },
      effect: { flags: ["deduced_gap"] },
    },
    {
      id: "brain", no: "③", title: "두뇌는 어디에", when: { evidence: ["P8"] }, wrongMinutes: 30,
      parts: ["도현은 ", { slot: "eye" }, "으로 문제를 읽었고, 답은 펜 밖에서 왔다. 전파는 막혀 있었으니 그 두뇌는 ", { slot: "where" }, " 안에 있다."],
      slots: {
        eye: { label: "무엇으로", accept: { I3: "펜" }, near: { P6: "버릇을 본 사람의 말이다. 그 버릇이 무슨 동작인지 밝힌 쪽지를 넣는다.", P10: "광택 줄은 흔적이다. 감독관이 본 것과 이어야 '읽었다'가 된다.", P8: "펜은 맞다. 하지만 '읽었다'는 것을 보여 주는 쪽지를 넣는다." }, miss: "여기에는 도현이 문제를 어떻게 읽었는지 밝힌 쪽지가 들어간다." },
        where: { label: "어디", accept: { I4: "빛이 닿는 곳, 시험실" }, near: { P2: "전파가 막혔다는 것까지다. 그런데도 펜이 답을 받았다는 것과 이어야 한다.", P8: "펜에 글자가 뜬다는 것까지다. 전파가 막혀 있었다는 것과 이어야 한다.", P13: "점검 일정은 다음 장의 일이다." }, miss: "여기에는 두뇌가 어디 있는지 가리키는 쪽지가 들어간다." },
      },
      effect: { flags: ["deduced_brain"] },
    },
  ],
  timeline: { ...ROOM.timeline, bands: [], marks: [{ at: at(SAT, 5), label: "재점검 예정", when: { evidence: ["P13"] } }] },

  people: [
    { id: "dohyeon", name: "한도현", role: "재수생 · 가람아파트 107동 103호", where: "아직 만나지 못했다.", when: { evidence: ["P3"] },
      lines: ["작년 5·6·5·4·5. 올해 가채점은 전 과목 1등급, 수학 하나를 틀렸다.",
        { text: "9월 모의고사는 국어 5, 수학 5, 영어 4였다.", when: { evidence: ["P9"] } },
        { text: "수능 다음 날 새벽 6시 10분에 새 필통을 통째로 버렸다.", when: { evidence: ["P11"] } },
        { text: "시험장은 목원고 12시험실, 24번 자리.", when: { flags: ["know_seat"] } },
        { text: "연습지의 여백이 비어 있다. 풀지 않고 긁었다.", when: { evidence: ["P10"] } }] },
    { id: "mother", name: "도현의 어머니", role: "103호", where: "문을 열어 주지 않는다.", when: { flags: ["met_mother"] }, lines: ["\"우리 애는 밤새 공부했어요. 일 년 내내요.\""] },
    { id: "guard", npc: "guard", where: "가람아파트 107동 경비실.", when: { any: [{ talked: "guard" }, { evidence: ["P11"] }] }, lines: ["버려진 필통을 아까워서 주워 두었다."] },
    { id: "tutor", npc: "tutor", where: "서로재수학원 상담실.", when: { any: [{ talked: "tutor" }, { evidence: ["P9"] }] }, lines: ["도현의 성적을 숫자로 기억한다. 홍보 글은 말렸다고 한다."] },
    { id: "chief", npc: "chief", where: "목원고 행정실 민원 창구.", when: { talked: "chief" }, lines: ["3층 시험실 구역의 열쇠를 갖고 있다. 규정에 없는 것은 하지 않는다."] },
    { id: "bae", npc: "bae", where: "금요일 오후 3시에 목원고 교무실로 온다.", when: { any: [{ flags: ["know_bae_time"] }, { talked: "bae" }] },
      lines: ["12시험실의 감독관. 다른 학교 국어 교사.", { text: "도현의 안경을 직접 검사해 통과시켰다. 그 일이 마음에 걸려 있다.", when: { evidence: ["P5"] } }, { text: "수업이 끝나면 12시험실을 열어 주기로 했다.", when: { flags: ["room_open"] } }] },
  ],
  laws: { note: "찍기 전에는 세 번 읽어라", known: [] },
  items: {
    pen: { title: "컴퓨터용 사인펜", hint: "필통에서 나온 것. 뒤 끝이 이상하다", inspect: "pen", evidence: "P8" }, // 아직 무엇인지 모른다. 제1장에서는 '개조된 사인펜'이 된다
    glasses: { title: "뿔테 안경", inspect: "glasses", evidence: "P7" },
  },
  inspects: INSPECTS,
  triggers: [
    { id: "leads", when: { evidence: ["P3", "P4"] }, caption: ["의혹 글의 댓글에 지명이 셋 나온다. 서로재수학원, 가람아파트 107동, 목원고.", "셋 다 강 건너 목동이다. 노트북을 덮고 옥상의 계단실로 나선다."], effect: {} },
    { id: "decoded", when: { evidence: ["P8"] }, caption: ["왼쪽 알에만 얇은 필름이 붙어 있었다. 안경은 답을 보는 창이고, 펜은 답을 받는 물건이다.", "그런데 어제 시험장에는 전파 차단기가 돌고 있었다."], effect: {} },
    { id: "agreed", when: { flags: ["room_open"] }, caption: ["배수정이 보고서를 덮는다. \"4시 50분에 수업이 끝나요. 그때 3층으로 가요.\"", "복도 끝 계단으로 간다."], effect: {} },
  ],
  keysNote: "살펴보기와 대화, 장소를 옮기는 데에는 게임 속 시간이 든다. 수첩과 증거판을 펼친 동안 시계는 멈춘다.",
};

CASE.cast = CAST;
CASE.allSpots = SITES.flatMap((s) => s.spots);

// 장소 하나의 정의 = 사건이 함께 쓰는 것 + 그 장소의 것
const blockoutOf = (key) => `/assets/3d/sites/prologue_${key}_blockout.glb`;
// 사실화한 공간과 구운 조명. range는 tools/3d/build_prologue_real.py의 BAKE와 같아야 한다 (해의 방향·색·세기는 위 light.sun).
// probes: 가구와 인물이 받을 빛을 찍는 자리. 첫째가 바깥(기본)이고, 나머지는 바닥면의 상자 [minX, minZ, maxX, maxZ] 안을 맡는다 (three.js 좌표).
const lightmapOf = (key, more = {}) => ({
  meshes: ["static"], exposure: 1.0, nightGain: 0.35, ...more,
  maps: Object.fromEntries(["lamp", "sky", "sun"].map((k) => [k, { url: `/assets/3d/sites/prologue_${key}_lm_${k}.jpg`, range: k === "sun" ? 0.45 : 0.8, ...(more.gain?.[k] ? { gain: more.gain[k] } : {}) }])),
});
const REAL = {
  rooftop: lightmapOf("rooftop", { exposure: 0.8, probes: [{ at: [-1, 1.4, -5] }, { at: [0, 1.3, 0], box: [-2.2, -1.7, 2.2, 1.7] }] }),
  gate: lightmapOf("gate", { exposure: 0.9, gain: { sky: 1.8, lamp: 1.3 }, probes: [{ at: [0, 1.5, 6] }, { at: [0, 1.4, 1.4], box: [-9, 0.2, 9, 2.6] }, { at: [-5.7, 1.4, -2.6], box: [-9, -5, -2.5, 0.2] },
    { at: [1.5, 1.4, -2.2], box: [-2.5, -5, 5.5, 0.2] }, { at: [7.2, 1.4, -0.6], box: [5.5, -5, 9, 0.2] }] }),
  apt: lightmapOf("apt", { exposure: 0.95, gain: { sky: 3.0 }, probes: [{ at: [0, 1.5, 3] }, { at: [0, 1.4, -5.5], box: [-2.5, -8, 2.5, -3] }, { at: [-5.15, 1.3, -0.3], box: [-6.5, -1.6, -3.8, 1.0] }] }),
  academy: lightmapOf("academy", { exposure: 1.0, gain: { lamp: 1.6 }, probes: [{ at: [0, 1.4, 2] }, { at: [-1.65, 1.5, -3.75], box: [-4, -7.5, 1, 0] }, { at: [2.5, 1.4, -1.0], box: [1, -4, 4, 0] }] }),
};
export const PROLOGUE_SITES = Object.fromEntries(SITES.map((s) => [s.id, {
  ...CASE, ...s,
  model: REAL[s.key] ? `/assets/3d/sites/prologue_${s.key}.glb` : null, blockout: blockoutOf(s.key), // 사실화 전의 장소는 model이 비어 있다
  ...(REAL[s.key] ? { lightmap: REAL[s.key] } : {}),
  start: { ...CASE.start, spawn: s.spawn },
}]));
export const PROLOGUE = { id: "prologue", title: CASE.caseTitle, first: "prologue_rooftop", sites: SITES.map((s) => s.id), def: CASE };
