# 기술 구조

코드가 어디에 있고, 무엇을 더할 때 어디를 고치는지 적습니다. 검사 방법은 [검증](testing.md), 서버는 [서버와 공유](server.md)에 있습니다.

## 원칙

1. **내용과 규칙을 다른 파일에 둡니다.** 사건 유형·의제·행위자·캠페인의 장은 데이터(`data/`, `campaign/<장>/`)이고, 그것을 굴리는 규칙은 `sim/`에 있습니다.
2. **파일 하나는 한 가지 일만 합니다.** 두 사람이 다른 일을 하면 다른 파일을 고치게 됩니다.
3. **늘리는 자리는 등록으로 열어 둡니다.** 사건 유형·LLM 작업·장·서랍은 파일을 더하고 목록에 한 줄을 넣습니다.
4. **규칙 엔진이 수치를 정하고 LLM은 말을 제안합니다.** 모든 LLM 호출에는 규칙 기반 대안이 있습니다([LLM 연출](../design/llm.md)).

## 기술 스택

| 층 | 선택 |
|---|---|
| 서버 | Node.js 20.12 이상, 표준 `node:http`. 프레임워크와 번들러 없음. LLM은 `@anthropic-ai/sdk`로 `claude-haiku-5-5`, effort `low`만 부름(서버에서 고정) |
| 클라이언트 | 브라우저 기본 ES 모듈(빌드 단계 없음). 지도는 d3, topojson-client, world-atlas(50m)를 Canvas 2D에 그림 |
| 글꼴·소리·저장 | Pretendard, Noto Serif KR(`node_modules`에서 `/vendor/*`로 내보냄), WebAudio 합성, 브라우저 `localStorage` |
| 시험·린트 | Node 내장 시험 러너(`node --test`), ESLint 9 |

쓰는 오픈소스(버전은 `package-lock.json`에 고정):

| 패키지 | 버전 | 라이선스 | 쓰는 곳 |
|---|---|---|---|
| d3 | 7.9.2 | ISC | 세계지도 투영과 그리기 |
| topojson-client | 3.1.0 | ISC | 지도 데이터 해석 |
| world-atlas | 2.0.2 | ISC | 나라 경계 데이터 |
| pretendard | 1.3.9 | OFL-1.1 | 화면 글꼴 |
| @fontsource/noto-serif-kr | 5.3.1 | OFL-1.1 | 지면·내레이션 글꼴 |
| @anthropic-ai/sdk | 1.7.0 | Apache-2.0 | 서버의 LLM 호출 |
| eslint, globals | 9.39.5, 17.14.0 | MIT | 린트(개발용) |

## 폴더

```
server/        index(진입점) config tasks static access limits llm health http
public/js/
  main.js      부팅, 게임 시작, 개발용 손잡이          audio.js  효과음·음악 합성
  core/        store(게임 상태 G, 저장)  bus(이벤트)  util(씨앗 난수, 시간, 문자열)
  data/        내용과 수치. 다른 영역을 가져오지 않는 순수 정의
               countries categories outlets cities actors agendas names labels progress
    events/    사건 유형 40가지. 분야별 파일을 index.js가 EVENT_TYPES로 모음
  sim/         규칙 엔진. 화면을 모름
               clock director chronicle rivals canon lore
    world/     query actors feed seeds narrative events schedule tick
    press/     base notebook investigate trust travel money reach judge publish
               readership aftermath growth bureaus staff settlement draft
  llm/         api(호출, 재시도, 연결 상태, 접속 코드)  world-rules(모든 프롬프트의 세계 규칙)
    tasks/     작업별 스키마와 요청 조립. limits.js에 작업 목록과 출력 상한
  campaign/    engine(비트 진행, 목표 평가)  chapters(장 등록. 목록 순서 = 진행 순서)
    prologue/  ch1/    장마다 폴더 하나
  ui/          dom map hud drawers panels manage detail interview editor cutscene casefile title
tests/         시험. LLM을 부르지 않음
tools/         regression balance probe / share share-check guest-preview / process-art
```

### 묶음 파일과 가져오기 규칙

`sim/world.js`, `sim/press.js`, `data/world.js`, `data/templates.js`, `llm/prompts.js`, `campaign/chapter1.js`, `campaign/prologue.js`는 폴더 안의 파일을 모아 다시 내보내기만 합니다.

- 다른 영역에서는 묶음 파일을 가져옵니다(`import { publish } from "../sim/press.js"`). **같은 폴더 안에서는 옆 파일을 직접 가져옵니다**(`sim/press/publish.js`에서 `import { notes } from "./notebook.js"`). 묶음 파일을 가져오면 서로 물립니다.
- 있는 파일에 함수를 더할 때는 `export`만 붙이면 됩니다(묶음 파일은 `export *`). 폴더에 파일을 새로 만들면 묶음 파일에 한 줄을 더합니다.
- `data`는 다른 영역을 가져오지 않습니다. `sim`과 장 정의(`campaign/<장>/`)는 `ui`를 가져오지 않고, 화면에 알릴 일은 이벤트로 내보냅니다. 그래서 규칙 엔진은 Node에서 그대로 돌고, 시험·밸런스 봇·회귀 도구가 이 성질에 기대고 있습니다. 화면을 아는 캠페인 코드는 `campaign/engine.js`뿐입니다.

## 게임 상태 G

모든 상태는 객체 하나(`core/store.js`의 `G`)에 있고 통째로 JSON으로 저장됩니다. `G.outlet.cash`처럼 직접 읽고 씁니다. 게임을 바꿔 끼울 때는 `setG(g)`를 씁니다(난수와 일련번호를 함께 묶음).

| 가지 | 내용 |
|---|---|
| `v`, `rng`, `ids`, `meta` | 세이브 형식 버전(지금 1), 난수 상태, 일련번호, 기자·매체 이름 |
| `time` | `min`(시작부터 흐른 분), 속도 |
| `player` | 위치, 이동 상태, 경험치, 역량 |
| `outlet` | 자금, 구독, 신뢰도, 등급, 설비, 직원, 지국, 기사, 장부 |
| `world` | `c`(나라별 움직이는 값), `actors`, `agendas`, `schedule`, `events`(사실·취재원·대화 포함), `trends`, `feed`, `history` |
| `rivals` | 경쟁사별 신뢰도·기사 수·단독 수 |
| `canon` | 기정문 목록, 인주, 각인 단계, 왜곡, 잠금 여부 |
| `notebook`, `casefile` | 사건별 수첩 / 확보한 증거, 푼 추리, 오답 수 |
| `campaign` | 지금 장과 비트, 깃발, 목표, 변수 |

**G의 모양을 바꾸면 옛 세이브가 깨집니다.** 변환 절차가 아직 없습니다([알려진 문제](../roadmap/known-issues.md) A-6).

저장 열쇠는 `gijeongsasil.save.v1`(세이브), `gijeongsasil.code`(접속 코드), `gijeongsasil.audio`(음량)입니다. 자정마다, 비트에 들어가고 나올 때, 메뉴의 "지금 저장", 창을 닫을 때 저장합니다. 저장 전에 종결 후 사흘이 지난 일반 사건과 그 수첩을 지우고 와이어 160건·기사 120건·장부 60일로 자릅니다. 세이브는 한 개이고 JSON 파일로 내보내고 불러올 수 있습니다.

## 이벤트와 틱

모듈 사이의 통지는 `core/bus.js`의 `on(이름, 함수)`와 `emit(이름, …값)`으로 합니다.

| 묶음 | 이벤트 |
|---|---|
| 시계 | `tick`(30분), `hour`, `day`, `day:settled`, `time`, `skip`, `speed`, `hold` |
| 세계 | `seed`, `need:event`, `event:new`, `event:stage`, `event:dev`, `event:closed`, `lead:new`, `feed`, `agenda:resolved` |
| 취재 | `investigate`, `fact:new`, `fact:up`, `fact:debunked`, `interview:turn`, `interview:end`, `travel:start`, `travel:end`, `event:opened` |
| 발행·경영 | `article:published`, `fallout`, `vindicated`, `cash`, `levelup`, `skill`, `tier`, `upgrade`, `staff`, `bureau` |
| 記定 | `canon:enacted`, `canon:planted`, `canon:ended`, `canon:reverted`, `canon:upgrade` |
| 캠페인 | `objective`, `evidence`, `evidence:found`, `deduction`, `casefile` |
| LLM·화면 | `llm:status`, `llm:busy`, `llm:lost` / `ui:*`, `map:*`, `side:changed`, `editor:open` |

- `sim/clock.js`의 `advance(분)`은 30분 경계마다 `worldTick → directorTick → rivalsTick → pressTick`을 부릅니다. 정시에는 `worldHourly → rivalsHourly → pressHourly → canonHourly → chronicleHourly → emit("hour")`, 자정에는 `dailySettlement → emit("day") → saveGame()`을 더 부르고, 끝에 `emit("tick")`을 냅니다.
- 화면에서는 `requestAnimationFrame`이 실제 시간을 게임 분으로 바꿔 `advance`를 부릅니다. 탭이 가려지면 게임 시계도 멈춥니다. 창이나 컷신이 열리면 `hold()`로 시계를 잡고 닫히면 `release()`로 풉니다. 취재·이동·집필은 `spend(분)`이 시계를 한꺼번에 돌립니다.
- LLM 호출은 `llm/tasks/*`(요청 조립) → `llm/api.js`의 `ask()` → `POST /api/llm` 순서입니다. `ask()`는 예외를 던지지 않고 `{ok, data}` 또는 `{ok:false, error}`를 돌려주며, 실패하면 부른 쪽이 규칙 기반 대안을 씁니다.
- 비동기 호출이 돌아왔을 때 게임이 바뀌어 있을 수 있습니다. 호출 전에 `const g = G`를 잡아 두고 돌아와서 `if (G !== g) return`으로 버립니다.

## 무엇을 더하려면 어디를 고치는가

| 하려는 일 | 고치는 곳 | 확인 |
|---|---|---|
| 사건 유형 추가 | `data/events/<분야>.js`에 항목 하나 | `npm test` (콘텐츠 검사) |
| 의제·행위자·도시·경쟁사 추가 | `data/agendas.js`, `actors.js`, `cities.js`, `outlets.js` | `npm test` |
| 설비·역량·각인 추가 | `data/progress.js`에 정의 + 효과를 읽는 규칙(`sim/press/…`, `sim/canon.js`) | `npm test`, 브라우저 |
| 취재·경영 규칙 고치기 | `sim/press/`의 해당 파일 | `npm test`. 지문이 바뀌면 기준선 갱신 |
| 세계 규칙 고치기 | `sim/world/`의 해당 파일 | 위와 같음 |
| LLM 작업 추가 | `llm/tasks/<이름>.js` + `llm/tasks/limits.js` + `llm/prompts.js` + `server/tasks.js` | `npm test`, `node tools/probe.mjs` |
| 프롬프트 고치기 | `llm/tasks/<이름>.js` | 브라우저에서 실제 응답 확인 |
| 캠페인 장 추가 | `campaign/<장>/` 폴더 + `campaign/chapters.js`에 한 줄 | `npm test` (캠페인 검사), 브라우저 |
| 서랍(도크) 추가 | `ui/drawers.js`에 한 줄 + `ui/panels.js`의 `RENDER`에 그리는 함수 | 브라우저 |
| 서버 주소(API) 추가 | `server/<이름>.js` + `server/index.js`의 분기 한 줄 | `node tools/share-check.mjs` |

**사건 유형.** 필드 설명은 `data/events/_helpers.js` 머리에 있습니다.

- 규칙 서사 틀(`fb`)은 LLM이 없을 때 쓰입니다. 빠뜨리면 규칙 모드에서 그 유형이 깨집니다(콘텐츠 검사가 잡음).
- 일정으로 잡히게 하려면 `data/agendas.js`의 `SCHEDULE_KINDS`에도 넣습니다.
- 파일 안의 항목 순서와 `index.js`의 펼치는 순서가 무작위 뽑기의 순서입니다. 유형을 더하거나 옮기면 같은 씨앗에서도 세계가 달라져 회귀 지문이 바뀝니다. 이것은 정상이고 기준선을 새로 적습니다.
- 종결 영향(`impact`)은 `stab`, `appr`, `econ`, `tens`, `rep`만 반영됩니다([알려진 문제](../roadmap/known-issues.md) A-18).

**LLM 작업.**

1. `llm/tasks/<이름>.js`에 스키마와 요청 조립 함수를 만듭니다. `task` 이름, `maxTokens: TASK_LIMITS.<이름>`을 넣고 시스템 프롬프트에 `WORLD_RULES_TEXT`를 넣습니다.
2. `llm/tasks/limits.js`의 `TASK_LIMITS`와 `server/tasks.js`의 `TASK_CAPS`에 같은 이름을 넣습니다. 서버 쪽을 빠뜨리면 공유 접속자의 호출이 거절됩니다.
3. `llm/prompts.js`에 `export * from "./tasks/<이름>.js"` 한 줄, `tests/llm-tasks.test.mjs`의 요청 목록에 한 줄을 더합니다.
4. 부르는 쪽에 규칙 기반 대안을 둡니다.

**캠페인 장.** 장이 내보내는 항목과 정할 것은 [사건 설계](../case-requirements.md)를 봅니다. 엔진과 화면에는 특정 장의 내용을 적지 않습니다.

## 코드 관례

- 주석과 화면 문구는 한국어, 식별자는 영어입니다. 들여쓰기 2칸, 줄 끝 LF, UTF-8(`.editorconfig`). 화면 요소는 `ui/dom.js`의 `h("태그.클래스", {속성}, …자식)`으로 만듭니다.
- 수치 상수는 `data/progress.js`에 모읍니다. 조회수·확률 계산의 계수 일부는 아직 `sim/press/`와 `sim/world/` 안에 있습니다.
- 무작위는 `core/util.js`의 씨앗 난수(`rand`, `chance`, `pick`)를 씁니다. 같은 씨앗이면 같은 세계가 나와야 시험과 회귀 지문이 성립합니다. `Math.random`은 `sim/canon.js` 한 군데에 남아 있습니다([알려진 문제](../roadmap/known-issues.md) A-17).
- LLM이 준 문자열은 `cleanText(문자열, 최대 길이)`로 다듬어 넣습니다.

고친 뒤에는 `npm run check`(린트, 시험, 회귀 지문)를 돌립니다. 자세한 내용은 [검증](testing.md)에 있습니다.
