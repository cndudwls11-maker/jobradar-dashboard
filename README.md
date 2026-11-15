# JobRadar

채용공고를 한곳에서 관리하기 위한 HTML5/CSS3/Vanilla JavaScript 웹앱과 Cloudflare Pages Functions + 별도 Cron Worker + D1 API입니다. 검색 탭 열기/수동 공고 저장과 매일 오전 9시 Cron 실행이 있습니다.

> **현재 실제 수집 상태:** 네 사이트 수집기는 실제 공고 데이터를 반환하지 않으며, 승인 전 collector에서 외부 요청을 보내지 않습니다. 수집 현황 UI와 사이트별 상태 조회 경로는 제거했습니다. Cron은 사이트별 행 대신 실행 총계만 내부 기록하고, 가짜 공고를 만들거나 수집 성공으로 처리하지 않습니다.

## 주요 기능

- 반응형 공고 게시판, 검색·필터·정렬·페이지네이션
- D1 저장형 미확인/확인, 즐겨찾기, 개별/일괄 논리 삭제 및 복구
- 산업/기업/직무/선호지역/경력 조건 저장 및 수집 필터
- 공고 수집 버튼은 저장 조건으로 사이트 검색 탭을 열고, 사용자가 상세·접수 상태를 확인한 공고는 관리자 등록 창에서 저장합니다. Worker는 Ego Browser를 제어하지 않습니다.
- Cloudflare Cron Worker `jobradar-daily-collection`은 매일 오전 9시(KST)에 기존 수집 파이프라인을 실행합니다. 사이트별 상태 대시보드/이력 조회는 UI와 API에서 제거했습니다.
- 현재 허가된 사이트 collector는 없으므로 Cron은 신규 공고를 수집하지 않습니다. 가짜 공고나 성공 상태도 만들지 않습니다.
- 관리자 세션, CSRF 방어, 입력 검증, 수집 요청 제한
- 수집 현황 및 사이트별 연결 상태 화면/API는 제거했습니다. Cron 진단용 실행 로그는 D1 내부에 저장하지만 웹에서는 조회하지 않습니다.
- Cloudflare D1과 Wrangler 로컬 개발

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
- `preferences`: 단일 관리자 맞춤 산업/기업/직무/지역/경력 조건
- `collection_runs`, `collection_sites`: 실행별 및 사이트별 수집 상태/오류/결과
- `admin_sessions`: 세션 토큰 해시, CSRF 토큰, 만료 시각

공고의 재수집은 기존 행을 갱신하지 않습니다. 따라서 확인/즐겨찾기/삭제 상태가 보존되고, 삭제된 공고는 자동 복구되지 않습니다.

## Secrets 및 관리자 계정

로컬: `.dev.vars`에서 `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` 설정. 운영 전에는 긴 무작위 비밀번호와 32자 이상의 별도 비밀키를 사용합니다.

이 프로젝트의 Pages Production/Preview용 Secrets는 Pages 프로젝트의 **Settings → Variables and Secrets**에서 설정합니다. Wrangler Worker 명령 `secret put`은 별도 Worker용이므로 Pages 프로젝트에 설정하는 것과 혼동하지 마세요. Production 관리자 아이디/비밀번호는 Cloudflare Pages encrypted Secrets로 관리하고 저장소에는 포함하지 않습니다.

```powershell
npx.cmd wrangler pages secret put ADMIN_USERNAME --project-name jobradar-dashboard
npx.cmd wrangler pages secret put ADMIN_PASSWORD --project-name jobradar-dashboard
npx.cmd wrangler pages secret put SESSION_SECRET --project-name jobradar-dashboard
```

입력 값은 소스, 프론트엔드, 저장소에 넣지 않습니다. 사람인 API 키도 공식 승인을 받아 발급된 경우에 한하여 Cloudflare Secret으로 관리해야 합니다.

## API 개요

모든 `/api/jobs`, `/api/manual-jobs`, `/api/preferences` 및 직접 수집 POST API는 관리자 세션이 필요합니다. POST/PUT/PATCH/DELETE에는 로그인 응답의 CSRF 토큰을 `X-CSRF-Token`으로 보냅니다. 예약 Worker는 Pages UI용 수집 이력 조회 API를 사용하지 않습니다.

- `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout`
- `GET /api/jobs`, `GET /api/jobs/:id`, `GET /api/jobs/deleted`
- `POST /api/manual-jobs` (관리자 입력, 조건/HTTPS/중복/삭제 이력 검증)
- `PATCH /api/jobs/:id/read`, `PATCH /api/jobs/:id/favorite`
- `DELETE /api/jobs/:id`, `POST /api/jobs/bulk-delete`
- `POST /api/jobs/:id/restore`, `POST /api/jobs/restore`
- `GET/PUT /api/preferences`
- `POST /api/collections` (버튼 요청)
- `GET /api/health`

별도 Cron Worker는 `wrangler.cron.jsonc`의 `0 0 * * *` (UTC, 매일 09:00 Asia/Seoul) 일정으로 실행됩니다. 사이트별 상태/실행 이력 조회 API는 제거했습니다. Cron 실행 로그는 D1 내부에 진단용으로 기록됩니다.

## 채용 사이트 수집

사람인, 잡코리아, 인크루트, 자소설닷컴용 collector 모듈은 분리되어 있습니다. 현재 각 모듈은 외부 요청 없이 빈 결과를 반환합니다. Cron은 실행 총계만 내부 기록하며 사이트별 상태/오류 상세를 저장하거나 표시하지 않습니다. 따라서 신규 공고 수집량은 0건입니다.

실제 수집 기능은 공식 API 계약이나 명시적 사용 허가를 받은 뒤 해당 collector에 구현하고 테스트해야 합니다. 권한이 확인되지 않은 요청·접근 제한 우회는 구현되어 있지 않습니다. 승인 후에도 Cron 실행이 모든 웹 페이지를 수집하지 않도록 사이트별 10건, 전체 최대 40건 상한을 적용합니다.

## 배포 방법 (사용자가 직접)

Pages Production 환경은 `https://jobradar-dashboard-btp.pages.dev`에 배포되어 있습니다. Pages 프로젝트 설정은 다음과 같습니다.

- Framework preset: `None` (정적 파일 프로젝트)
- Build command: `npm ci` (Pages Functions의 Hono 의존성 설치)
- Build output directory: `public`
- Root directory: 저장소 루트(`/` 또는 빈칸)
- Production branch: `main`

Pages 프로젝트의 Git integration은 Wrangler 파일을 자동 설정 원본으로 사용하지 않으므로 Dashboard Build settings도 함께 맞춰야 합니다. 현재 build command를 `npm ci`, output directory를 `public`으로 설정했고, Production 브랜치 `main`과 기존 저장소 연결을 유지했습니다. Pages 프로젝트의 Wrangler config를 사용하는 경우 `main`을 넣지 않습니다. Pages가 `functions/` 경로의 파일 기반 라우팅으로 Functions를 검색합니다.

`functions/api/[[path]].js`는 `/api/*` 요청을 Hono Worker API로 넘깁니다. Pages Dashboard의 D1 binding에서 binding name `DB`를 사용자가 생성한 새 `jobradar-db`에 연결하고, production/preview 환경 중 실제 사용할 환경을 선택해야 합니다. Wrangler 설정을 Pages에서 사용하도록 적용할 때는 D1 ID placeholder도 교체해야 합니다.

현재 Pages는 GitHub `main` 커밋으로 자동 배포되고, 별도 Cron Worker는 `jobradar-daily-collection`으로 배포되어 있습니다. Pages/D1/Cron Worker의 인증정보는 Cloudflare Secret으로 관리합니다. Google Cloud Scheduler/Run은 이 프로젝트에서 사용하지 않습니다.

## 현재 범위 및 제한

- 관리 웹 UI와 REST API는 기능적으로 연결되어 있습니다. 공고/설정 데이터는 D1을 사용합니다. 수집 이력은 내부 진단 저장소이며, 해당 조회 화면과 API는 제거되었습니다.
- Cloudflare Worker는 Ego Browser 또는 사용자의 브라우저를 원격 제어할 수 없습니다. “공고 수집” 버튼은 맞춤 조건으로 검색 페이지 탭을 열 뿐 공고 상세를 자동 판독하지 않습니다. 사용자가 브라우저에서 직접 확인하고 입력한 공고만 `/api/manual-jobs`를 통해 저장합니다.
- 자동 수집은 별도 Cloudflare Worker의 Cron Trigger(`0 0 * * *`, UTC; 한국시간 오전 9시)에서만 실행합니다. Pages Functions 설정에는 Cron을 넣을 수 없어 `wrangler.cron.jsonc`로 분리 배포합니다.
- Cron은 매일 09:00 KST 실행됩니다. 현재 사이트 connector는 허가 전 외부 요청을 보내지 않으므로 실제 공고를 저장하지 않습니다. 가짜 공고나 수집 성공 상태를 만들지 않습니다.
- 관리자 인증은 단일 관리자 Credentials 기반입니다. 계정 생성/비밀번호 변경 UI와 이메일 복구는 미구현입니다.
- API 요청 제한은 로그인된 수집 호출의 10초 cooldown과 입력 상한으로 구현했습니다. 로그인 엔드포인트의 분산 환경 IP별 고급 rate limit/WAF는 별도 운영 설정이 필요합니다.
- 복구/삭제 관리 API는 관리자 인증과 CSRF를 요구합니다.
- 테스트는 모의 D1/collector를 사용하며, 이 모의 공고는 운영 DB/게시판에 표시되지 않습니다.

## 라이선스

개인 프로젝트 용도. 외부 사이트의 채용정보 권리 및 라이선스는 각 제공사 약관을 따릅니다.