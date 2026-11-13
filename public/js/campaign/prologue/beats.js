// 프롤로그의 비트 — 도입 → 발밑의 기사 → 밤이 지나간다 → 한 문장 → 어제와 다른 아침 → 문자
import { minuteOfDay } from "../../core/util.js";
import { EV, EVICT } from "./scene.js";

const ev = (g) => g.world.events[EV];
const myDecree = (g) => g.canon.list.find((c) => c.by === "player" && c.ev === EV);

export const BEATS = [
  {
    id: "p0_intro",
    async enter(api, g) {
      g.campaign.flags.quietWorld = true;
      await api.cutscene([
        { bg: "office_night", music: "quiet", wait: 600 },
        { title: { over: "프롤로그", main: "첫 문장" } },
        { text: "2031년 3월, 서울 을지로. 비가 인쇄골목의 셔터를 두드린다." },
        { text: "석 달 전, 당신은 한성일보에서 정리해고 통보를 받았다. 열두 해를 일한 회사였다." },
        { text: "퇴직금으로 인쇄소 건물 옥탑방을 얻고, 노트북 한 대로 매체를 등록했다. 이름은 「{outlet}」. 유료 구독자 열두 명." },
        { text: "오늘도 조회수는 세 자리를 넘지 못했다." },
        { sfx: "stamp", text: "쿵, 쿵. — 택배요. 문 앞에 두고 갑니다." },
        { bg: "parcel", text: "보낸 사람 칸에 익숙한 이름이 적혀 있다. 문정호. 수습 시절 당신의 원고를 붉은 색연필로 난도질하던, 한성일보의 전 교열부장." },
        { text: "그 이름 앞에는 한 글자가 더 붙어 있다. 故." },
        { text: "부고는 지난주에 받았다. 장례식장에서 당신은 육개장을 반도 먹지 못했다." },
        { text: "상자 안에는 쪽빛 천에 싸인 낡은 나무 도장 하나, 인주통 하나, 그리고 접힌 쪽지." },
        { who: "문정호의 쪽지", portrait: "mun", text: "「{reporter}에게. 기자는 사실을 적는다. 이 도장은 적힌 것을 사실로 만든다. 순서가 뒤집힌 물건이다.」" },
        { who: "문정호의 쪽지", portrait: "mun", text: "「쓸 일이 없기를 바란다. 그래도 네가 갖고 있어야 한다. 찍기 전에는 세 번 읽어라. — 文」" },
        { text: "도장 면에는 두 글자가 새겨져 있다. 記定. 사전에 없는 말이다." },
        { text: "교열부장다운 농담이라고, 당신은 생각했다. 도장을 서랍에 넣고 잠을 청했다." },
        { bg: "print_alley", music: "game", text: "이튿날 아침. 골목이 소란하다. 아래층 인쇄소 셔터마다 같은 종이가 붙어 있다." },
        { text: "퇴거 통보서. 재개발이다. 당신의 옥탑방이 얹힌 이 골목 전체가 대상이다." },
        { text: "기삿거리는 멀리 있지 않다. 지금 발밑에 있다." },
      ]);
      api.spawn(EVICT);
      api.feed("lead", "아래층 인쇄소들에 퇴거 통보서가 붙었다.", { ev: EV });
    },
  },
  {
    id: "p1_first",
    objective: {
      title: "발밑의 기사",
      hint: (g) => {
        const e = ev(g);
        if (!e?.seen) return "지도 위 서울의 붉은 「定」 표시를 누르거나, 왼쪽 「단서」 목록에서 사건을 연다.";
        if (!e.deskDone) return "오른쪽 패널의 「자료 조사」를 누른다. 취재 행동에는 게임 속 시간이 든다.";
        if (!e.fieldDone) return "「현장 취재」로 골목을 직접 본다. 지금 서울에 있으니 바로 할 수 있다.";
        if (!e.sources.some((s) => s.turns >= 1)) return "취재원 옆의 「인터뷰」를 누르고 질문을 직접 입력한다. 예: \"퇴거 통보는 언제 받으셨어요?\"";
        return "패널 아래 「기사 쓰기」. 수첩의 사실을 눌러 본문에 옮기고, 제목과 문장을 직접 다듬어 발행한다.";
      },
      items: [
        { id: "open", text: "사건 「을지로 인쇄골목 퇴거 통보」를 연다", check: (g) => Boolean(ev(g)?.seen) },
        { id: "desk", text: "자료 조사로 공개된 사실을 확인한다", check: (g) => Boolean(ev(g)?.deskDone) },
        { id: "field", text: "현장 취재로 골목을 둘러본다", check: (g) => Boolean(ev(g)?.fieldDone) },
        { id: "talk", text: "취재원을 인터뷰한다", check: (g) => Boolean(ev(g)?.sources.some((s) => s.turns >= 1)) },
        { id: "write", text: "기사를 써서 발행한다", check: (g) => g.outlet.articles.some((a) => a.ev === EV) },
      ],
    },
    async exit(api, g) {
      await api.cutscene([
        { bg: "office_night", music: "quiet", text: "첫 기사가 나갔다." },
        { text: "조회수 숫자가 오르는 것을 지켜보다가, 당신은 책상에 엎드려 잠들었다." },
        { text: "(기사의 조회수와 광고 수익은 이틀에 걸쳐 들어온다. 시간이 흘러야 세상도, 장부도 움직인다.)" },
      ]);
      const t = g.time.min;
      const mod = minuteOfDay(t);
      g.campaign.vars.wakeAt = t + ((7 * 60 - mod + 1440) % 1440 || 1440);
      if (g.campaign.vars.wakeAt - t < 240) g.campaign.vars.wakeAt += 1440;
    },
  },
  {
    id: "p2_night",
    objective: {
      title: "밤이 지나간다",
      hint: "화면 위 ▶ 버튼이나 Space로 시간을 흘려보낸다. ▶▶▶가 가장 빠르다. 왼쪽 「기사」에서 조회수가 오르는 것을 볼 수 있다.",
      items: [{ id: "time", text: "다음 날 아침 7시까지 시간을 보낸다", check: (g) => g.time.min >= g.campaign.vars.wakeAt }],
    },
  },
  {
    id: "p3_second",
    async enter(api, g) {
      g.time.speed = 0;
      await api.cutscene([
        { bg: "print_alley", music: "game", text: "아침. 권미옥 사장의 인쇄소 앞에 굴착기 한 대가 서 있다." },
        { who: "권미옥", portrait: "kwon", text: "기사 잘 봤어, 기자 양반. 고맙긴 한데… 구청은 꿈쩍도 안 해. 다음 주 월요일이 강제 집행이래." },
        { who: "권미옥", portrait: "kwon", text: "사십 년이야. 사십 년을 여기서 종이를 찍었는데." },
        { text: "기사는 사실을 적었다. 사실은 아무것도 바꾸지 못했다." },
        { bg: "parcel", music: "tense", text: "옥탑방으로 돌아온 당신은 서랍을 열었다. 쪽빛 천, 나무 도장, 인주통." },
        { who: "문정호의 쪽지", portrait: "mun", text: "「이 도장은 적힌 것을 사실로 만든다.」" },
        { text: "죽은 사람의 농담이다. 그래도 — 손해 볼 것은 없다." },
        { text: "후속 기사를 쓰자. 그리고 한 문장에, 그 도장을 찍어 보자." },
      ]);
      g.canon.unlocked = true;
      g.canon.ink = Math.max(g.canon.ink, 12);
      api.toast("도장을 손에 넣었다. 기사 편집 화면에 「記定 도장 찍기」가 생겼다.", "canon", 6000);
    },
    objective: {
      title: "한 문장",
      hint: "사건에서 「기사 쓰기」→ 본문을 쓰고 오른쪽 「記定 도장 찍기」로 한 문장을 고른다. 바라는 일을 이미 일어난 사실처럼 써 보라. 예: \"중구청은 인쇄골목 재개발 계획을 전면 재검토하기로 했다.\"",
      items: [{ id: "stamp", text: "후속 기사의 한 문장에 記定 도장을 찍어 발행한다", check: (g) => g.outlet.articles.some((a) => a.ev === EV && a.decree) }],
    },
  },
  {
    id: "p4_morning",
    async enter(api, g) {
      const cn = myDecree(g);
      const sentence = cn?.text ?? "…";
      g.time.speed = 0;
      await api.cutscene([
        { bg: "office_night", music: "tense", text: "발행 버튼을 누르는 순간, 방 안의 공기가 한 번 접혔다 펴진 것 같았다. 착각이라고 생각했다." },
        { bg: "morning", text: "아침. 휴대전화가 먼저 울렸다." },
        { who: "박도윤 주무관", portrait: "park", text: "기자님, 어제 기사 봤습니다. 그런데 좀 의아해서요. 「{sentence}」 — 이건 원래 다들 아는 얘기잖아요." },
        { text: "당신은 되물었다. 원래 아는 얘기라니요. 언제부터요." },
        { who: "박도윤 주무관", portrait: "park", text: "언제부터라뇨. …원래 그랬죠. 새삼스럽게 단독처럼 쓰시면 저희가 곤란합니다." },
        { bg: "print_alley", text: "골목으로 내려갔다. 굴착기가 보이지 않는다. 셔터마다 붙어 있던 통보서도 사라졌다." },
        { who: "권미옥", portrait: "kwon", text: "어, 기자 양반. 뭘 그리 놀라? 「{sentence}」 — 그거야 골목 사람들 다 아는 얘기지." },
        { text: "어제 이 자리에서 사십 년을 말하며 울던 사람이다. 그 얼굴에 어제의 흔적이 없다." },
        { bg: "morning", text: "책상 위, 어젯밤 뽑아 둔 교정지. 도장을 찍은 한 문장만이 아직 붉게 젖어 있다." },
        { text: "세상이 문장을 따라 고쳐졌다. 고쳐지기 전을 기억하는 사람은 — 당신뿐이다." },
      ], { sentence });
      const kwon = ev(g)?.sources.find((s) => s.id === "kwon");
      if (kwon) {
        g.campaign.vars.kwonTurns = kwon.turns || 0;
        kwon.ended = false;
        kwon.script = "[세상의 상식]이 당신의 예전 기억보다 앞선다. 당신은 그 상식이 원래부터 그랬다고 알고 있으며, 어제까지 강제 집행을 걱정하며 울먹였던 일은 기억나지 않는다. 기자가 '어제는 달랐다'고 하면 진심으로 어리둥절해하고, 기자가 과로한 것 아니냐며 걱정한다. 다만 '그 소식을 언제 처음 들었느냐'고 물으면 대답하지 못하고 잠깐 말문이 막힌다.";
      }
    },
    objective: {
      title: "어제와 다른 아침",
      hint: "사건을 다시 열어 권미옥을 인터뷰한다. 어제 일을, 그 소식을 언제 들었는지를 물어보라.",
      items: [{
        id: "ask", text: "권미옥을 다시 만나 어제 일을 물어본다",
        check: (g) => (ev(g)?.sources.find((s) => s.id === "kwon")?.turns || 0) > (g.campaign.vars.kwonTurns ?? 0),
      }],
    },
  },
  {
    id: "p5_message",
    async enter(api, g) {
      g.time.speed = 0;
      await api.cutscene([
        { bg: "stamp_hand", music: "tense", text: "밤. 당신은 도장을 쥐고 한참을 앉아 있었다." },
        { phone: { from: "발신자 표시 없음", text: "첫 문장, 잘 읽었습니다." } },
        { phone: { text: "문 부장이 왜 하필 당신에게 그것을 보냈는지 궁금하겠지요. 아직은 묻지 마십시오." } },
        { phone: { text: "도장 밑면을 보세요." } },
        { clear: true, text: "도장을 뒤집었다. 손때 묻은 나무 밑동에 가는 글씨가 새겨져 있다." },
        { big: "三 / 七", sfx: "rift" },
        { clear: true, text: "일곱 개 가운데 세 번째." },
        { text: "나머지 여섯 개는 — 누구의 손에 있는가." },
        { bg: "warroom", music: "game", title: { over: "프롤로그 끝", main: "세계가 열렸다", sub: "이제 어디의 무엇이든 취재할 수 있다" } },
      ]);
      api.closeEvent(EV, "재개발 계획은 전면 재검토에 들어갔다");
      g.campaign.flags.quietWorld = false;
      g.campaign.flags.prologueDone = true;
      api.give({ cash: 2_000_000, ink: 6 });
      api.feed("sys", "문정호의 상자 바닥에서 봉투 하나가 나왔다. \"취재비에 보태라.\" (+₩200만)");
      api.toast("자유롭게 취재하고 매체를 키우자. 세계 곳곳에서 사건이 벌어진다.", "gold", 7000);
    },
  },
];
