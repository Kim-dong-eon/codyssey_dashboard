# Codyssey 교육생 관리 대시보드 기술 명세서

> 기준: 2026-10-20, Git 커밋 8b098ad의 구현. 이 문서는 현재 코드가 실제로 하는 일을 설명한다. 운영 환경에 아직 연결하지 않은 기능은 별도로 표시한다. 교육생의 실제 이름, 연락처, 이메일과 비밀값은 포함하지 않는다.

## 1. 문서의 목적과 읽는 순서

이 서비스는 기수별 교육생과 전담팀을 관리하고, 외부 Codyssey LMS의 미션 현황을 가져와 대시보드·팀 현황·교육생 상세 화면에 표시한다. 담당자가 직접 작성하는 메모, 상담, 팀 전화, 공지, 일정, 행사 참석 기록은 같은 DB에 저장한다. 처음 참여한 개발자는 아래 순서로 읽으면 된다.

1. **2장**에서 요청과 데이터의 큰 흐름을 파악한다.
2. **4~6장**에서 화면, API, DB의 소유 관계를 확인한다.
3. **7~10장**에서 API, 크롤링, 진도 계산, 초기 이관의 순서를 확인한다.
4. **11~12장**에서 환경 변수, 배포 설정, 현재 한계를 확인한다.
5. **13장**의 변경 지침을 따라 새 기수나 기능을 추가한다.

관련 짧은 문서는 [백엔드 구조 메모](../backend/ARCHITECTURE.md)와 [Vercel 배포·이관 안내](../backend/VERCEL_DEPLOY.md)다. 두 문서와 이 문서의 설명이 다르면 현재 소스 코드를 최종 기준으로 삼는다.

| 용어 | 이 문서에서의 의미 |
| --- | --- |
| 기수(cohort) | 교육생을 묶는 운영 단위. `cohorts.end_date`가 기한이다. |
| 전담팀 | 앱에서 담당 퍼실리테이터별 교육생을 묶는 `teams` 행. 미배정 교육생은 `trainees.team_id = null`이다. |
| LMS 팀 번호 | 외부 팀 프로젝트 페이지의 `team_sn`을 저장한 값. 전담팀 PK와 같다고 가정하지 않는다. |
| 미션 진도 | LMS에서 수집한 개인·팀 미션별 `progress_logs`를 계산해 얻는 단계/완료 상태. |
| 공지·일정 | 공지는 `notices`의 메시지·상태이고, 일정·행사는 `schedule_events`의 날짜 항목이다. 팀 기록 화면은 둘을 한 피드에 보여준다. |
| 진도 정체 | 마지막 **미션 완료일** 이후 경과일. 크롤러가 마지막으로 실행된 시각과 다르다. |

## 2. 시스템 경계와 전체 흐름

~~~mermaid
flowchart LR
    U["담당자 브라우저"] --> F["React/Vite SPA"]
    F -->|Axios JSON /api| A["FastAPI 라우터"]
    A --> S["도메인 조회·쓰기 / 진도 계산"]
    S --> O["SQLAlchemy ORM"]
    O --> D[(지속성 있는 관계형 DB)]

    VC["Vercel Cron"] -->|GET /api/cron/crawl| CR["Cron 라우터<br/>Bearer 검증"]
    CR --> C["기수별 크롤링 오케스트레이터"]
    LS["로컬 APScheduler"] -->|Python 함수 직접 호출| C
    C --> H["로그인·HTTP 클라이언트"]
    H <--> LMS["외부 Codyssey LMS"]
    C --> P["HTML 파서"]
    P --> W["CrawlPersistence"]
    W --> O

    LD[(기존 로컬 DB)] --> EX["로컬 export CLI"]
    EX --> J["비공개 roster JSON<br/>Git/Vercel 업로드 제외"]
    J --> IM["로컬 import CLI"]
    IM --> D
~~~

**데이터의 소유권을 구분한다.** 교육생의 기수·전담팀·기본 정보는 관리 DB가 소유한다. 미션 상태와 완료일의 원천은 외부 LMS다. 상담·메모·전화·공지·일정은 담당자가 이 앱에서 입력한다. 프론트엔드는 서버 데이터를 로컬 화면 상태로 읽고 작업 후 HTTP로 다시 조회한다. 팀 상세 화면은 표시 중 60초마다, 탭이 다시 보일 때도 재조회한다. WebSocket, SSE, 서버의 자동 푸시 갱신은 구현돼 있지 않다.

Vercel 배포는 프론트엔드와 백엔드를 **별도 프로젝트**로 전제한다. 백엔드 Root Directory는 **backend**, 프론트엔드 Root Directory는 **frontend**다. 백엔드 함수의 파일 시스템은 운영 DB로 쓰지 않는다. DB는 별도의 지속성 있는 MySQL 또는 PostgreSQL 연결로 준비한다.

## 3. 기술 스택과 저장소 지도

| 영역 | 사용 기술과 선언된 버전 | 실제 역할 |
| --- | --- | --- |
| 브라우저 | React/React DOM ^18.3.1, React Router ^6.30.6 | SPA 렌더링, 경로별 화면, 기수 Context |
| API 호출 | Axios ^1.6.8 | JSON 요청과 공통 API base URL |
| 시각화·아이콘 | Recharts ^3.10.1, Lucide React ^1.49.0 | 기간별 차트, 단계·팀 현황, 아이콘 |
| 스타일·빌드 | Vite ^8.3.2, React 플러그인 ^6.1.1, Tailwind CSS 및 Vite 플러그인 ^4.3.3, 일반 CSS | 번들, 개발 프록시, CSS 변수 기반 다크/라이트 테마 |
| API | Python 3.12 기준, FastAPI 0.111.0, Uvicorn 0.30.1, Pydantic 2.7.1, email-validator 2.2.0 | REST API, 입력 검증(`EmailStr` 포함), ASGI 앱 |
| 선언된 설정 의존성 | pydantic-settings 2.2.1 | requirements에 포함됨; 현재 앱 설정은 `os.getenv`와 python-dotenv를 직접 사용 |
| DB | SQLAlchemy 2.0.30, PyMySQL 1.1.1, psycopg 3.2 이상 4 미만 | ORM, MySQL/PostgreSQL 드라이버; 로컬 SQLite 대체 가능 |
| 크롤러 | Requests 2.32.3, Beautiful Soup 4.12.3 | LMS 로그인·페이지 요청·HTML 파싱 |
| 시간·설정 | APScheduler 3.11.3, pytz 2026.5, tzdata 2026.4, Python zoneinfo, python-dotenv 1.0.1 | 로컬 예약 작업, KST 처리, 환경 변수 로드 |
| 배포 | Vercel Python Function, Vercel Cron, Vite 정적 배포 | API 실행, 정기 GET 호출, SPA 제공 |

버전 표기는 [frontend/package.json](../frontend/package.json)과 [backend/requirements.txt](../backend/requirements.txt)의 **선언 값**이다. 프론트엔드 의존성의 실제 설치 해상도는 [frontend/package-lock.json](../frontend/package-lock.json)을 따른다.

| 경로 | 책임 |
| --- | --- |
| [backend/index.py](../backend/index.py), [backend/app/main.py](../backend/app/main.py) | Vercel 진입점, FastAPI 앱, CORS, 수명 주기와 라우터 등록 |
| [backend/app/database.py](../backend/app/database.py), [backend/app/models.py](../backend/app/models.py), [backend/app/schemas.py](../backend/app/schemas.py) | DB 엔진·세션, 14개 ORM 테이블, 공통 Pydantic 모델 |
| [backend/app/routers/](../backend/app/routers/) | 기수·교육생·팀·대시보드·일정·Cron API |
| [backend/app/services/](../backend/app/services/) | 크롤링, DB 반영, 진도 계산; 레거시 파일 동기화도 포함 |
| [backend/app/migrations.py](../backend/app/migrations.py) | 새 테이블 생성과 기존 스키마 호환 이행 |
| [backend/app/trainee_transfer.py](../backend/app/trainee_transfer.py) | 기수·팀·교육생의 비공개 export 및 대상 DB import |
| [backend/app/database_snapshot.py](../backend/app/database_snapshot.py) | 전체 테이블의 보관용 JSON export만 제공; 복원기는 없음 |
| [frontend/src/main.jsx](../frontend/src/main.jsx), [frontend/src/App.jsx](../frontend/src/App.jsx) | React 시작, 테마 초기화, 화면 라우팅과 기수 Context |
| [frontend/src/components/](../frontend/src/components/), [frontend/src/pages/](../frontend/src/pages/) | 공통 레이아웃·차트와 기능별 화면 |
| [frontend/src/api/](../frontend/src/api/), [frontend/src/styles/index.css](../frontend/src/styles/index.css) | 도메인별 HTTP 래퍼와 공통 디자인 토큰 |
| [backend/vercel.json](../backend/vercel.json), [frontend/vercel.json](../frontend/vercel.json) | Cron 시간표와 SPA 직접 접속 rewrite |

## 4. 프론트엔드 구조와 사용자 작업

### 4.1 시작·라우팅·전역 상태

[main.jsx](../frontend/src/main.jsx)는 저장된 테마를 브라우저 localStorage의 **codyssey-theme**에서 읽어 루트 HTML의 **data-theme**을 정한 뒤 React를 시작한다. [App.jsx](../frontend/src/App.jsx)는 BrowserRouter, 지연 로드한 화면, Suspense, 공통 Layout/Topbar를 구성한다. 전역 [GlobalContext](../frontend/src/context/GlobalContext.jsx)에 들어 있는 값은 **selectedCohort와 setter 두 개**뿐이다. 초기 기수 ID는 1이며, Topbar가 실제 기수 목록을 받아 해당 ID가 없으면 첫 기수로 조정한다. 기수 선택은 새로고침 후 유지하지 않는다. 테마 선택은 유지한다.

| URL | 화면 | 주요 데이터와 작업 |
| --- | --- | --- |
| /dashboard | [Dashboard.jsx](../frontend/src/pages/Dashboard.jsx) | 기수 요약, 기간별 차트, 단계별 미션 완료 인원, 전담팀별 인원, 공지, 진도 정체 명단 |
| /facilitator-teams | [FacilitatorTeams.jsx](../frontend/src/pages/FacilitatorTeams.jsx) | 미배정 대기열, 전담팀 보드/표, 드래그 이동, 일괄 등록, 학습지원 연계 |
| /facilitator-teams/:teamId | [TeamDetail.jsx](../frontend/src/pages/TeamDetail.jsx) | 팀 명단·상태, 팀 진도·정체 명단, 팀/개인 메모와 기록 |
| /team-memos | [TeamMemos.jsx](../frontend/src/pages/TeamMemos.jsx) | 여러 기록의 통합 피드, 팀/개인 메모, 팀 단위 전화 기록 |
| /projects | [TeamProjects.jsx](../frontend/src/pages/TeamProjects.jsx) | LMS 팀 프로젝트 현황, 단계/검색/상태 필터, 현황판 메모 |
| /tech-support | [TechSupportTeam.jsx](../frontend/src/pages/TechSupportTeam.jsx) | 학습지원 연계 교육생, 위험 표시, 단계 분포 |
| /trainees | [TraineeList.jsx](../frontend/src/pages/TraineeList.jsx) | 전체 명단, 검색/필터, 상세, 상담·개인 메모·팀 이동·드랍 |
| /schedule | [Schedule.jsx](../frontend/src/pages/Schedule.jsx) | 기수·공통 일정 달력, 행사 CRUD, 참석 명단 등록·취소 |

루트 URL과 알 수 없는 URL은 /dashboard로 보낸다. [Topbar.jsx](../frontend/src/components/Topbar.jsx)는 기수 생성·기한 수정, 검색(Ctrl/Cmd+K), 경로 이동, 테마 전환을 담당한다. 검색 결과 선택은 /trainees?search=...로 이동한다.

### 4.2 화면에서 API까지

~~~mermaid
sequenceDiagram
    actor User as 담당자
    participant Page as React 화면
    participant Ctx as selectedCohort Context
    participant Api as 도메인 API 래퍼 / Axios
    participant FastAPI as FastAPI 라우터
    participant DB as 관계형 DB
    User->>Ctx: 기수 선택
    Ctx-->>Page: 선택 ID 변경
    Page->>Api: 기수별 목록 또는 대시보드 요청
    Api->>FastAPI: /api/... JSON HTTP
    FastAPI->>DB: ORM 조회
    DB-->>FastAPI: 행
    FastAPI-->>Page: JSON
    Page-->>User: 카드·표·차트 렌더링
    User->>Page: 메모/상태/일정 변경
    Page->>Api: POST·PUT·PATCH·DELETE
    Api->>FastAPI: 쓰기 요청
    FastAPI->>DB: commit
    Page->>Api: 관련 화면 데이터 재조회
~~~

[api/axios.js](../frontend/src/api/axios.js)의 base URL은 빌드 변수 **VITE_API_BASE_URL**이 있으면 그 값, 없으면 **/api**다. [api/cohorts.js](../frontend/src/api/cohorts.js), [dashboard.js](../frontend/src/api/dashboard.js), [teams.js](../frontend/src/api/teams.js), [trainees.js](../frontend/src/api/trainees.js), [schedules.js](../frontend/src/api/schedules.js)가 요청 경로를 감싼다. 개발 중 [vite.config.js](../frontend/vite.config.js)는 /api를 **API_PROXY_TARGET**, 기본 http://localhost:8000으로 전달한다.

대시보드는 전체 응답을 읽고, 팀 편성·팀 상세·학습지원 화면은 필요할 때 **roster_only=true**를 사용해 차트 계산과 개별 미션 목록을 생략한다. [MissionProgressByLevel.jsx](../frontend/src/components/MissionProgressByLevel.jsx)는 개인/팀 미션별 완료 인원을 중복 없는 교육생 ID 집합으로 계산하며 현재 단계 대상과 전체 인원 보기를 전환한다. [PeriodProgressSection.jsx](../frontend/src/components/PeriodProgressSection.jsx)는 팀 ID와 기간을 지정해 같은 대시보드 API의 차트 응답을 사용한다.

### 4.3 기록·테마의 소유 위치

**팀 기록 모음은 통합 DB 테이블이 아니다.** TeamMemos 화면이 팀 메모, 개인 메모, 상담, 팀 전화, 공지, 일정·행사를 각 API에서 가져와 같은 피드 형식으로 합친다. 텍스트·종류·팀 필터와 수정일 정렬도 화면에서 수행한다. 미완료 긴급 공지는 상단에 별도로 표시한다. 각 기록의 수정·삭제는 원래의 개별 API와 테이블에서 처리한다.

팀 상세는 [TeamDetail.jsx](../frontend/src/pages/TeamDetail.jsx)에서 팀의 명단·진도·기록을 함께 조회한다. 화면이 열려 있고 탭이 보이는 동안 60초마다 새 데이터를 가져오며, 숨겨졌던 탭이 다시 표시될 때도 갱신한다. 이는 HTTP 재조회이며 실시간 서버 푸시는 아니다.

개인 상담/연락은 **contact_logs**에 한 교육생의 방식·주제·내용으로 남는다. 팀 전화는 **team_call_campaigns**에 공통 사유를 한 번 저장하고 **team_call_recipients**에 대상자별 수신 여부(기본 true)와 선택적 특이사항을 저장한다. 이 둘은 서로 다른 기능과 테이블이다.

스타일은 [styles/index.css](../frontend/src/styles/index.css)의 다크 기본 CSS 변수와 **html[data-theme="light"]** 재정의로 바뀐다. 라이트 배경 기본값은 **#FCFCFC**이다. 각 JSX는 이름이 같은 CSS 파일을 import한다. 차트 축·계열과 액션 버튼도 CSS 변수를 쓴다. 테마 전환은 DB 요청 없이 localStorage, HTML 속성, 브라우저 theme-color만 갱신한다.

## 5. 백엔드 실행 수명 주기와 데이터 접근

FastAPI 앱은 [main.py](../backend/app/main.py)에서 생성하고 **/api/cohorts**, **/api/trainees**, **/api/teams**, **/api/dashboard**, **/api/schedules**, **/api/cron**을 등록한다. DB 요청은 [database.py](../backend/app/database.py)의 **get_db** 의존성으로 세션을 열고 요청이 끝나면 닫는다. API 입력은 [schemas.py](../backend/app/schemas.py) 또는 각 라우터의 Pydantic 모델이 검증한다. 기수 생성에는 **end_date(기한)**가 필수이며 시작일보다 빠를 수 없다.

| 환경 | 앱 시작 시 동작 | 예약 작업 |
| --- | --- | --- |
| 로컬/일반 서버 | **initialize_schema()**로 누락 테이블 생성 및 레거시 호환 이행 | 기본적으로 APScheduler가 매일 09:00 KST 실행; ENABLE_SCHEDULER=false면 중지 |
| Vercel, VERCEL=1 | 요청 시작 시 DDL·호환 마이그레이션을 하지 않음 | 앱 내부 APScheduler를 시작하지 않고 Vercel Cron GET을 사용 |

DATABASE_URL이 없으면 일반 로컬 실행에서는 **backend/codyssey.db** SQLite로 대체한다. Vercel에서는 DATABASE_URL 누락 시 시작 오류를 낸다. PostgreSQL URL의 postgres:// 또는 postgresql:// 접두사는 SQLAlchemy용 psycopg URL로 정규화한다. DB 엔진은 끊어진 연결을 재사용하지 않도록 **pool_pre_ping=True**를 설정한다. Vercel에서는 요청 간 연결 보유를 피하기 위해 **NullPool**을 사용한다. CORS_ORIGINS는 허용할 브라우저 출처 목록이며 사용자 인증 수단이 아니다.

## 6. DB 스키마: 14개 현재 모델

아래 실선은 ORM에 선언된 외래 키를, 점선은 코드에서 사용하는 **논리적 참조**를 뜻한다. 특히 외부 LMS의 팀 번호를 담는 **team_projects.team_id**는 전담팀의 teams.team_id를 가리키는 외래 키로 선언되지 않았다.

~~~mermaid
flowchart TB
    cohorts --> teams
    cohorts --> trainees
    teams --> trainees
    trainees --> trainee_flags
    trainees --> progress_logs
    trainees --> contact_logs
    trainees --> facilitator_memos
    teams --> facilitator_memos
    cohorts --> facilitator_memos
    cohorts --> team_board_memos
    cohorts --> team_call_campaigns
    teams --> team_call_campaigns
    team_call_campaigns --> team_call_recipients
    trainees --> team_call_recipients
    cohorts -.->|논리 참조| notices
    cohorts -.->|0은 공통 일정| schedule_events
    schedule_events -.->|논리 참조| event_registrations
    trainees -.->|논리 참조| event_registrations
    teams -.->|ID 동일성 미보장| team_projects
    cohorts -.->|기수 번호| team_projects
    cohorts -.->|과거 기록의 기수 번호| progress_logs
~~~

| 테이블 | 핵심 필드·의미 | 주요 작성 경로 |
| --- | --- | --- |
| **cohorts** | cohort_id, 이름, start_date, **end_date=기한** | 기수 API, 초기 이관 |
| **teams** | team_id, cohort_id FK, 전담팀 이름 | 팀 API, 초기 이관 |
| **trainees** | trainee_id, cohort_id FK, nullable team_id FK, 이름·이메일(unique)·연락처 등, 드랍 여부/일자/사유 | 교육생 API, 초기 이관 |
| **trainee_flags** | trainee_id PK/FK, 관심 필요, 학습지원 연계, 갱신일 | 교육생 상태 API; 초기 이관에서는 제외 |
| **progress_logs** | 교육생·단계·미션 종류(personal/team)·라벨·상태·완료일·마지막 수집일; 과거 summary 필드도 보존 | 크롤링 DB 반영, 레거시 이행 |
| **team_projects** | 외부 LMS 팀 번호, 기수, 프로젝트 레벨·상태·멤버 이름·상태 변경일 | 크롤링 DB 반영 |
| **facilitator_memos** | 기수 FK, nullable 팀/교육생 FK, 제목·본문·작성/수정일 | 팀 메모·개인 메모 API |
| **team_board_memos** | 기수 FK, 프로젝트 현황판의 기수 공통 메모 | 팀 현황판 API |
| **team_call_campaigns** | 기수/팀 FK, 공통 전화 사유, 담당자, 작성/수정일 | 팀 전화 API |
| **team_call_recipients** | 캠페인/교육생 FK, 연락 받음 여부, 개인별 특이사항 | 팀 전화 API |
| **contact_logs** | 교육생 FK, 상담/연락일·방식·주제·내용·담당자 | 교육생 연락 API |
| **notices** | 기수 번호, 내용·작성자·고정 여부·상태·분류·작성일 | 대시보드 공지 API |
| **schedule_events** | 기수 번호(0은 공통), 제목·설명·날짜·유형; 과거 일정 시각 필드도 보존 | 일정 API, 레거시 이행 |
| **event_registrations** | 행사 번호·교육생 번호·이름 스냅샷·신청일·상태 | 행사 참석 명단 API |

기수/팀/교육생의 물리 FK 외에 **notices.cohort_id**, **schedule_events.cohort_id**, **event_registrations.event_id/trainee_id**, **team_projects.team_id**에는 ORM FK 선언이 없다. 따라서 이 관계의 유효성은 해당 API의 확인 로직이나 외부 데이터에 의존한다. 인덱스는 [models.py](../backend/app/models.py)의 단일 인덱스와 기수·팀·교육생/프로젝트의 복합 인덱스, [migrations.py](../backend/app/migrations.py)의 기존 DB 인덱스 이행을 따른다.

## 7. HTTP API 전체 목록

접두사를 포함한 실제 등록 경로다. 쓰기 요청은 특별히 적지 않은 경우 해당 라우터에서 DB commit 후 JSON을 반환한다. API 자체에 일반 사용자 로그인/권한 검증은 없다. FastAPI는 이와 별도로 대화형 API 문서 경로(`/docs`, `/redoc`)도 제공한다.

| 메서드·경로 | 역할 |
| --- | --- |
| GET / | 서버 상태 확인 (`status: ok`) |
| GET /api/cohorts/ | 기수 목록 |
| POST /api/cohorts/ | 기수 생성; end_date 필수 |
| PATCH /api/cohorts/{cohort_id} | 기한 변경 |
| GET /api/trainees/cohort/{cohort_id} | 교육생·전담팀·파생 진도·플래그 목록 |
| PUT /api/trainees/{trainee_id}/team | 팀 이동, 필요 시 이동 메모 |
| POST /api/trainees/{trainee_id}/contact | 개인 상담/연락 기록 생성 |
| GET /api/trainees/cohort/{cohort_id}/contacts | 기수별 상담/연락 기록 |
| DELETE /api/trainees/contact/{contact_id} | 상담/연락 기록 삭제 |
| PUT /api/trainees/{trainee_id}/drop | 교육생 드랍·복구 상태 변경 |
| POST /api/trainees/ | 교육생 생성 |
| GET /api/trainees/{trainee_id}/detail | 프로필·진도·상담·메모 상세 |
| POST /api/trainees/{trainee_id}/memos | 개인 메모 생성 |
| DELETE /api/trainees/memos/{memo_id} | 개인 메모 삭제 |
| PATCH /api/trainees/memos/{memo_id} | 개인 메모 수정·수정일 반영 |
| POST /api/trainees/bulk | 이름/이메일 명단 일괄 등록 또는 같은 기수 재배정 |
| PUT /api/trainees/{trainee_id}/status | 관심 필요·학습지원 플래그 변경 |
| GET /api/teams/cohort/{cohort_id} | 기수의 전담팀과 미배정 교육생 |
| POST /api/teams/ | 전담팀 생성 |
| GET /api/teams/cohort/{cohort_id}/projects | 크롤링된 팀 프로젝트 현황 |
| GET /api/teams/{team_id}/memos | 팀 메모 조회 |
| GET /api/teams/cohort/{cohort_id}/memos | 기수의 팀·개인 메모 모음 |
| GET /api/teams/cohort/{cohort_id}/call-campaigns | 기수의 팀 전화 기록 및 대상 결과 |
| POST /api/teams/cohort/{cohort_id}/call-campaigns | 공통 사유와 복수 대상 기록 |
| PATCH /api/teams/cohort/{cohort_id}/call-campaigns/{campaign_id} | 전화 사유·대상 결과 수정 |
| DELETE /api/teams/cohort/{cohort_id}/call-campaigns/{campaign_id} | 전화 기록 삭제 |
| GET /api/teams/cohort/{cohort_id}/board-memos | 프로젝트 현황판 메모 목록 |
| POST /api/teams/cohort/{cohort_id}/board-memos | 현황판 메모 작성 |
| DELETE /api/teams/cohort/{cohort_id}/board-memos/{memo_id} | 현황판 메모 삭제 |
| POST /api/teams/{team_id}/memos | 팀 메모 작성 |
| DELETE /api/teams/{team_id}/memos/{memo_id} | 팀 메모 삭제 |
| PATCH /api/teams/{team_id}/memos/{memo_id} | 팀 메모 수정 |
| DELETE /api/teams/{team_id} | 팀 삭제; 소속 교육생을 미배정으로 변경 |
| GET /api/dashboard/{cohort_id} | 명단·미션·기간별 통계; 날짜/팀/roster_only 필터 |
| GET /api/dashboard/{cohort_id}/notices | 기수 공지; 고정·작성일 순 |
| POST /api/dashboard/{cohort_id}/notices | 공지 등록 |
| PUT /api/dashboard/notices/{notice_id} | 공지 고정·완료 상태 변경 |
| DELETE /api/dashboard/notices/{notice_id} | 공지 삭제 |
| GET /api/schedules/cohort/{cohort_id} | 기수 및 공통 일정; all이면 전 기수 |
| POST /api/schedules/ | 일정·행사 생성 |
| PUT /api/schedules/{event_id} | 일정·행사 수정 |
| DELETE /api/schedules/{event_id} | 행사와 소속 신청 기록 삭제 |
| GET /api/schedules/{event_id}/roster | 행사 신청 명단 |
| POST /api/schedules/{event_id}/register | 행사 명단에 교육생 추가 |
| PUT /api/schedules/cancel/{registration_id} | 신청 상태를 취소됨으로 변경 |
| GET /api/cron/crawl | CRON_SECRET Bearer 검증 후 수집; 선택적으로 cohort_id |

요청/응답 필드의 실행 계약은 각 [라우터](../backend/app/routers/)의 Pydantic 요청 모델과 FastAPI 응답, 공통 [schemas.py](../backend/app/schemas.py)를 참조한다. 특히 행사 API의 **참석 명단**은 신청완료/취소됨을 기록하며 실제 출석 확인을 위한 별도 엔드포인트는 없다.

## 8. 크롤링과 DB 동기화: 단계별 처리

~~~mermaid
sequenceDiagram
    participant Trigger as Vercel Cron
    participant Local as 로컬 APScheduler
    participant Route as cron.py
    participant Crawl as crawl.py
    participant Client as crawl_client.py
    participant LMS as 외부 LMS
    participant Parser as crawl_parser.py
    participant Persist as crawl_persistence.py
    participant DB as 관계형 DB
    Trigger->>Route: GET /api/cron/crawl
    Route->>Route: CRON_SECRET Bearer 검사
    Route->>Crawl: 활성 기수 실행
    Local->>Crawl: Python 함수 직접 호출
    Crawl->>Client: 인증 세션 생성
    Client->>LMS: 로그인/XSRF 처리
    loop 기수별 개인 8·팀 7 미션
        Crawl->>Client: 미션 페이지 GET
        Client->>LMS: 15초 timeout 요청
        LMS-->>Client: HTML
        Client-->>Crawl: HTML
        Crawl->>Parser: 페이지 파싱
        Parser-->>Crawl: 구조화된 팀/개인 결과
    end
    alt 해당 기수의 모든 페이지 성공
        Crawl->>Persist: 수집 결과 전달
        Persist->>DB: 이메일 매칭, 기존 행 선조회, upsert
        Persist->>DB: 기수 단위 commit
    else 한 페이지라도 실패
        Crawl-->>Route: 해당 기수 저장 생략, 오류
        Route-->>Trigger: HTTP 500
        Crawl-->>Local: 로컬 작업이면 예외 전파·로그
    end
~~~

1. [crawl_config.py](../backend/app/services/crawl_config.py)에 기수별 활성 여부, 개인/팀 미션의 번호·레벨·라벨을 정의한다. **현재 1기만 활성**이며 개인 8개와 팀 7개, 총 15개 페이지를 순차 수집한다. 2기 항목은 주석 예시일 뿐이다. 이관 파일에 cohort가 2개 있어도 2기 진도는 자동 수집되지 않는다.
2. [crawl_client.py](../backend/app/services/crawl_client.py)가 로그인/쿠키/XSRF를 처리하고 외부 페이지를 요청한다. 페이지 요청 timeout은 15초다. 데이터 영역 누락 오류인 경우 로그인 후 한 번 더 시도한다.
3. [crawl_parser.py](../backend/app/services/crawl_parser.py)는 **.card.uqstn** 및 **misTeamList_*** 구조에서 미션 상태, 완료일, 외부 팀 번호와 교육생 이메일을 읽는다. 정상적으로 비어 있을 수 있는 미션만 설정에 **allow_empty: True**를 넣을 수 있다. 기본값에서는 빈 목록을 실패로 취급해 로그인 만료나 HTML 변경을 0명 완료로 잘못 저장하지 않는다.
4. [crawl.py](../backend/app/services/crawl.py)는 네트워크 수집 중 DB 트랜잭션을 열지 않는다. **해당 기수의 모든 설정 페이지가 성공한 후** 한꺼번에 저장한다. 실패한 기수의 기존 기록은 그대로 둔다. 여러 활성 기수 중 일부가 실패해도 성공 기수는 이미 반영될 수 있으며 전체 호출은 실패를 보고한다.
5. [crawl_persistence.py](../backend/app/services/crawl_persistence.py)는 해당 기수의 교육생·기존 진도·팀 프로젝트를 먼저 읽어 반복 조회를 줄인다. LMS 교육생은 소문자로 정규화한 **이메일**로 로컬 교육생에 연결한다. 미매칭 교육생은 진도 행을 만들지 않는다. 외부 **team_sn**으로 팀 프로젝트 행을 찾으며 이 값은 전담팀 ID와 동일함이 보장되지 않는다. 동일 기수의 팀·개인 변경을 한 트랜잭션에서 commit 또는 rollback한다.

수집 결과는 현재 **중간 JSON/CSV를 거치지 않는다.** [sync_service.py](../backend/app/services/sync_service.py)는 temp_data 파일을 읽던 과거 경로로, 현재 Cron/스케줄러에서는 호출하지 않는다. 새로운 재처리 기능을 만들더라도 현재 미션별 저장 규칙을 건너뛰어 이 서비스에 직접 연결해서는 안 된다.

Vercel Cron은 [backend/vercel.json](../backend/vercel.json)의 `0 0 * * *`로 설정돼 매일 00:00 UTC, 한국 시간 09:00에 GET을 보낸다. [cron.py](../backend/app/routers/cron.py)는 비밀값 미설정 503, Bearer 불일치 401, 수집 오류 500을 반환한다. 수동 호출의 `cohort_id`가 0 이하이면 입력 검증 422, 활성화된 기수에 없으면 404다. 로컬에서는 [crawl_scheduler.py](../backend/app/crawl_scheduler.py)의 APScheduler가 같은 시각에 크롤러 Python 함수를 **직접** 실행한다. 두 예약 경로는 배포 환경에서 동시에 켜지지 않도록 VERCEL 모드가 로컬 스케줄러를 중지한다.

## 9. 진도 계산과 주요 도메인 규칙

[progress_state.py](../backend/app/services/progress_state.py)는 progress_logs에서 교육생의 현재 단계와 과거 날짜 기준 상태를 **파생**한다. 현재 단계 계산은 완료 상태 문자열만으로 미션 완료를 인정한다. 과거 특정 날짜의 상태를 재구성할 때는 그 날짜 이전의 **completed_at**도 필요하다. 개인 미션이 목표 개수를 채우고 해당 단계의 팀 미션 완료가 있으면 다음 단계로 판단한다. 목표 개수는 수집된 미션 라벨의 수를 우선 사용하고, 없으면 1단계 3·2단계 3·3단계 2를 기본값으로 쓴다. 미션별 상세 행이 아직 없는 교육생은 과거 summary 행을 대체 경로로 사용한다. 완료 상태 문자열은 공백을 제거한 뒤 미션완료/완료/completed/complete를 인정한다.

[dashboard.py](../backend/app/routers/dashboard.py)의 GET은 기본 최근 7일을 기간으로 사용하고 **trainees**, **missionProgressByTrainee**, **chartData**, **historyAvailable**, **historyMode**, **range**를 반환한다. 차트의 과거 날짜는 저장된 일일 스냅샷이 아니라 미션 완료일·기존 진도일·드랍일을 기준으로 재구성한다. 조회한 진도 전체에 날짜 근거가 **하나도 없으면** 과거 차트 값을 null로 두며, 근거가 하나라도 있으면 요청 기간의 날짜별 값을 재구성한다. 드랍 인원은 활성 명단에서 제외하되 기간별 드랍 집계에 반영한다. **roster_only=true**는 명단 중심 응답으로 계산량을 줄인다.

정체 명단의 **last_progress_at**은 성공한 크롤링의 마지막 검사 시각이 아니라, 교육생에게 기록된 **가장 최근 미션 완료일**이다. 따라서 완료 기록이 없는 교육생은 별도 표시된다. 팀 프로젝트의 **status_changed_date**는 현재 저장 경로에서 상태 또는 참여 이름이 바뀔 때 갱신한다.

공지 **category**와 완료 **status**는 별개의 값이다. 미완료 긴급 공지가 팀 기록 화면의 상단에 나타난다. 일정은 기수 ID 0을 공통 일정으로 사용하며, 선택 기수 조회 시 자기 기수와 공통 일정을 합친다. 팀 삭제는 교육생을 삭제하지 않고 team_id를 null로 바꾸어 미배정으로 돌린다.

## 10. DB 생성, 기존 자료 이행, 초기 교육생 이관

### 10.1 스키마 초기화

[migrations.py](../backend/app/migrations.py)의 **initialize_schema()**는 누락 테이블 생성 후 기존 DB 호환 작업을 순서대로 수행한다. Alembic 버전 마이그레이션 체계는 사용하지 않는다. 호환 작업에는 과거 schedules → schedule_events, 과거 팀 이동 기록 → facilitator_memos, 과거 프로젝트 메모 → team_board_memos, progress_logs 미션 필드·교육생 플래그 분리, 수정일·복합 인덱스 추가가 있다. 오래된 표를 옮기고 제거하는 경로도 있으므로 기존 운영 DB에 실행하기 전 백업과 스키마 검토가 필요하다.

Vercel 함수는 시작할 때 스키마를 변경하지 않는다. **새 대상 DB를 준비한 로컬 작업 환경에서**, 해당 DB의 DATABASE_URL을 설정하고 **python -m app.migrations**를 먼저 한 번 실행한다.

### 10.2 기존 로컬 DB → 새 대상 DB

~~~mermaid
flowchart LR
    A[(기존 로컬 DB)] --> B["trainee_transfer export"]
    B --> C["비공개 v2 roster JSON<br/>2 cohort + 5 team + 155 trainee"]
    D["migrations.py<br/>새 DB 테이블 생성"] --> E[(새 대상 DB)]
    C --> F["trainee_transfer import<br/>기본: dry run"]
    F --> G["--apply: 누락 행 삽입"]
    G --> E
    H["Vercel API + Cron"] --> E
~~~

[trainee_transfer.py](../backend/app/trainee_transfer.py)의 v2 export에는 **cohorts, teams, trainees**만 들어간다. 기수의 시작일·기한, 팀 연결, 교육생의 이름·성별·나이·전화·이메일·전공·학력·취업 상태·드랍 상태와 사유 등 개인정보를 포함한다. **trainee_flags, progress_logs, 메모, 공지, 일정, 상담·전화 기록은 포함하지 않는다.** 팀은 교육생의 nullable team_id 연결에, 기수는 팀/교육생의 cohort_id FK에 필요하다.

import는 먼저 기수·팀 참조 및 ID/이메일 충돌을 확인한다. 기본 실행은 **dry run**으로 추가 예정 건수만 보고하고 DB를 바꾸지 않는다. **--apply**가 있어야 누락 행을 원래 ID로 삽입한다. 기존 행의 내용을 덮어쓰지 않아 재실행 시 추가 건수는 0이 된다. PostgreSQL에서는 명시한 ID보다 자동 증가 시퀀스가 뒤처지지 않도록 조정한다. 실제 운영 쓰기 요청이 시작되기 전에 이관해야 한다.

현재 준비된 비공개 v2 파일은 **backend/private_exports/roster-trainees-2026-10-20.json**이며 2기수·5팀·155명이다. Git과 Vercel 함수 번들에 포함하지 않는다. 전체 DB 보관용 [database_snapshot.py](../backend/app/database_snapshot.py)는 export만 제공하고 이 초기 교육생 이관에 사용하지 않는다. 구체적인 PowerShell 명령, 파일 해시와 순서는 [VERCEL_DEPLOY.md](../backend/VERCEL_DEPLOY.md)에 있다.

## 11. 실행·배포 설정

| 변수 | 설정 위치 | 의미 |
| --- | --- | --- |
| DATABASE_URL | 백엔드 로컬 또는 Vercel Production | 대상 관계형 DB의 SQLAlchemy URL; Vercel에서 필수 |
| CORS_ORIGINS | 백엔드 | 쉼표로 구분한 허용 프론트엔드 출처 |
| CRON_SECRET | Vercel 백엔드 | Cron GET의 Bearer 비밀값 |
| CODYSSEY_ID, CODYSSEY_PW | 백엔드 Cron 실행 환경 | LMS 로그인 계정 |
| CODYSSEY_COOKIE | 선택적 백엔드 설정 | ID/PW 대신 사용할 수 있는 쿠키 방식 |
| CODYSSEY_AUTH_URL, CODYSSEY_ID_FIELD, CODYSSEY_PW_FIELD | 선택적 백엔드 설정 | 로그인 엔드포인트와 요청 필드 조정 |
| ENABLE_SCHEDULER | 로컬 백엔드 | false면 APScheduler 비활성; Vercel에서는 자동 비활성 |
| VERCEL | Vercel 런타임 | 서버리스 모드 판단; 로컬에서 수동 설정할 필요 없음 |
| VITE_API_BASE_URL | 프론트엔드 빌드 | 백엔드 URL에 /api까지 포함 |
| API_PROXY_TARGET | 로컬 Vite 개발 서버 | /api 개발 프록시 대상 |
| SOURCE_DATABASE_URL, TARGET_DATABASE_URL | 로컬 이관 CLI | 원본/대상 DB 연결; Vercel 함수 환경에 넣는 변수가 아님 |

설정 예시는 [backend/.env.example](../backend/.env.example)와 [frontend/.env.example](../frontend/.env.example)을 참고한다. 실제 .env, 비밀값과 private_exports는 Git에서 제외한다. [backend/.vercelignore](../backend/.vercelignore)는 CLI 배포 시 로컬 DB·비공개 export·가상환경·임시 데이터가 함수 업로드에 섞이지 않게 한다. 프론트엔드의 [vercel.json](../frontend/vercel.json)은 직접 접속한 SPA 경로를 index.html로 rewrite한다.

개발 실행의 기본 순서는 백엔드 Python 의존성 설치 → DB URL 확인 → FastAPI 실행, 프론트엔드 npm 의존성 설치 → Vite 실행이다. 백엔드에서 환경 변수를 생략하면 로컬 SQLite가 생성될 수 있으므로 **기존 DB를 다루기 전 DATABASE_URL을 확인**한다. DB 이관은 앱 요청을 받기 전에 실행한다. 로컬 개발에서 예약 크롤링을 원하지 않으면 ENABLE_SCHEDULER=false를 둔다.

## 12. 보안, 검증 현황, 운영상 경계

| 구분 | 현재 사실과 조치 |
| --- | --- |
| API 접근 | Cron 경로만 CRON_SECRET Bearer 인증을 확인한다. **일반 교육생·메모·일정 API에는 로그인/인가가 없다.** 공개 URL 운영 전에 사용자 인증 또는 프로젝트 접근 보호가 필요하다. CORS는 인가를 대신하지 않는다. |
| 개인정보 | 교육생 기본 정보, 전화·상담·메모는 민감하다. 비공개 roster JSON과 DB 접속값은 GitHub/Vercel 번들에 넣지 않고 로컬 안전 경로에서 다룬다. |
| 예약 실행 | 현재 1기 15페이지를 순차 수집한다. 함수 제한 시간을 넘을 가능성은 실제 배포 후 관측해야 한다. Vercel Cron 실패 자동 재시도와 중복 실행 방지 잠금은 현재 구현돼 있지 않다. |
| 크롤링 데이터 품질 | LMS HTML 구조나 인증 방식이 바뀌면 파서가 실패한다. 빈 목록은 기본적으로 오류로 감지하지만 실제 수집 성공률·매칭되지 않은 이메일 수를 운영에서 확인해야 한다. |
| 참조 무결성 | 일부 논리 참조에는 물리 FK가 없다. 특히 외부 team_sn과 전담팀 ID의 동일성을 가정하지 않는다. |
| 마이그레이션 | 현행 방식은 앱 코드의 호환 이행 함수다. 기존 DB에 적용할 때는 별도 백업과 검토가 필요하다. |
| 프론트엔드 갱신 | 실시간 서버 푸시는 없다. 읽기/쓰기 후 HTTP 재조회하며 팀 상세는 탭이 보일 때 60초 간격과 가시성 변경 시 재조회한다. 전역 기수 선택은 새로고침 시 초기화된다. |

2026-10-20 기준 로컬 QA에서는 백엔드 [오프라인 테스트](../backend/tests/test_vercel_workflow.py) **14개**, 프론트엔드 **npm run build**, Python 컴파일·의존성 검사가 통과했다. 테스트는 Cron 인증/실패, 빈 수집 처리, 팀 프로젝트 변경일, roster 미리보기·반영·재반영, Vercel 시작 모드 등을 포함한다. **실제 Vercel 프로젝트 배포, 원격 PostgreSQL/MySQL 연결, 라이브 LMS 크롤링, 원격 초기 이관은 아직 검증하지 않았다.** 프론트엔드 package.json에는 별도 자동 테스트 스크립트가 없다.

## 13. 다음 개발자가 변경할 때의 순서

1. **새 기수의 크롤링 추가:** 먼저 기수/교육생을 DB에 준비하고 [crawl_config.py](../backend/app/services/crawl_config.py)에 해당 기수의 실제 LMS 미션 번호·레벨·라벨을 넣는다. 빈 목록이 정상인 항목만 allow_empty를 명시한다. 2기 예시는 실행 설정이 아니라 주석 템플릿이다. 현재 진도 목표는 관측된 미션 라벨 수를 우선 쓰고 없으면 기본 목표(1·2단계 3개, 3단계 2개)를 쓴다. 설정의 `level_requirements`는 현재 진도 계산에서 읽지 않는다.
2. **DB 필드·테이블 변경:** [models.py](../backend/app/models.py)를 고치고 기존 운영 DB에도 적용할 [migrations.py](../backend/app/migrations.py)의 호환 경로를 만든다. Vercel 요청 시 DDL이 실행되지 않으므로 배포 전 이행 순서를 문서화한다.
3. **API 변경:** 적절한 [라우터](../backend/app/routers/)의 입력 검증, 기수/팀 범위 확인, commit/rollback, 오류 응답을 함께 수정한다. 프론트엔드 [api 래퍼](../frontend/src/api/)와 호출 화면을 같은 계약으로 맞춘다.
4. **진도 규칙 변경:** LMS 파싱은 crawl_parser, DB 반영은 crawl_persistence, 현재/과거 단계 계산은 progress_state, 집계 응답은 dashboard에서 각각 수정한다. 팀 프로젝트의 외부 팀 번호와 전담팀 ID를 혼동하지 않는다.
5. **화면·색상 변경:** JSX와 같은 이름의 CSS를 함께 보고, 공통 색은 [index.css](../frontend/src/styles/index.css)의 다크/라이트 변수 두 곳에서 정의한다. 페이지별 고정 색을 넣기 전에 토큰을 우선 사용한다.
6. **배포 전 확인:** 비공개 파일 추적 여부, 백엔드 테스트, 프론트엔드 빌드, Cron 실행 시간, 대상 DB 스키마·이관 건수, 인증 보호 상태를 확인한다. 라이브 QA 절차는 [배포 안내](../backend/VERCEL_DEPLOY.md)에 있다.
