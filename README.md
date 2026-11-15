# JobRadar

채용공고를 한곳에서 관리하기 위한 HTML5/CSS3/Vanilla JavaScript 웹앱과 Cloudflare Workers + D1 API입니다. 공고 수집은 관리자 버튼을 눌렀을 때만 요청되며 Cron Trigger 등 자동 수집은 포함하지 않습니다.

> **현재 실제 수집 상태:** 네 사이트 모두 미연결입니다. 승인되지 않은 API나 사이트 HTML을 호출하지 않습니다. UI/API/D1 관리 기능은 구현되어 있으며, 허가가 필요한 수집기는 빈 결과와 구체적인 사유를 기록합니다. 연결되지 않은 사이트에서 가짜 공고를 만들거나 수집 성공으로 처리하지 않습니다.

## 주요 기능

- 반응형 공고 게시판, 검색·필터·정렬·페이지네이션
- D1 저장형 미확인/확인, 즐겨찾기, 개별/일괄 논리 삭제 및 복구
- 산업/기업/직무/경력 조건 저장, 수동 수집 시 필터 적용
- 버튼을 클릭한 경우에만 4개 독립 수집 어댑터 실행 및 사이트별 결과/오류 기록
- 관리자 로그인 세션, HttpOnly/Secure/SameSite 쿠키, CSRF 방어, 입력 검증, 수집 요청 제한
- Cloudflare D1 SQLite 마이그레이션과 Wrangler 로컬 개발

## 기술 스택

- 프론트엔드: HTML, CSS, ES Modules 기반 Vanilla JavaScript
- API: Cloudflare Workers, Hono
- 데이터베이스: Cloudflare D1 (SQLite)
- 테스트: Vitest, Worker fetch 테스트와 collector 단위 테스트

## 폴더 구조

```text
jobradar-dashboard/
├── public/                 # 브라우저 앱 및 스타일
│   ├── index.html
│   ├── css/style.css
│   └── js/{app,api,ui}.js
├── src/
│   ├── worker.js
│   ├── routes/api.js
│   ├── collectors/         # 사이트별 독립 어댑터
│   └── services/           # 인증, 입력 검증
├── migrations/0001_initial.sql
├── tests/
├── wrangler.jsonc
├── .dev.vars.example
└── README.md
```

## 설치와 로컬 실행

Node.js 20 이상과 npm이 필요합니다. PowerShell 실행 정책 때문에 `npm` 스크립트가 막히면 Windows에서는 `npm.cmd`를 사용하세요.

```powershell
cd C:\Users\<사용자>\Documents\채용공고수집\jobradar-dashboard
npm.cmd install
Copy-Item .dev.vars.example .dev.vars
```

`.dev.vars`를 열어 강한 로컬 관리자 비밀번호와 최소 32자 `SESSION_SECRET`을 지정합니다. 이 파일은 Git에 추가하지 않습니다.

`wrangler.jsonc`에는 Pages 프로젝트 설정(`pages_build_output_dir: ./public`)과 D1 바인딩이 들어 있습니다. 실제 새 D1 ID를 받으면 placeholder를 바꿔야 합니다. 기본 UI만 확인할 때에는 `npx wrangler pages dev public`을 사용하면 Pages Functions와 정적 파일을 로컬에서 확인할 수 있습니다.

```powershell
npx.cmd wrangler d1 create jobradar-db
# 출력된 ID를 wrangler.jsonc의 database_id에 넣고 실행
npx.cmd wrangler d1 migrations apply jobradar-db --local
npm.cmd run pages:dev
```

화면: Pages dev가 출력하는 localhost 주소. 이 과정은 Cloudflare에 배포하지 않으며 로컬 D1만 사용합니다. 테스트 DB에는 실제 공고를 넣지 않고, 유닛 테스트의 메모리 mock만 사용합니다.

## 테스트 및 검사

```powershell
npm.cmd test
npm.cmd run check
npx.cmd wrangler d1 execute jobradar-db --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

`npm run check`는 Wrangler dry-run 빌드 검사이며 배포하지 않습니다. `wrangler deploy` 단독 실행은 이 지침에서 금지합니다.

### 테스트 결과

Vitest는 입력 정규화/검증, URL 중복 기준, OR/AND 수집 조건, 논리 삭제 공고 재수집 방지, 수집기별 미연결 결과, 인증/CSRF, 조건 저장, 실제 수집 이력의 미연결 기록을 테스트합니다. 현재 13개 테스트가 통과합니다.

## D1 생성 및 마이그레이션

1. Production 전용 D1 `jobradar-db`와 Preview 전용 D1 `jobradar-preview-db`를 생성하고 각 DB에 초기 마이그레이션을 적용했습니다. 기존 D1은 변경하지 않았습니다.
2. `wrangler.jsonc`의 Pages D1 binding 이름은 양 환경에서 `DB`입니다. Production은 `jobradar-db`, Preview는 `jobradar-preview-db`로 분리했습니다.
3. 이 프로젝트의 Pages Functions는 `functions/api/[[path]].js`에서 API를 처리합니다. Pages Functions 배포에 Wrangler 설정을 사용하면 `wrangler.jsonc`가 설정 원본입니다.
4. 다른 Cloudflare 계정에 복제할 경우 그 계정에 새 Production/Preview D1을 만든 뒤 각각 마이그레이션을 적용합니다.

```powershell
npx.cmd wrangler d1 migrations apply jobradar-db --remote --config wrangler.jsonc
npx.cmd wrangler d1 migrations apply jobradar-preview-db --remote --config wrangler.jsonc
```

현재 연결된 개인 계정에는 두 신규 DB와 마이그레이션이 적용되어 있습니다. 다른 계정에서 위 명령을 실행하기 전에 DB 이름/ID를 재확인하세요.

### 테이블

- `jobs`: 공통 공고 필드, 사이트 ID + 정규화 URL 유니크 제약, read/favorite/soft-delete 상태
- `preferences`: 단일 관리자 맞춤 산업/기업/직무/경력 조건
- `collection_runs`, `collection_sites`: 실행별 및 사이트별 수집 상태/오류/결과
- `admin_sessions`: 세션 토큰 해시, CSRF 토큰, 만료 시각

공고의 재수집은 기존 행을 갱신하지 않습니다. 따라서 확인/즐겨찾기/삭제 상태가 보존되고, 삭제된 공고는 자동 복구되지 않습니다.

## Secrets 및 관리자 계정

로컬: `.dev.vars`에서 `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` 설정. 운영 전에는 긴 무작위 비밀번호와 32자 이상의 별도 비밀키를 사용합니다.

이 프로젝트의 Pages Production/Preview용 Secrets는 Pages 프로젝트의 **Settings → Variables and Secrets**에서 설정합니다. Wrangler Worker 명령 `secret put`은 별도 Worker용이므로 Pages 프로젝트에 설정하는 것과 혼동하지 마세요.

```powershell
npx.cmd wrangler pages secret put ADMIN_USERNAME --project-name jobradar-dashboard
npx.cmd wrangler pages secret put ADMIN_PASSWORD --project-name jobradar-dashboard
npx.cmd wrangler pages secret put SESSION_SECRET --project-name jobradar-dashboard
```

입력 값은 소스, 프론트엔드, 저장소에 넣지 않습니다. 사람인 API 키도 공식 승인을 받아 발급된 경우에 한하여 Cloudflare Secret으로 관리해야 합니다.

## API 개요

모든 `/api/jobs`, `/api/preferences`, `/api/collections` API는 관리자 세션이 필요합니다. POST/PUT/PATCH/DELETE에는 로그인 응답으로 전달되는 CSRF 토큰을 `X-CSRF-Token`으로 보내야 합니다.

- `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout`
- `GET /api/jobs`, `GET /api/jobs/:id`, `GET /api/jobs/deleted`
- `PATCH /api/jobs/:id/read`, `PATCH /api/jobs/:id/favorite`
- `DELETE /api/jobs/:id`, `POST /api/jobs/bulk-delete`
- `POST /api/jobs/:id/restore`, `POST /api/jobs/restore`
- `GET/PUT /api/preferences`
- `POST /api/collections` (버튼 클릭 전용), `GET /api/collections`, `GET /api/collections/:id`
- `GET /api/sites`, `GET /api/health`

사이트 연결 시에는 공개 API의 공식 문서/허가 범위에 한정하고 타임아웃, 페이지/요청 상한, 실행 분할을 설정해야 합니다. 현재 수집이 승인된 곳이 없으므로 외부 HTTP 수집 요청 자체가 없습니다. Workers 요청 내 API는 짧은 시간 내 끝나는 synchronous 작업이며, 승인된 대량 수집 도입 전에는 Cloudflare Workflows/Queues 등 적절한 비동기 분할로 설계해야 합니다. Cron은 추가하지 않습니다.

## 채용 사이트 연동 상태와 필요한 조치

확인은 2026-11-15 기준 공개 robots.txt 및 공식 API 안내 페이지를 대상으로 했습니다. 사이트 운영 정책은 변할 수 있으므로 연동 전 다시 확인해야 합니다.

| 사이트 | 현재 상태 | 확인 결과 및 다음 조치 |
|---|---|---|
| 사람인 | 미연결 | [공식 API](https://oapi.saramin.co.kr/)는 채용정보 API를 제공하지만 API 이용 신청과 승인 후 access-key가 필요합니다. 승인과 최신 명세 확인 전 호출하지 않습니다. |
| 잡코리아 | 미연결 | [robots.txt](https://www.jobkorea.co.kr/robots.txt)에서 Scrapy 등 알려진 수집기를 전체 차단합니다. 공식 API/데이터 이용 권한을 확인하지 못했습니다. 사업자에게 API 제공·사용 허가를 문의하세요. |
| 인크루트 | 미연결 | [robots.txt](https://www.incruit.com/robots.txt)의 일반 `User-agent: *`가 전체 경로를 차단합니다. API 또는 명시적 서면 허가가 필요합니다. |
| 자소설닷컴 | 미연결 | [robots.txt](https://jasoseol.com/robots.txt)는 일부 경로를 제한하고 나머지를 허용하지만, 이는 데이터 재사용/API 권한을 의미하지 않습니다. 공식 API/자동수집 및 재사용 승인을 문의해야 합니다. |

robots.txt 허용만으로 저작권·이용약관상 수집 및 재게시 권한이 생기지 않습니다. API 계약/사용 승인과 필드별 사용 범위를 확인한 뒤에만 해당 collector에 실제 구현을 추가하세요.

## 배포 방법 (사용자가 직접)

Cloudflare 배포는 이 개발 작업에서 실행하지 않았습니다. Pages 프로젝트 설정은 다음처럼 설정합니다.

- Framework preset: `None` (정적 파일 프로젝트)
- Build command: `npm ci` (Pages Functions의 Hono 의존성 설치)
- Build output directory: `public`
- Root directory: 저장소 루트(`/` 또는 빈칸)
- Production branch: `main`

Pages 프로젝트의 Git integration은 Wrangler 파일을 자동 설정 원본으로 사용하지 않으므로 Dashboard Build settings도 함께 맞춰야 합니다. 현재 build command를 `npm ci`, output directory를 `public`으로 설정했고, Production 브랜치 `main`과 기존 저장소 연결을 유지했습니다. Pages 프로젝트의 Wrangler config를 사용하는 경우 `main`을 넣지 않습니다. Pages가 `functions/` 경로의 파일 기반 라우팅으로 Functions를 검색합니다.

`functions/api/[[path]].js`는 `/api/*` 요청을 Hono Worker API로 넘깁니다. Pages Dashboard의 D1 binding에서 binding name `DB`를 사용자가 생성한 새 `jobradar-db`에 연결하고, production/preview 환경 중 실제 사용할 환경을 선택해야 합니다. Wrangler 설정을 Pages에서 사용하도록 적용할 때는 D1 ID placeholder도 교체해야 합니다.

사용자가 코드와 신규 D1을 확인한 뒤 직접 진행할 때:

1. 새 Worker/D1을 만들고 `wrangler.jsonc`의 새 D1 ID 입력
2. 신규 D1에 원격 마이그레이션 적용
3. Worker Secrets 설정
4. `wrangler dev` 로컬 확인 후 배포 대상/비밀/DB를 다시 검토
5. 사용자 판단으로 `npx wrangler deploy` 수행

**Cron Trigger 설정은 추가하지 마세요.** 배포 전 `SARAMIN_API_KEY`만 설정해도 현재 collector는 수집을 실행하지 않습니다. 해당 API 승인과 현재 명세를 토대로 어댑터를 구현·검증한 후에만 연동된 상태로 바꿔야 합니다.

## 현재 범위 및 제한

- 관리 웹 UI와 REST API는 기능적으로 연결되어 있습니다. 실제 목록/상태/설정/이력은 D1을 사용합니다.
- 외부 사이트를 실제 수집하지 않습니다. 따라서 실제 공고가 없을 때 게시판은 비어 있으며 성공을 꾸며내지 않습니다.
- 관리자 인증은 단일 관리자 Credentials 기반입니다. 계정 생성/비밀번호 변경 UI와 이메일 복구는 미구현입니다.
- API 요청 제한은 로그인된 수집 호출의 10초 cooldown과 입력 상한으로 구현했습니다. 로그인 엔드포인트의 분산 환경 IP별 고급 rate limit/WAF는 별도 운영 설정이 필요합니다.
- 복구/삭제 관리 API는 관리자 인증과 CSRF를 요구합니다.
- 테스트는 모의 D1/collector를 사용하며, 이 모의 공고는 운영 DB/게시판에 표시되지 않습니다.

## 라이선스

개인 프로젝트 용도. 외부 사이트의 채용정보 권리 및 라이선스는 각 제공사 약관을 따릅니다.