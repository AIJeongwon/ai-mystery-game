# 서버와 공유

서버(`server/`)는 세 가지를 합니다. 게임 상태는 서버에 없고, 세이브는 각자의 브라우저에 있습니다.

1. `public/`의 정적 파일을 내보냅니다.
2. `/api/llm`으로 받은 요청을 Claude API에 중계합니다. 모델과 effort를 고정하고 API 키를 서버에만 둡니다.
3. 바깥(공유 주소)에서 온 요청에 접속 코드와 한도를 적용합니다.

| 파일 | 맡는 일 |
|---|---|
| `index.js`, `http.js` | 진입점(주소별로 일을 나눔), JSON 응답과 요청 본문 |
| `config.js`, `tasks.js` | 경로, `.env`, 모델, 한도 값, 토큰 단가(`PRICE`) / 바깥 접속자가 쓸 수 있는 LLM 작업과 출력 상한(`TASK_CAPS`) |
| `static.js` | `public/`과 `/vendor/*`(`node_modules` 가운데 허용한 다섯 곳: d3, topojson-client, 세계지도 데이터, 글꼴 둘) |
| `access.js`, `limits.js` | 내 PC와 바깥 접속의 구분, 접속 코드 확인과 잠금 / 하루 예산과 사람별 호출 수 집계 |
| `llm.js`, `health.js` | `/api/llm`, `/api/health` |

## 실행과 환경 변수

`npm start`(또는 `start-game.bat`)로 `http://localhost:5173`에 뜹니다. `npm run dev`는 서버 파일이 바뀌면 다시 시작합니다. 서버는 항상 `127.0.0.1`에만 묶이므로 같은 공유기의 다른 기기에서도 직접 접속할 수 없습니다. 값은 `.env`에 두고 저장소에 올리지 않습니다(이름만 적은 `.env.example`을 복사해 씀). `.env`가 없어도 서버는 뜨고 게임은 규칙 모드로 돕니다.

| 이름 | 뜻 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API 키. 서버만 읽고 브라우저로 전달되지 않음 |
| `ACCESS_CODE` | 공유 접속 코드. 없으면 바깥 접속자에게 LLM을 열지 않음 |
| `DAILY_BUDGET_USD` | 바깥 접속자 전체가 하루에 쓸 수 있는 금액(달러) |
| `PER_CLIENT_DAILY_CALLS`, `PER_CLIENT_PER_MINUTE` | 한 사람(IP)의 하루·분당 호출 수 |
| `PORT`, `USAGE_FILE` | 포트(기본 5173), 사용량 기록 파일의 위치(점검 도구가 임시 파일로 바꿔 씀) |

## API

**`GET /api/health`** 내 PC에서 부르면 LLM 사용 가능 여부, 모델, 호출 통계, 한도와 오늘 사용량을 돌려줍니다. 바깥에서 부르면 사용 가능 여부와 까닭(`reason`)만 돌려줍니다: `need_code`, `bad_code`, `locked`, `share_off`, `budget`, `quota`, `null`(사용 가능).

**`POST /api/llm`** 요청 본문은 512KB 이하의 JSON입니다. 모델과 effort는 요청으로 바꿀 수 없습니다. Claude API 호출은 동시에 8건까지이고 넘치면 줄을 섭니다. SDK는 두 번까지 다시 시도하고 90초에 포기합니다.

| 필드 | 내용 |
|---|---|
| `task`, `schema` | 작업 이름과 JSON 스키마. 바깥 접속자는 `server/tasks.js`의 여섯 작업만 쓸 수 있고 스키마가 반드시 있어야 함 |
| `system`, `messages` | 시스템 프롬프트(4만 자까지), `{role, content}` 배열(최근 40개, 각 2만 4천 자까지) |
| `maxTokens` | 출력 상한. 바깥 접속자는 작업별 상한으로, 내 PC는 16,000으로 깎임 |
| `thinking`, `cache` | `true`면 사고를 `adaptive`로(아니면 끔) / 시스템 프롬프트에 프롬프트 캐시 적용 |

| 응답 | 상태 | 본문 |
|---|---|---|
| 성공 | 200 | `{ ok: true, data, ms, stop }` |
| 모델 응답을 쓸 수 없음 | 200 | `{ ok: false, error }`: `truncated`, `bad_json`, `refusal`, `empty` |
| 요청 형식 오류 | 400 | `bad_request` |
| 접속 코드, API 키 인증 실패 | 401 | `need_code`, `bad_code`, `locked`, `share_off` / `auth` |
| 한도 | 429 | `budget`, `quota`, `rate_limit` |
| Claude 쪽 오류, 키 없음 | 502, 503 | `network`, `api_error` / `no_api_key` |

## 접속 코드와 한도

터널을 거친 요청에는 전달 헤더(`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`, `cf-ray`)가 붙습니다. 하나라도 있으면 **바깥** 접속이고, 없으면 **내 PC**입니다.

| | 내 PC | 바깥 |
|---|---|---|
| 접속 코드 | 필요 없음 | 필요 (`X-Access-Code` 헤더) |
| 한도 | 없음 | 하루 예산, 사람별 하루·분당 호출 수 |
| 작업 이름과 스키마, `/api/health` | 제한 없음, 통계와 한도 포함 | 여섯 작업만, 스키마 필수, 사용 가능 여부만 |

- 코드는 SHA-256 값을 시간 일정 비교로 견줍니다. 한 접속자가 여덟 번 틀리면 15분 동안 잠깁니다. 코드 없이 들어온 사람은 규칙 모드로 끝까지 플레이할 수 있습니다.
- 하루 예산을 넘으면 그날은 모든 바깥 접속자가(`budget`), 사람별 하루 호출 수를 넘으면 그 사람만(`quota`) 규칙 모드가 됩니다. 분당 호출 수를 넘으면 잠깐 거절되고(`rate_limit`) 클라이언트가 2.5초 뒤 한 번 다시 시도합니다.
- 금액은 응답의 토큰 수에 `PRICE`를 곱한 추정입니다. 실제 청구는 Anthropic 콘솔에서 확인합니다.
- 하루 사용량은 `server/usage.json`에 남고, 사람별 호출 수와 잠금은 메모리에만 있어 서버를 다시 켜면 0이 됩니다. 예산 확인은 호출 전에 하므로 동시에 나간 호출만큼 조금 넘을 수 있습니다([알려진 문제](../roadmap/known-issues.md) A-13, A-14).
- 사람 구분은 IP이고 접속 코드는 하나입니다. 한 사람만 막으려면 코드를 바꿔야 합니다.

## 공유 (임시 터널)

지금 동작하는 공유 방법은 내 PC에서 임시 주소를 여는 것입니다. `node tools/share.mjs`(또는 `share-game.bat`)는 `.env`에 `ACCESS_CODE`가 없으면 8자 코드를 만들어 적고, 서버를 포트 5180으로 띄운 뒤 `cloudflared`의 빠른 터널을 실행해 주소(`https://….trycloudflare.com`)와 접속 코드, 한도를 창에 보여 줍니다. 창을 닫으면 서버와 터널이 함께 꺼집니다.

- `cloudflared`는 저장소에 없습니다. [Cloudflare 공식 릴리스](https://github.com/cloudflare/cloudflared/releases/latest)에서 받아 `tools/bin/`에 두거나 시스템에 설치합니다. 둘 다 없으면 받을 곳을 안내하고 끝납니다.
- 가입이 필요 없는 대신 주소는 켤 때마다 바뀌고, 창을 닫거나 PC가 절전에 들어가면 끊깁니다. `SHARE_HIDE_CODE=1`이면 창에 코드를 표시하지 않고, `SHARE_PORT`로 포트를 바꿉니다.

| 점검 도구 | 하는 일 |
|---|---|
| `node tools/share-check.mjs` | 시험용 서버(5191)에 전달 헤더를 붙인 요청을 보내 접속 코드·한도·파일 보호 19항목을 확인. 실제 API를 열 번쯤 부름 |
| `node tools/guest-preview.mjs` | 터널 없이 손님이 보는 화면을 `http://localhost:5192`에서 보여 줌. 시험용 코드만 씀 |
| `node tools/probe.mjs` | 켜져 있는 서버에 실제 LLM 요청을 보내 응답 형식을 확인 |

컨테이너 구성과 서버 배포로 바꾸는 설계안은 [Docker 구성](docker.md)에 있습니다 **[제안]**.
