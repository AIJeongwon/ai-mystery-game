// 타이틀 화면 · 새 게임 · 도움말
import { hasSave, peekSave, loadGame, newGame, importSave, deleteSave } from "../core/store.js";
import { fmtDate } from "../core/util.js";
import { h, $, mount, icon, modal, sealSvg, toast, confirmDialog } from "./dom.js";
import { TIERS } from "../data/progress.js";
import { llm, checkHealth, setCode, getCode, llmReasonText } from "../llm/api.js";
import { on } from "../core/bus.js";
import { music, sfx } from "../audio.js";

let onStart = null;
let statusBound = false;
let currentSync = null;

export function showTitle(startFn) {
  onStart = startFn;
  const el = $("#screen-title");
  $("#screen-game").classList.add("hidden");
  el.classList.remove("hidden");
  const save = hasSave() ? peekSave() : null;
  const status = h("div.title-llm");
  // 공유 주소로 들어온 사람에게는 접속 코드 입력란을 보여 준다
  const syncLlm = () => {
    if (llm.online) return mount(status, h("span.llm-dot.on"), `인물 연기·세계 연출: ${llm.model} 연결됨`);
    if (llm.remote && (llm.needCode || llm.reason === "locked")) {
      const input = h("input.input.code-input", { placeholder: "접속 코드", maxLength: 32, value: getCode(), autocomplete: "off", spellcheck: "false" });
      const submit = async () => {
        if (!setCode(input.value.trim())) return input.focus();
        btn.disabled = true;
        await checkHealth();
        if (llm.online) {
          sfx("good");
          toast("접속 코드가 확인됐다. AI가 인물을 연기한다.", "good");
        } else sfx("bad");
      };
      const btn = h("button.btn.small", { onclick: submit }, "확인");
      input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
      return mount(status, h("div.code-box", h("div.code-row", h("span.llm-dot"), input, btn), h("div.code-note", llmReasonText())));
    }
    mount(status, h("span.llm-dot"), llm.remote ? llmReasonText() : "LLM 미연결 — 규칙 기반 모드로 실행됩니다 (.env의 API 키 확인)");
  };
  syncLlm();
  if (!statusBound) {
    statusBound = true;
    on("llm:status", () => !$("#screen-title").classList.contains("hidden") && currentSync?.());
  }
  currentSync = syncLlm;
  mount(el,
    h("div.title-bg"),
    h("div.title-shade"),
    h("div.title-box",
      h("div.title-seal", { html: sealSvg(92) }),
      h("h1.title-ko", "기정사실"),
      h("div.title-hanja", "記 定 事 實"),
      h("p.title-tag", "쓰는 대로, 세상은 그렇게 안다."),
      h("div.title-menu",
        save ? h("button.btn.primary.title-btn", { onclick: () => cont() }, icon("play", 16), "이어하기", h("span.sub", `${save.outlet} · ${fmtDate(save.min, { short: true })} · ${TIERS[save.tier - 1].name}`)) : null,
        h("button.btn.title-btn", { class: save ? "" : "primary", onclick: () => openNewGame(Boolean(save)) }, icon("pen", 16), "새로 시작"),
        h("button.btn.ghost.title-btn", { onclick: () => loadFile() }, icon("doc", 16), "세이브 파일 불러오기"),
        h("button.btn.ghost.title-btn", { onclick: () => openHelp() }, icon("info", 16), "도움말")),
      status),
    h("div.title-foot", "이 게임에 나오는 인물·기업·기관·언론사와 사건은 모두 허구이며, 실제와 관련이 없습니다."),
  );
  music("title");
}

function cont() {
  const g = loadGame();
  if (!g) return toast("세이브를 읽지 못했다. 버전이 맞지 않을 수 있다.", "bad");
  sfx("stamp");
  onStart(g, false);
}
function loadFile() {
  const inp = h("input", { type: "file", accept: ".json,application/json" });
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const g = importSave(await f.text());
      g.time.speed = 0;
      onStart(g, false);
    } catch (e) {
      toast(`불러오지 못했다: ${e.message}`, "bad");
    }
  };
  inp.click();
}

function openNewGame(hasOld) {
  const name = h("input.input", { value: "한서진", maxLength: 8, placeholder: "기자 이름" });
  const outlet = h("input.input", { value: "새벽신문", maxLength: 10, placeholder: "매체 이름" });
  const skip = h("input", { type: "checkbox" });
  modal({
    title: "새로 시작", eyebrow: "기자 수첩 첫 장", cls: "small", holdClock: false,
    body: h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } },
      h("div.field", h("label", "당신의 이름"), name),
      h("div.field", h("label", "당신이 세운 매체의 이름"), outlet),
      h("label.row", { style: { fontSize: "13px", color: "var(--text-2)", cursor: "pointer" } }, skip, "프롤로그 건너뛰기 (이미 해 본 경우)"),
      hasOld ? h("div.red", { style: { fontSize: "12.5px" } }, "새로 시작하면 기존 저장이 덮어씌워진다.") : null),
    buttons: [
      { label: "취소", ghost: true },
      {
        label: "시작", primary: true, onclick: async () => {
          const r = name.value.trim(), o = outlet.value.trim();
          if (!r || !o) return toast("이름을 모두 적어야 한다.", "info"), false;
          if (hasOld && !(await confirmDialog("기존 저장을 지우고 새로 시작합니까?", { danger: true, yes: "새로 시작" }))) return false;
          deleteSave();
          sfx("stamp");
          onStart(newGame({ reporter: r, outlet: o, skipPrologue: skip.checked }), true);
        },
      },
    ],
  });
  setTimeout(() => name.select(), 100);
}

export function openHelp() {
  const sec = (title, lines) => h("div.sect", h("h4", title), h("div", { style: { fontSize: "13.5px", lineHeight: 1.75, color: "#cfd7e3" } }, lines.map((l) => h("div", `· ${l}`))));
  modal({
    title: "도움말", eyebrow: "기정사실(記定事實)", cls: "wide", holdClock: Boolean($("#screen-title").classList.contains("hidden")),
    body: h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } },
      sec("기자의 하루", [
        "세계지도 위에 사건이 떠오른다. 표시를 누르면 오른쪽에 사건이 열린다.",
        "자료 조사 → 현장 취재 → 인터뷰 → 심층 추적 순으로 사실을 모아 「취재 수첩」을 채운다.",
        "인터뷰 상대는 AI가 연기한다. 질문을 직접 입력하라. 공감·근거·익명 약속은 입을 열게 하고, 넘겨짚기는 닫게 한다.",
        "'전언'은 한 사람에게만 들은 미확인 사실이다. 두 사람에게 듣거나 문서로 확인하면 '확인'이 된다. 거짓 소문도 섞여 있다.",
        "기사는 직접 쓴다. 깊은 사실을, 남보다 먼저, 정확하게 쓸수록 많이 읽히고 신뢰가 오른다.",
      ]),
      sec("매체 경영", [
        "수익은 광고(조회수), 플랫폼 정산(조회수), 구독료(자정 정산) 세 갈래다.",
        "신뢰도는 정확한 보도로 오르고, 오보·과장으로 떨어진다. 오보는 사건이 끝날 때 드러난다.",
        "구독자와 신뢰도를 모아 등급을 올리면 기자를 고용하고 해외 지국을 열 수 있다.",
        "지국이 있는 나라에서는 소문 단계의 사건이 들어오고, 기사가 현지 독자에게 닿는다.",
        "경쟁 언론사도 같은 사건을 쫓는다. 먼저, 더 깊이 쓴 쪽이 '단독'을 가져간다.",
      ]),
      sec("記定 — 문장을 사실로", [
        "기사 속 한 문장에 도장을 찍으면, 발행되는 순간 그 문장은 세상 모두가 원래 알던 상식이 된다.",
        "도장은 인주를 먹는다. 인주는 기사가 읽힐수록 차오른다.",
        "문장이 닿는 범위·세기·지속 시간은 도장의 '각인'에 달렸다. 「記定」 장부에서 인주로 강화한다.",
        "왜곡이 쌓이면 사람들의 기억에 '잔향'이 남는다. 그리고 도장은 당신만 가진 것이 아니다.",
      ]),
      sec("조작", ["Space 일시정지/재개 · 1·2·3 속도 · 마우스 휠 확대/축소 · 끌어서 이동 · Esc 닫기", "게임은 자정마다 자동 저장된다. 메뉴에서 직접 저장할 수 있다."])),
    buttons: [{ label: "닫기", primary: true }],
  });
}

export function hideTitle() {
  $("#screen-title").classList.add("hidden");
}
