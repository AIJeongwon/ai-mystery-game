# Docker 구성과 배포

**설계안입니다. 아직 구현하지 않았습니다.** 지금 게임은 Node 서버 하나로 돌고([서버와 공유](server.md)), 이 문서는 그것을 Compose 구성으로 바꾸는 계획입니다. 구현 PR에서 실제 파일과 실행 결과로 바꿔 적습니다. Kubernetes는 쓰지 않습니다.

표시: **[제안]** 팀 합의가 필요한 안 / **[미정]** 아직 정하지 않음

## 평가 기준과 대응

| 평가 기준 ([평가 기준](../evaluation.md)) | 이 설계에서 | 제출할 때 남길 기록 |
|---|---|---|
| Compose로 컨테이너 3종 이상 | `web`, `api`, `db` (+ `cache`) | 구성 파일, `docker compose ps` |
| 컨테이너 간 통신 | `web` → `api` → `db`·`cache` | `web`을 거친 `/api/health` 응답에 `db`·`cache` 연결 상태가 나옴 |
| 볼륨 사용 | `pgdata`, `cachedata`, `webdata` | 서버에 저장 → `db` 컨테이너를 다시 만듦 → 같은 세이브를 불러옴 |

## 구성

```
 브라우저 ──▶ web ──────────▶ api ──https──▶ Claude API
             게임 파일         │
             /api/* 중계       ├──▶ db      [pgdata]
             (배포: HTTPS)     └──▶ cache   [cachedata]

 └──── front 네트워크 ────┘ └──── back 네트워크 ────┘
```

| 서비스 | 이미지 | 맡는 일 | 지금 무엇을 대신하는가 |
|---|---|---|---|
| `web` | Caddy [제안] | 게임 파일 전송, `/api/*`를 `api`로 중계, 배포 서버에서 HTTPS | `server/static.js` |
| `api` | Node.js | LLM 중계(모델·effort 고정), 접속 코드·한도, 서버 세이브, 상태 확인 | `server/`의 나머지 |
| `db` | PostgreSQL | 서버 세이브, LLM 사용 기록 | 브라우저 저장(유지하고 서버 저장을 더함), `server/usage.json` |
| `cache` | Valkey [제안] | 분당·하루 호출 수, 하루 예산, 코드 잠금 | 서버 메모리의 집계(다시 켜면 사라짐. A-14) |

- `web`을 Caddy로 적은 까닭: 배포 서버에서 HTTPS 인증서를 스스로 받고 갱신하며, 개발과 배포가 주소 값 하나만 다른 같은 설정을 씁니다. nginx로 바꾸면 인증서 도구와 갱신 작업을 따로 붙입니다.
- `cache`를 빼면 한도 집계를 `db`의 테이블로 옮깁니다. `cache`를 두는 까닭은 만료 시간이 있는 집계(1분 창, 15분 잠금)가 단순해지기 때문입니다. Redis가 아니라 Valkey인 까닭은 라이선스(BSD-3-Clause 유지)입니다.

## 통신, 네트워크, 볼륨

| 보내는 쪽 → 받는 쪽 | 무엇을 | 포트 |
|---|---|---|
| 브라우저 → `web` | 게임 파일, `/api/*` | 개발: 호스트 `127.0.0.1:5173` / 배포: 80·443 |
| `web` → `api` | `/api/health`, `/api/llm`, `/api/saves` | 3000 |
| `api` → `db` | 세이브, 사용 기록 | 5432 |
| `api` → `cache` | 호출 수·예산·잠금 | 6379 |
| `api` → Claude API | LLM 요청 | 바깥 443 |

- `web`은 `front`에만, `db`·`cache`는 `back`에만, `api`는 양쪽에 둡니다. 호스트에 여는 포트는 `web`의 것뿐입니다.
- LLM 응답은 길게는 90초가 걸립니다. `web`의 중계가 그 전에 끊지 않게 합니다.

| 볼륨 | 어디에 | 담기는 것 | 지워지면 |
|---|---|---|---|
| `pgdata` | `db`의 데이터 폴더 | 서버 세이브, LLM 사용 기록 | 서버 세이브가 사라짐(브라우저 저장은 남음) |
| `cachedata` | `cache`의 `/data` | 그날의 호출 수·예산·잠금 | 그날 한도가 처음부터 다시 세어짐 |
| `webdata` | `web`의 `/data` (배포 서버만) | HTTPS 인증서 | 다시 받음. 자주 되풀이하면 발급 제한에 걸림 |
| (개발용 연결) | `./public` → `web`, `./server` → `api` | 소스 | 다시 빌드하지 않아도 반영됨 |

`docker compose down`은 볼륨을 남깁니다. `down -v`는 볼륨을 지우므로 대상과 범위를 정한 뒤에만 씁니다.

## 접속 방식

지금 서버는 터널이 붙이는 전달 헤더로 바깥 접속을 가립니다. 이것을 설정값 하나로 바꿉니다.

| `ACCESS_MODE` | 쓰는 곳 | 동작 |
|---|---|---|
| `public` | 배포 서버 | 모든 요청에 접속 코드와 한도를 적용. 운영자도 코드를 넣고 플레이 |
| `local` | 개발용 Compose, Docker 없는 `npm start` | 코드와 한도 없이 사용 |

- 컨테이너 구성의 기본값은 `public`이고, 개발용 설정 파일에서만 `local`로 낮춥니다. 설정을 빠뜨리면 잠기는 쪽으로 넘어집니다.
- 개발용 Compose는 포트를 `127.0.0.1`에만 엽니다. `local`은 그 조건에서만 씁니다.
- 접속 코드, 하루 예산, 사람별 한도, 작업 허용 목록, 스키마 필수, 틀린 코드 잠금은 지금 규칙 그대로입니다.
- 사람 구분은 `web`이 넘겨주는 접속자 주소로 합니다. `api`는 `web`을 거치지 않고는 닿을 수 없으므로 그 값을 믿습니다.

## 서버 세이브 [제안]

브라우저 저장은 그대로 두고 서버 저장을 더합니다.

- 계정을 만들지 않습니다. 브라우저가 처음 서버에 저장할 때 무작위 **이어하기 코드**를 만들고, 서버는 그 해시만 저장합니다. 다른 기기에서는 타이틀에서 코드를 넣어 이어 합니다. 개인정보를 받지 않습니다.
- 이어하기 코드는 요청 헤더로 보냅니다. 주소에 넣지 않습니다.

| 요청 | 하는 일 |
|---|---|
| `GET /api/saves` | 칸 목록 (칸 번호, 매체 이름, 게임 속 시각, 등급, 저장 시각) |
| `GET` · `PUT` · `DELETE /api/saves/:칸` | 세이브 읽기 · 쓰기(본문은 게임 상태 JSON) · 지우기 |

| 테이블 | 열 |
|---|---|
| `saves` | `code_hash`(이어하기 코드의 SHA-256), `slot`, `format_v`, `outlet`, `game_min`, `tier`, `data`(jsonb), `updated_at`. 기본 키는 (`code_hash`, `slot`) |
| `llm_usage` | `at`, `task`, `remote`, 입력·출력·캐시 토큰, `ms`, `usd` |

테이블은 `api`가 시작할 때 없으면 만들고, 형식이 바뀌면 순서가 있는 변경 파일로 올립니다.

정하지 않은 것 [미정]: 칸 수(안: 코드 하나에 3칸), 세이브 크기 상한(크기를 잰 적이 없음. B-8), `public`에서 접속 코드를 넣은 사람만 서버에 저장하게 할지, 두 저장이 다를 때의 처리(안: 늦은 쪽을 먼저 보여 주고 고르게 함).

## 한도 집계와 고정 응답 [제안]

| 집계 | 지금 | 바뀐 뒤 (`cache`) |
|---|---|---|
| 사람별 분당 호출 수 | 메모리 | 1분 뒤 사라지는 값 |
| 사람별 하루 호출 수 | 메모리 | 날짜가 든 값. 다시 켜도 유지 |
| 하루 예산(금액) | 파일 | 날짜가 든 값 |
| 코드 실패 횟수와 잠금 | 메모리 | 15분 뒤 사라지는 값 |

`server/limits.js`의 함수 넷(`takeSlot`, `recordUsage`, `clientState`, `usageSnapshot`)만 다시 짭니다. 이미 비동기로 열려 있습니다.

**고정 응답 모드**: 키가 없으면 `api`는 LLM을 끄고 게임은 규칙 모드로 돕니다. 컨테이너 통신과 볼륨 확인은 키 없이 됩니다. LLM 응답이 필요한 검사를 위해, Claude를 부르지 않고 작업별로 정해 둔 응답을 돌려주는 모드를 둡니다. 고정 응답으로 확인한 것과 실제 모델로 확인한 것은 기록에서 구분합니다.

## 환경 변수

| 이름 | 받는 서비스 | 내용 |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api` | Claude API 키. 이미지에 넣지 않고 실행할 때 넘김 |
| `ACCESS_CODE`, `ACCESS_MODE` | `api` | 접속 코드, `public` 또는 `local` |
| `DAILY_BUDGET_USD`, `PER_CLIENT_DAILY_CALLS`, `PER_CLIENT_PER_MINUTE` | `api` | 한도 |
| `POSTGRES_PASSWORD` | `db`, `api` | DB 비밀번호 |
| `DATABASE_URL`, `CACHE_URL` | `api` | 없으면 서버 세이브를 끄고 한도를 메모리로 셈 |
| `SITE_ADDRESS` | `web` | 개발: `:8080` / 배포: 서버의 도메인 이름 |

값은 각자의 `.env`에 두고 저장소에는 이름만 적은 `.env.example`을 올립니다. `.dockerignore`에 `.env`, `node_modules/`, `tools/_raw/`, `tools/bin/`을 넣습니다. 개발할 때의 키는 팀원 각자의 것을 씁니다.

**Docker 없이도 실행됩니다.** `DATABASE_URL`과 `CACHE_URL`이 없으면 `api`는 지금처럼 동작합니다(정적 파일을 직접 내보내고, 한도는 메모리로 세고, 서버 세이브 화면은 숨김). `npm start`와 `npm run check`는 그대로 둡니다.

## 파일 배치 [제안]

```
compose.yaml                 공통: 서비스 넷, 볼륨, 네트워크
compose.override.yaml        개발용(자동 적용): 127.0.0.1 포트, 소스 연결, ACCESS_MODE=local
compose.prod.yaml            배포용: 80·443, 인증서 볼륨, 자동 재시작
deploy/web/Dockerfile        의존 패키지 설치 → public/과 지도·글꼴 파일 복사 (두 단계 빌드)
deploy/web/Caddyfile         게임 파일, /vendor, /api 중계
deploy/api/Dockerfile
deploy/db/                   테이블 변경 파일
.dockerignore
```

## 코드에서 바뀌는 곳

| 대상 | 바뀌는 내용 |
|---|---|
| `server/access.js` | 전달 헤더 판정을 `ACCESS_MODE`로 바꿈 |
| `server/limits.js` | 집계를 `cache`로 옮김 |
| `server/health.js` | `local`에서 부르면 `db`·`cache` 연결 상태를 함께 알려 줌 |
| `server/index.js`, 세이브용 새 파일 | `/api/saves` |
| `server/static.js` | Docker 없이 실행할 때만 쓰임 |
| `public/js/core/store.js`, `ui/title.js`, `ui/panels.js` | 서버 세이브 호출과 화면 |
| `package.json` | PostgreSQL·`cache` 클라이언트 추가 (라이브러리는 구현할 때 선정) |

`public/js/llm/api.js`는 바뀌지 않습니다(같은 `/api/llm`).

## 진행 순서

| 순서 | 브랜치 [제안] | 하는 일 | 끝나면 확인되는 것 |
|---|---|---|---|
| 1 | `feature/docker-compose` | `web`·`api`·`db`를 Compose로 띄움. `ACCESS_MODE`, LLM 사용 기록을 `db`에 | 컨테이너 3종, 컨테이너 간 통신 |
| 2 | `feature/server-save` | `/api/saves`, 이어하기 코드, 타이틀·메뉴 화면 | 볼륨(`db`를 다시 만들어도 세이브가 남음) |
| 3 | `feature/limit-cache` | `cache`를 더하고 한도 집계를 옮김 | 다시 켜도 한도 유지 |
| 4 | `feature/deploy` | 서버에 올리고 보호 점검. 통과하면 터널 방식을 걷어냄 | 고정 주소로 공유 |

평가 기록으로 남길 확인(실제 명령과 출력은 구현 PR의 "확인 방법"에 붙임):

1. `docker compose ps`에 `web`, `api`, `db`, `cache`가 실행 중으로 나온다.
2. `http://localhost:5173/api/health`의 응답에 `db`와 `cache`의 연결 상태가 정상으로 나온다.
3. 게임에서 서버에 저장한다 → `db` 컨테이너만 지우고 다시 만든다 → 같은 이어하기 코드로 같은 세이브가 불러와진다.

## 배포 [제안]

같은 Compose 구성을 클라우드 서버 한 대에 올립니다. 주소가 고정되고 항상 열려 있습니다.

| 항목 | 내용 |
|---|---|
| 서버 | 배포 담당 팀원의 Google Cloud 체험 계정. 서울 리전(`asia-northeast3`), `e2-medium`(2 vCPU, 4GB), 우분투 LTS, 디스크 30GB |
| 여는 포트 | 80, 443, SSH(키 로그인만) |
| 주소 | 고정 외부 IP에 무료 동적 DNS 이름을 연결. 그 이름을 서버의 `.env`에 `SITE_ADDRESS`로 적으면 `web`이 인증서를 받음. 제공자와 이름은 [미정] |
| API 키 | 배포 담당 팀원의 키. 서버의 `.env`에만 두고 저장소·이미지·워크플로 기록에 넣지 않음 |
| 올리는 방법 | 먼저 손으로(서버에서 `main`을 받아 `docker compose -f compose.yaml -f compose.prod.yaml up --build -d`). 동작을 확인한 뒤 `main` 병합 때 GitHub Actions가 같은 일을 하게 함. 대상은 태그가 붙은 버전 |
| 비용 살피기 | `llm_usage` 테이블과 Anthropic 콘솔. 항상 열려 있으므로 하루 예산을 낮게 잡음 |
| 세이브 백업 | `pg_dump`로 내보내 서버 밖에 보관. 주기는 [미정] |

- 체험 기간에는 콘솔의 '정식 계정으로 업그레이드'를 누르지 않습니다. 누르지 않으면 청구되지 않고 끝날 때 서버가 멈출 뿐입니다.
- 체험이 끝나기 전에 세이브를 백업하고, 계속 열어 둘지 정합니다.

**터널 방식에서 걷어낼 것**: 배포 서버에서 보호 점검(`tools/share-check.mjs`. 대상 주소를 받도록 고침)이 통과한 뒤 `tools/share.mjs`, `share-game.bat`, `tools/guest-preview.mjs`, 서버의 전달 헤더 판정을 지웁니다. 손님 화면 미리 보기는 개발용 Compose를 `public`으로 띄워 대신합니다.

## 컨테이너 이미지의 라이선스

| 구성 요소 | 라이선스 | 쓰는 곳 |
|---|---|---|
| Caddy | Apache-2.0 | `web` |
| Node.js | MIT | `api`, `web` 빌드 |
| PostgreSQL | PostgreSQL License | `db` |
| Valkey | BSD-3-Clause | `cache` |

버전은 구현할 때 고정하고 라이선스를 다시 확인합니다. 게임이 쓰는 패키지의 라이선스는 [기술 구조](architecture.md)에 있습니다.

## 정할 것

| # | 항목 | 정하는 사람 |
|---|---|---|
| 1 | `web`을 Caddy로 할지 nginx로 할지 | 팀 |
| 2 | `cache`를 둘지, 한도 집계를 `db` 테이블로 할지 | 팀 |
| 3 | 배포를 손으로만 할지 자동화할지 | 팀 |
| 4 | 세이브 칸 수와 크기 상한, 두 저장이 다를 때의 처리 | 크기를 잰 뒤 팀 |
| 5 | 하루 예산 값, 동적 DNS 제공자와 이름 | 배포 담당 |
| 6 | 세이브 백업 주기와 서버 관리 담당 | 팀 |
| 7 | 평가의 "추가 오픈소스"로 무엇을 낼지 (후보: d3, Caddy. 수업에서 쓴 도구 목록과 견줌) | 팀 |
