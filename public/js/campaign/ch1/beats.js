// 제1장의 비트 — 균열(서울) → 빈 서가(제네바) → 모로(리옹) → 표본(나이로비) → 방해(메리디언의 도장) → 1번 도장(런던) → 환원
// 비트: enter(진입 연출) / objective(목표와 항목별 완료 조건, 상황별 힌트) / watch(매번 확인할 것) / exit(퇴장 연출)
import { emit } from "../../core/bus.js";
import { makeSeed } from "../../sim/world.js";
import { SLANDER } from "./canon.js";
import { BOX, GENEVA, LYON, NAIROBI, LONDON } from "./scenes.js";

const has = (g, ...ids) => ids.every((id) => Boolean(g.casefile.evidence[id]));
const solved = (g, id) => g.casefile.deductions[id] === true;
const at = (g, c) => g.player.loc === c && !g.player.travel;
const myArticles = (g) => g.outlet.articles.filter((a) => !a.auto).length;

export const BEATS = [
  // ── 막간: 제 이름으로 서다 ──
  {
    id: "c0_grow",
    enter(api, g) {
      g.campaign.vars.baseArticles = myArticles(g);
    },
    objective: {
      chapter: "막간", title: "제 이름으로 서다",
      hint: "세계 어디의 사건이든 다룰 수 있다. 소문 단계에서 먼저 쓰면 단독이 되고, 현장에 가야 깊이 판다. 「경영」에서 매체를 키울 수 있다.",
      items: [{ id: "arts", text: (g) => `기사 3건을 더 발행한다 (${Math.min(3, myArticles(g) - (g.campaign.vars.baseArticles ?? 0))}/3)`, check: (g) => myArticles(g) - (g.campaign.vars.baseArticles ?? 0) >= 3 }],
    },
  },
  // ── 1. 균열 ──
  {
    id: "c1_box",
    async enter(api, g) {
      g.time.speed = 0;
      await api.cutscene([
        { bg: "office_night", music: "quiet", text: "늦은 밤, 휴대전화가 울렸다." },
        { phone: { from: "권미옥 (아래층)", text: "기자 양반, 나야." } },
        { phone: { text: "문 부장님이 생전에 맡겨 둔 상자가 하나 있어. 네가 자리를 잡으면 주라고 하셨거든." } },
        { phone: { text: "요새 네 기사, 골목 사람들이 다 읽어. 이제 줘도 되겠다 싶어서. 내려와." } },
        { clear: true, bg: "printshop_box", title: { over: "제1장", main: "이미 찍힌 문장" } },
        { text: "활자 케이스 사이, 작업대 위에 종이 상자 하나가 놓여 있다. 뚜껑에 붉은 색연필로 당신의 이름이 적혀 있다." },
      ]);
      api.spawn(BOX);
      g.campaign.flags.caseOpen = true;
      api.toast("왼쪽 도크에 「사건」 파일이 열렸다. 모은 증거와 추리가 이곳에 쌓인다.", "gold", 6500);
    },
    watch(api, g) {
      const ev = g.world.events.c1_box;
      if (ev?.fieldDone && !g.campaign.vars.boxCash) {
        g.campaign.vars.boxCash = true;
        api.give({ cash: 2_500_000 });
        api.toast("상자 바닥의 봉투 — \"출장비. 제네바부터.\" (+₩250만)", "gold", 6000);
      }
    },
    objective: {
      title: "문정호의 상자",
      hint: (g) => (!has(g, "e1", "e2") ? "서울에서 사건 「문정호의 상자」를 열고 현장 취재로 상자를 살핀다." : !has(g, "e4") ? "권미옥을 인터뷰한다. '모로 보고서'가 조작이라는 걸 언제, 어디서 알게 됐는지 물어보라." : "왼쪽 「사건」 파일에서 추리를 진행한다."),
      items: [
        { id: "box", text: "상자를 살핀다 (현장 취재)", check: (g) => has(g, "e1", "e2") },
        { id: "kwon", text: "권미옥에게 '모로 보고서' 이야기를 듣는다", check: (g) => has(g, "e4") },
        { id: "ded", text: "추리 — 무엇이 이상한가", check: (g) => solved(g, "d_anomaly") },
      ],
    },
    async exit(api) {
      await api.cutscene([
        { bg: "printshop_box", music: "tense", text: "출처 없는 상식." },
        { text: "누군가 열두 해 전에, 한 문장을 찍었다. 문 부장은 그것을 알았고 — 끝내 풀지 못했다." },
        { text: "봉투의 메모는 짧았다. 「제네바부터.」 조사위원회의 최종보고서가 보관돼 있다는 곳이다." },
        { music: "game", text: "(지도에서 스위스를 눌러 이동할 수 있다. 출장에는 돈과 시간이 든다.)" },
      ]);
      api.closeEvent("c1_box", "상자는 이제 당신의 것이다");
      api.spawn(GENEVA);
    },
  },
  // ── 2. 빈 서가 ──
  {
    id: "c2_geneva",
    objective: {
      title: "빈 서가",
      hint: (g) => (!at(g, "756") ? "지도에서 스위스를 눌러 「이동」한다. 제네바의 문서보관소는 직접 가야 볼 수 있다." : !has(g, "e5", "e6", "e8") ? "사건 「국제보건환경기구 문서보관소」에서 현장 취재를 한다." : !has(g, "e7") ? "기록관 비송을 인터뷰한다. 그 보고서를 '언제, 누구에게' 받았는지, 입고 대장을 보여 달라고 하라." : "「사건」 파일에서 추리를 진행한다."),
      items: [
        { id: "go", text: "스위스 제네바로 간다", check: (g) => at(g, "756") || has(g, "e5") },
        { id: "shelf", text: "문서보관소의 서가와 보도자료를 확인한다 (현장 취재)", check: (g) => has(g, "e5", "e6", "e8") },
        { id: "bisson", text: "기록관 비송에게 입고 기록을 확인한다", check: (g) => has(g, "e7") },
        { id: "ded", text: "추리 — 세상이 그것을 '알게' 된 날", check: (g) => solved(g, "d_when") },
      ],
    },
    async exit(api) {
      await api.cutscene([
        { bg: "geneva", music: "tense", text: "3월 17일과 18일 사이. 하룻밤 사이에 세계의 기억이 바뀌었다." },
        { who: "마르그리트 비송", portrait: "bisson", text: "서른네 해 동안 저는 종이 한 장 잃어버린 적이 없습니다. 그런데 이 문서는… 처음부터 없었어요." },
        { who: "마르그리트 비송", portrait: "bisson", text: "그렇다면 저는 지금껏 무엇을 기억하고 있었던 거죠?" },
        { text: "기록관의 손이 가늘게 떨렸다. 당신은 대답하지 못했다." },
        { music: "game", text: "보고서를 쓴 사람을 만나야 한다. 이사벨 모로. 프랑스 리옹." },
      ]);
      api.closeEvent("c2_geneva", "서가는 여전히 비어 있다");
      api.spawn(LYON);
    },
  },
  // ── 3. 모로 ──
  {
    id: "c3_lyon",
    objective: {
      title: "모로",
      hint: (g) => (!at(g, "250") && !has(g, "e9") ? "프랑스로 이동한다. 모로는 리옹에 산다." : !has(g, "e9") ? "사건 「이사벨 모로를 찾아서」에서 현장 취재로 서재를 본다." : !has(g, "e10") ? "모로를 인터뷰한다. 조작했다면 '언제, 어떻게' 했는지 차분히 물어보라. 세계시보와 문정호의 이름이 문을 열어 줄 것이다." : "실험 노트에 고친 흔적이 없다는 것을 그녀에게 말해 보라. 시료를 뜬 사람의 이름이 나온다."),
      items: [
        { id: "go", text: "프랑스 리옹으로 간다", check: (g) => at(g, "250") || has(g, "e9") },
        { id: "notes", text: "모로의 서재를 본다 (현장 취재)", check: (g) => has(g, "e9") },
        { id: "moreau", text: "모로에게 '조작한 날'을 묻는다", check: (g) => has(g, "e10") },
        { id: "name", text: "시료를 채취한 사람을 알아낸다", check: (g) => has(g, "e11") },
      ],
    },
    async exit(api) {
      await api.cutscene([
        { bg: "lyon", music: "quiet", who: "이사벨 모로", portrait: "moreau", text: "열두 해 동안 저는 제가 거짓말쟁이라고 믿었어요." },
        { who: "이사벨 모로", portrait: "moreau", text: "그런데 거짓말을 한 기억이 없어요. 그게… 제일 무서웠어요." },
        { text: "당신은 수첩에 이름 하나를 적었다. 다니엘 오티에노. 케냐 나이로비." },
      ]);
      api.closeEvent("c3_lyon", "모로는 처음으로 노트의 끈을 풀었다");
      api.spawn(NAIROBI);
    },
  },
  // ── 4. 표본 ──
  {
    id: "c4_nairobi",
    watch(api, g) {
      const v = g.campaign.vars;
      if (has(g, "e13") && !v.labAt) {
        v.labAt = g.time.min + 1440;
        api.toast("시료 두 병을 나이로비 대학 분석화학연구소에 맡겼다. 결과는 24시간 뒤에 나온다.", "gold", 7000);
        api.feed("sys", "봉인 시료를 독립 연구소에 맡겼다. 결과까지 24시간.");
      }
      if (v.labAt && g.time.min >= v.labAt && !has(g, "e14")) api.evidence("e14");
    },
    objective: {
      title: "표본",
      hint: (g) => (!at(g, "404") && !has(g, "e12") ? "케냐 나이로비로 이동한다." : !has(g, "e12", "e15") ? "사건 「봉인된 시료」에서 자료 조사와 현장 취재를 한다." : !has(g, "e13") ? "오티에노를 인터뷰한다. 그는 오르비스가 보낸 사람을 의심한다. 모로 박사를 만났다는 것, 그녀의 노트 이야기를 하라." : !has(g, "e14") ? "연구소의 분석 결과를 기다린다. 시간을 흘려보내자 (그동안 다른 취재를 해도 좋다)." : "「사건」 파일에서 추리를 진행한다."),
      items: [
        { id: "go", text: "케냐 나이로비로 간다", check: (g) => at(g, "404") || has(g, "e12") },
        { id: "clinic", text: "진료소 장부와 오르비스의 주주를 확인한다 (자료 조사·현장 취재)", check: (g) => has(g, "e12", "e15") },
        { id: "otieno", text: "오티에노에게서 봉인 시료를 확인한다", check: (g) => has(g, "e13") },
        { id: "lab", text: "독립 연구소의 분석 결과를 받는다", check: (g) => has(g, "e14") },
        { id: "ded", text: "추리 — 문장이 실린 곳", check: (g) => solved(g, "d_where") },
      ],
    },
    async exit(api, g) {
      await api.cutscene([
        { bg: "nairobi", music: "tense", text: "물은 거짓말을 하지 않았다. 보고서는 진짜였다." },
        { text: "그렇다면 거짓은 '조작으로 판명됐다'는 그 한 문장이다." },
        { who: "다니엘 오티에노", portrait: "otieno", text: "열두 해야. 이 동네 사람들은 그 물을 열두 해 더 마셨어." },
        { text: "런던. 그 문장이 찍힌 곳." },
      ]);
      api.closeEvent("c4_nairobi", "시료는 연구소의 금고로 옮겨졌다");
      g.canon.list.find((c) => c.id === "cn_moro").known = true;
    },
  },
  // ── 5. 방해: 저쪽도 도장을 쥐고 있다 ──
  {
    id: "c5_attack",
    async enter(api, g) {
      g.time.speed = 0;
      const s = SLANDER(g.meta.outlet);
      await api.cutscene([
        { bg: "office_night", music: "tense", text: "런던행 표를 알아보던 밤, 구독 해지 알림이 줄지어 울렸다." },
        { text: "메리디언 일요판의 칼럼 한 편이 세계 곳곳에 번역돼 돌고 있었다. 필자는 편집국장 빅토리아 랭." },
        { paper: { mast: "THE MERIDIAN · 일요판", date: "편집국장 칼럼", title: "이름 없는 '단독'의 시대", by: "빅토리아 랭 편집국장", body: `…검증되지 않은 주장이 '탐사'라는 이름으로 유통된다. 한 예를 들자. 한국의 신생 매체 <span class="stamped">${s}</span> 독자는 이름 없는 매체의 '단독'을 경계해야 한다…` } },
        { clear: true, text: "도장을 쥔 당신의 눈에는 그 한 문장만 붉게 번져 보인다. 찍힌 문장이다." },
        { text: "저쪽도 도장을 가지고 있다. 그리고 당신이 무엇을 캐는지 안다." },
        { phone: { from: "발신자 표시 없음", text: "환원(還元)하는 법을 알려 드리죠." } },
        { phone: { text: "찍힌 문장을 토씨 하나 틀리지 않게 옮겨 적고, 찍은 자의 이름을 밝힌 다음, 당신의 도장으로 눌러 지우는 겁니다." } },
        { phone: { text: "문장과 이름. 둘 중 하나라도 틀리면 인주만 번집니다. 문 부장은 이름을 몰라서 열두 해를 보냈지요." } },
      ]);
      api.plant({
        id: "cn_slander", by: "meridian", known: true, scope: "world", mag: 3, country: "826", text: s, belief: `한국의 매체 「${g.meta.outlet}」은 오보를 상습적으로 내는 매체다.`,
        origin: { outlet: "meridian", whenText: "지난 일요일" },
        effects: [{ kind: "outlet", id: "player", attr: "cred", sign: -1, mag: 3, name: g.meta.outlet }],
        puzzle: {
          label: null, cost: 6,
          sentences: [
            { id: "s1", text: s, need: [] },
            { id: "s2", text: `「${g.meta.outlet}」의 보도는 믿을 수 없다.`, need: [] },
            { id: "s3", text: `「${g.meta.outlet}」은 가짜 뉴스를 만드는 곳이다.`, need: [] },
          ],
          stampers: [
            { id: "crane", name: "에드먼드 크레인 (메리디언 회장)", need: [] },
            { id: "lang", name: "빅토리아 랭 (메리디언 편집국장, 칼럼의 필자)", need: [] },
            { id: "desk", name: "메리디언 편집부 (이름 없음)", need: [] },
          ],
          answer: { sentence: "s1", stamper: "lang" },
          wrong: { sentence: "인주가 번졌다. 문장이 정확하지 않다. 칼럼에서 붉게 번져 보이던 문장을 다시 보라.", stamper: "인주가 번졌다. 이름이 틀렸다. 그 칼럼을 쓴 사람이 누구였는가." },
        },
      });
      g.outlet.subs *= 0.9;
      api.evidence("e16");
      api.feed("canon", `메리디언 칼럼: "${s}" — 구독 해지가 이어진다.`);
    },
    objective: {
      title: "저쪽의 도장",
      hint: "왼쪽 「記定」 장부 → 「남이 찍은 문장」 → 「환원」. 문장과 찍은 자를 정확히 골라야 한다. 인주 6이 든다 (인주는 기사가 읽히면 차오른다).",
      items: [{ id: "revert", text: "메리디언이 찍은 문장을 환원한다", check: (g) => !g.canon.list.find((c) => c.id === "cn_slander")?.active }],
    },
    async exit(api) {
      await api.cutscene([
        { bg: "office_night", music: "quiet", text: "문장이 풀렸다. 해지 알림이 멈췄다." },
        { text: "사람들은 왜 당신의 매체에 화가 났었는지조차 기억하지 못한다." },
        { text: "되돌릴 수 있다. 문장과 이름만 알면." },
        { music: "game", text: "런던으로 간다. 열두 해 묵은 문장을 풀 차례다." },
      ]);
      api.spawn(LONDON);
    },
  },
  // ── 6. 1번 도장 ──
  {
    id: "c6_london",
    objective: {
      title: "1번 도장",
      hint: (g) => (!at(g, "826") && !has(g, "e17") ? "영국 런던으로 이동한다." : !has(g, "e17", "e21") ? "사건 「3월 17일 밤의 편집국」에서 자료 조사를 한다." : !has(g, "e19") ? "전 인쇄반장 핀치를 인터뷰한다. 그는 활자 얘기를 좋아한다. 2019년 3월 17일 최종판을 물어보라." : !has(g, "e20") ? "교정쇄의 E.C.는 누구의 글씨인가. 크레인이 그날 밤 취리히에 있었다는 사실을 핀치에게 말해 보라." : "문장과 이름이 모였다. 「記定」 장부에서 열두 해 전의 문장을 환원하라. (인주 20 필요)"),
      items: [
        { id: "go", text: "영국 런던으로 간다", check: (g) => at(g, "826") || has(g, "e17") },
        { id: "desk", text: "그날의 지면과 크레인의 행적을 확인한다 (자료 조사)", check: (g) => has(g, "e17", "e21") },
        { id: "proof", text: "핀치에게서 교정쇄를 확인한다", check: (g) => has(g, "e19") },
        { id: "who", text: "그날 밤 도장을 든 사람을 알아낸다", check: (g) => has(g, "e20") },
        { id: "lang", text: "(선택) 빅토리아 랭을 만난다", optional: true, check: (g) => (g.world.events.c6_london?.sources.find((s) => s.id === "lang")?.turns || 0) >= 1 },
        { id: "revert", text: "열두 해 전의 문장을 환원한다", check: (g) => !g.canon.list.find((c) => c.id === "cn_moro")?.active },
      ],
    },
    async exit(api, g) {
      const o = g.outlet;
      await api.cutscene([
        { bg: "restoration", music: "tense", text: "문장이 풀리는 데는 하룻밤이 걸렸다." },
        { text: "아침, 세계는 열두 해 치 기억을 한꺼번에 돌려받았다." },
        { bg: "geneva", text: "제네바의 빈 서가 앞에서 한 기록관이 오래 서 있었다. 목록 카드 한 장을 뽑아, 천천히 찢었다." },
        { bg: "nairobi", text: "나이로비의 진료소 앞에는 세계의 기자들이 줄을 섰다. 오르비스의 정수 첨가제는 그날로 공급이 중단됐다." },
        { bg: "lyon", music: "quiet", who: "이사벨 모로", portrait: "moreau", text: "…기억났어요. 저는 조작하지 않았어요. 단 한 번도." },
        { bg: "meridian_office", music: "tense", who: "빅토리아 랭", portrait: "lang", text: "잘 읽었어요. 문장도, 이름도 정확하더군요." },
        { who: "빅토리아 랭", portrait: "lang", text: "하나만 물읍시다. 세계시보의 그 1면 기사 — 바이라인은 확인해 봤나요?" },
        { bg: "frontpage", text: "복원된 세계시보 아카이브. 2019년 3월 10일자 1면. 찢겨 나갔던 자리에 이름이 돌아와 있다." },
        { big: "{reporter} 기자", sfx: "rift" },
        { clear: true, text: "당신의 이름이다." },
        { text: "당신은 세계시보에서 일한 적이 없다. — 없다고, 알고 있다." },
        { text: "문 부장은 왜 하필 당신에게 도장을 보냈는가. 답은 처음부터 지면 위에 있었다." },
        { text: "누군가 당신에게도, 한 문장을 찍었다." },
        { bg: "warroom", music: "game", title: { over: "제1장 끝", main: "이미 찍힌 문장", sub: "제2장 「지워진 바이라인」에서 계속", ms: 7000 } },
      ]);
      // 세계가 되돌아간다
      const orbis = g.world.actors.ch_orbis;
      orbis.rep = 16;
      orbis.power = Math.max(30, orbis.power - 28);
      g.rivals.meridian.cred = Math.max(20, g.rivals.meridian.cred - 22);
      g.rivals.meridian.base = 56;
      const claro = g.world.agendas.g_claro;
      if (claro && !claro.resolved) {
        claro.progress = 10;
        claro.momentum = -3;
        claro.heat = 95;
      }
      const kw = g.world.agendas.ke_water;
      if (kw && !kw.resolved) {
        kw.progress = Math.max(5, kw.progress - 30);
        kw.momentum = -2.5;
      }
      for (const d of Object.values(g.world.c)) d.my = Math.min(0.5, d.my + 0.0012);
      o.subs += Math.max(1500, o.subs * 0.6);
      o.cred = Math.min(99, o.cred + 9);
      api.give({ cash: 5_000_000 });
      g.canon.lv.scope = Math.max(2, g.canon.lv.scope); // 묵은 문장을 풀며 도장의 새김이 깊어졌다
      g.canon.ink = 999; // 인주통을 가득 채운다 (상한으로 정리됨)
      api.give({ ink: 0 });
      api.closeEvent("c6_london", "메리디언은 열두 해 전의 기사를 철회했다");
      g.campaign.flags.ch1Done = true;
      emit("seed", makeSeed({ type: "hearing", country: "756", actor: "ch_orbis", sig: 5, start: 1, hintExtra: "열두 해 만에 '모로 보고서'가 조작이 아니었음이 드러났다. 오르비스 그룹의 정수 첨가제 클라로가 전 세계에서 회수되고, CEO 라스 헬빅이 청문회에 선다. 보고서의 저자 이사벨 모로는 명예를 회복했다." }));
      emit("seed", makeSeed({ type: "misreport", country: "826", sig: 4, start: 1, hintExtra: "메리디언 미디어 그룹이 2019년 3월 17일자 기사에서 '모로 보고서'를 조작으로 단정한 것이 허위로 드러났다. 편집국장 빅토리아 랭과 회장 에드먼드 크레인의 책임론이 인다." }));
      api.feed("sys", "열두 해 전의 문장이 풀렸다. 구독자와 신뢰도가 크게 올랐다. 도장의 각인 「범위」가 깊어졌고 인주통이 가득 찼다.");
      api.toast("제1장을 마쳤다. 세계는 계속된다 — 도장은 아직 여섯 개가 더 있다.", "canon", 9000);
    },
  },
];
