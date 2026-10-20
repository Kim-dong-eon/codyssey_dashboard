# Codyssey 교육생 관리 대시보드 기술 명세서

> 기준: 2026-10-20 현재 저장소의 구현. 이 문서는 코드가 실제로 하는 일을 설명한다. 운영 환경에 아직 연결하지 않은 기능은 별도로 표시한다. 교육생의 실제 이름, 연락처, 이메일과 비밀값은 포함하지 않는다.

## 1. 문서의 목적과 읽는 순서

이 서비스는 기수별 교육생과 전담팀을 관리하고, 외부 Codyssey LMS의 미션 현황을 가져와 대시보드·팀 현황·교육생 상세 화면에 표시한다. 담당자가 직접 작성하는 메모, 상담, 팀 전화, 공지, 일정, 행사 참석 기록은 같은 DB에 저장한다. 처음 참여한 개발자는 아래 순서로 읽으면 된다.

1. **2장**에서 요청과 데이터의 큰 흐름을 파악한다.
2. **4~6장**에서 화면, API, DB의 소유 관계를 확인한다.
3. **7~10장**에서 API, 크롤링, 진도 계산, 초기 이관의 순서를 확인한다.
4. **11~12장**에서 환경 변수, 배포 설정, 현재 한계를 확인한다.
5. **14~20장**에서 기능별 버튼·필터·API·DB 쓰기와 LMS 수집 과정을 단계별로 추적한다.
6. **21~22장**에서 새 DB 준비와 초기 이관, 배포 순서, 값의 원천을 찾는다.
7. **13장**의 변경 지침을 따라 새 기수나 기능을 추가한다.

| 알고 싶은 기능 | 상세 위치 | 주요 소스 |
| --- | --- | --- |
| 기수 선택·기한·테마·검색 | 14장 | `Topbar.jsx`, `cohorts.py` |
| 대시보드·미션 완료율·정체 명단 | 15장 | `Dashboard.jsx`, `dashboard.py`, `progress_state.py` |
| 전담팀 이동·팀 상세·학습지원 | 16장 | `FacilitatorTeams.jsx`, `TeamDetail.jsx`, `teams.py`, `trainees.py` |
| 교육생 상세·드랍·상담·개인 메모 | 17장 | `TraineeList.jsx`, `trainees.py` |
| 팀 기록 모음·팀 전화·긴급 공지 | 18장 | `TeamMemos.jsx`, `teams.py`, `dashboard.py` |
| LMS 팀 프로젝트·공지·달력·참석 명단 | 19장 | `TeamProjects.jsx`, `Schedule.jsx`, `schedules.py` |
| 크롤링·DB 동기화·단계 판정 | 20장 | `crawl*.py`, `progress_state.py` |
| 스키마·초기 이관·Vercel | 21장 | `migrations.py`, `trainee_transfer.py`, `vercel.json` |
| 화면 값의 저장 위치 찾기 | 22장 | 데이터 원천·변경 지점 표 |

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

## 14. 기능별 실행 플로우: 공통 규칙과 기수

앞의 2~10장은 시스템 구조를 설명한다. 이 장부터는 **사용자 행동 → React 상태 → HTTP 요청 → 백엔드 조회/검증 → DB 변경 → 다시 화면에 표시**되는 순서로 기능을 추적한다. 표의 `조회`는 DB를 바꾸지 않으며 `쓰기`는 commit 후 지속된다. 검색어, 펼침 상태, 모달 입력, 날짜 초안처럼 React 컴포넌트에만 있는 값은 새로고침 시 사라진다. 일반 API에는 사용자 인증이 없다는 12장의 운영 경계도 각 플로우에 공통으로 적용된다.

### 14.1 앱 시작, 기수 선택, 테마와 전역 검색

1. 브라우저가 [main.jsx](../frontend/src/main.jsx)를 실행하면 localStorage의 `codyssey-theme`을 읽어 HTML의 `data-theme`을 먼저 정한다. CSS가 그 속성에 맞는 색 변수를 적용한다. [Topbar.jsx](../frontend/src/components/Topbar.jsx)의 effect가 이후 브라우저 `colorScheme`, 메타 `theme-color`, localStorage 값을 동기화한다. 저장값이 없으면 현재 코드의 기본 다크 변수를 쓴다. 테마 선택은 브라우저 안에만 저장되며 DB 행은 만들지 않는다.
2. [App.jsx](../frontend/src/App.jsx)의 `selectedCohort` 초기값은 숫자 `1`이다. [Topbar.jsx](../frontend/src/components/Topbar.jsx)가 `GET /api/cohorts/`로 실제 기수 목록을 불러온다. 현재 선택 ID가 목록에 없으면 첫 번째 기수로 조정한다. 기수를 바꾸면 Context가 바뀌고 현재 화면의 해당 기수 조회 effect가 다시 실행된다. 기수 선택값은 localStorage에 저장하지 않으므로 새로고침 후 다시 초기화된다.
3. React Router가 URL에 맞는 화면을 지연 로드한다. 알 수 없는 URL과 `/`은 `/dashboard`로 보낸다. Topbar는 선택 기수의 명부를 받아 검색 입력의 이름·이메일 일치 항목을 최대 6개 보여준다. Ctrl/Cmd+K는 검색창에 초점을 맞춘다. 검색 결과를 누르면 그 이름으로, Enter를 누르면 현재 검색어로 `/trainees?search=...`에 이동한다. 검색 입력과 현재 열려 있는 UI는 서버 데이터가 아니다.
4. [axios.js](../frontend/src/api/axios.js)는 모든 도메인 래퍼가 공유한다. 빌드된 `VITE_API_BASE_URL`이 없으면 `/api`를 쓴다. 로컬 Vite는 이 요청을 기본 `localhost:8000` 백엔드로 프록시한다. 화면마다 별도의 원격 캐시나 실시간 연결은 없으며 필요한 곳에서 HTTP로 재조회한다.

### 14.2 기수 생성과 기한 수정

| 단계 | 현재 동작 |
| --- | --- |
| 목록 | Topbar가 `GET /api/cohorts/`를 호출한다. 서버는 `cohorts`를 읽어 기수 ID, 이름, 시작일, 기한을 반환한다. |
| 기수 생성 | Topbar UI는 이름과 기한을 차례로 입력받아 `POST /api/cohorts/`로 보낸다. API 요청 모델에는 `cohort_name`, 필수 `end_date`, 선택 `start_date`가 있지만 현재 Topbar에는 시작일 입력이 없다. |
| 검증·저장 | [CohortCreate](../backend/app/schemas.py)가 시작일보다 빠른 기한을 422로 거부한다. 서버는 `cohorts` 한 행을 INSERT·commit·refresh하고 새 ID를 반환한다. |
| 기한 변경 | `PATCH /api/cohorts/{cohort_id}`는 `end_date`만 바꾼다. 없는 기수는 404, 시작일보다 앞선 기한은 422다. Topbar는 PATCH 응답의 기수를 현재 `cohorts` 상태 배열 안에서 교체하며 목록 GET을 다시 호출하지 않는다. |

기수 생성만으로 외부 LMS 크롤링이 시작되지는 않는다. 크롤러는 별도의 [crawl_config.py](../backend/app/services/crawl_config.py)에 활성 기수와 미션 번호가 있어야 수집한다. `end_date`는 교육 운영 기한으로 DB에 남지만, 현재 스케줄러가 기한 도달을 근거로 자동 중단하는 규칙은 없다.

## 15. 대시보드, 단계별 미션, 진도 정체

### 15.1 화면을 열었을 때 두 조회가 병행되는 이유

[Dashboard.jsx](../frontend/src/pages/Dashboard.jsx)는 기간별 진도와 공지를 서로 다른 데이터로 관리한다. 화면의 첫 기간은 **지난주 월요일~일요일**이며, 이는 백엔드가 날짜 인자를 받지 않았을 때의 기본 **오늘 포함 최근 7일**과 다르다. 기수 또는 확정된 기간 `range`가 바뀌면 `GET /api/dashboard/{cohort_id}?start_date=...&end_date=...`를 다시 요청한다. 기수가 바뀌면 별도로 `GET /api/dashboard/{cohort_id}/notices`를 요청한다. 날짜 입력의 `rangeDraft`는 조회 버튼을 누르기 전까지 서버 요청에 반영되지 않는다.

~~~mermaid
sequenceDiagram
    actor User as 담당자
    participant UI as Dashboard.jsx
    participant API as dashboard.py
    participant DB as DB
    User->>UI: 기수 선택
    par 기간별 진도 요청
        UI->>API: GET dashboard/{cohort_id}?start_date&end_date
        API->>DB: 기수 명단 + 팀 + flags outer join
        API->>DB: 해당 교육생 progress_logs 배치 조회
        API->>API: 현재 상태·마지막 완료일·일별 이력 계산
        API-->>UI: trainees, missionProgressByTrainee, chartData 등
    and 공지 요청
        UI->>API: GET dashboard/{cohort_id}/notices
        API->>DB: 공지 기수 필터, 고정 우선·최신순
        API-->>UI: notices
    end
    UI->>UI: 카드·차트·명단·공지 각각 렌더링
~~~

백엔드 [dashboard.py](../backend/app/routers/dashboard.py)는 날짜 역순 입력을 422로 거부한다. DB에서 해당 기수의 `trainees`를 `teams`와 `trainee_flags`에 outer join해 팀 이름과 두 상태 플래그가 없어도 교육생을 유지한다. `team_id` 쿼리 인자가 있으면 현재 팀으로 명단 범위를 좁힌다. `progress_logs`는 범위에 맞는 교육생 ID 집합으로 배치 조회한다. 현재 `trainees` 응답에서는 드랍 교육생을 빼지만, 과거 일별 집계에서는 드랍일을 사용해 해당 날짜부터 제외하고 드랍 누계를 센다.

| 응답 필드 | 생성 방법과 화면 용도 |
| --- | --- |
| `trainees` | 비드랍 교육생의 ID·이름·팀·현재 단계·개인 완료 수/목표·팀 미션 완료 여부·관심/기술지원 플래그·마지막 완료일. 단계별 아코디언, 담당팀 인원, 정체 명단의 공통 입력이다. |
| `missionProgressByTrainee` | 미션 상세 행마다 교육생 ID, 단계, 개인/팀 종류, 라벨, 완료 여부, 완료일을 제공한다. 아래 미션별 완료 인원 카드가 사용한다. |
| `chartData` | 요청 기간의 날짜별 `level1/2/3`, `tasksDone`, `projectDone`, `completed`, `dropped` 집계다. 첫 점과 마지막 점의 차이를 카드에 보이고, 단계/수료는 선 그래프에 그린다. |
| `historyAvailable`, `historyMode` | 완료일 등 과거 근거의 유무와 `crawl_missions`·`legacy_logs`·`none` 모드를 알린다. 근거가 없으면 과거 차트 값은 `null`이 될 수 있어 화면에 안내한다. `legacy_logs`는 미션 완료일이 없을 때 다른 날짜 근거가 있다는 뜻이며 옛 summary 행만 있다는 증거는 아니다. |
| `range` | 서버가 실제 사용한 시작일·종료일이다. |

같은 GET에 `roster_only=true`를 주면 `trainees`만 계산한 뒤 `missionProgressByTrainee`와 `chartData`를 빈 배열로 반환한다. 이 모드는 팀 편성·팀 상세·학습지원 화면에서 명단이 필요할 때 차트 계산을 줄이는 용도다. 미션별 완료율을 보여줄 대시보드 본 화면에는 사용하지 않는다.

화면 안내에는 현재 작은 불일치가 있다. API의 이전 기록 모드 문자열은 `legacy_logs`인데 대시보드 본 화면은 `legacy`를 검사하므로 해당 전용 안내가 표시되지 않는다. 팀 상세의 [PeriodProgressSection.jsx](../frontend/src/components/PeriodProgressSection.jsx)은 `legacy_logs`를 검사해 안내를 표시한다. 집계 자체의 모드는 API 응답값을 기준으로 읽는다.

### 15.2 단계 아코디언과 미션별 완료율은 서로 다른 계산

대시보드 상단의 **Final → 2단계 → 1단계 진입** 아코디언은 `trainees[].level`을 기준으로 교육생을 나눈다. 이름 검색은 현재 기수 명단의 부분 문자열 필터다. `완료자/미완료자` 버튼은 여기서 **현재 단계의 팀 미션 완료 여부(`optional_task_done`)**를 고른다. 전체 과정 수료 여부(`is_completed`)와 동일한 필터라고 해석하면 안 된다. 행의 필수 진도율은 `done/target`, 옆의 선택과제는 팀 미션 완료 표시다. 아코디언은 한 번에 하나만 펼친다.

[MissionProgressByLevel.jsx](../frontend/src/components/MissionProgressByLevel.jsx)는 같은 화면의 별도 미션 카드다. `단계별 대상` 선택 시 해당 **현재 단계**의 비드랍 교육생 수가 각 단계 카드의 분모이고, `전체 인원` 선택 시 선택 기수의 **모든 비드랍 교육생**이 각 카드의 분모다. 미션 라벨별 완료 인원은 응답의 완료 로그 중 분모에 포함되는 교육생 ID를 `Set`으로 중복 제거해 센다. 완료율은 `round(완료 ID 수 / 분모 × 100)`이다. 이 카드는 진행 현황 표시이며, 단계 승급 자체는 서버 [progress_state.py](../backend/app/services/progress_state.py)의 개인 목표 수와 팀 미션 완료 규칙으로 계산한다. 크롤링된 라벨이 없으면 미션 카드에는 목록이 없다는 안내를 보여준다.

예를 들어 현재 2단계에 있는 사람이 과거에 1단계 미션을 완료했더라도 `1단계/단계별 대상` 카드의 분모·분자에는 들어가지 않는다. 1단계 카드에 기수 전체의 누적 완료자 수가 필요하면 `전체 인원` 모드를 골라야 한다.

기간 카드의 첫 날짜와 마지막 날짜는 `chartData[0]`과 마지막 원소다. 화면은 각 지표의 시작·종료·증감을 보여주고 Recharts 선 그래프에는 1단계, 2단계, Final, 수료 계열을 그린다. 담당 퍼실팀 인원 막대 그래프는 `trainees`를 팀 이름별로 묶어 내림차순으로 그리며 `미배정`도 한 그룹으로 센다. 그래프와 카드의 계산은 프론트엔드에서 이루어지고, 차트의 원천 일별 값은 서버가 만든다.

### 15.3 진도 업데이트 정체 명단

서버는 각 교육생의 **완료 상태인 개인·팀 미션 가운데 `completed_at`이 있는 행의 최대 날짜**를 `last_progress_at`으로 보낸다. 마지막 크롤러 실행 시각(`last_updated`)을 대신 쓰지 않는다. [Dashboard.jsx](../frontend/src/pages/Dashboard.jsx)는 기본 기준일을 오늘, 정체 기준을 7일, 팀을 전체, 정렬을 경과일 내림차순, `기록 없는 인원 포함`을 켠 상태로 시작한다.

1. 선택 기준일의 날짜와 `last_progress_at`의 날짜 부분을 비교해 음수가 되지 않는 경과일을 만든다. 완료일이 없거나 읽을 수 없으면 경과일은 `null`이고 화면에서는 `X`로 보인다.
2. 드랍 인원을 제외한다. 완료일이 있는 사람은 경과일이 선택한 `N일 이상`인 경우만 남긴다. 완료일이 없는 사람은 체크박스가 켜져 있을 때만 남긴다.
3. 전담팀 필터와 경과일 정렬을 적용한다. 정렬 동률은 이름 순이다. 카운트와 표의 교육생·팀·단계/과제·마지막 업데이트 날짜·경과일을 같이 바꾼다.
4. 이 필터들은 React 화면 상태이므로 DB를 바꾸지 않는다. 다만 기준 데이터가 새 크롤링으로 갱신되면 다음 HTTP 재조회 때 명단이 달라진다.

아코디언의 교육생 행에서 빠른 드랍 버튼을 누르면 브라우저 확인 → 선택적 사유 입력 → `PUT /api/trainees/{id}/drop` 순으로 진행한다. 입력을 취소하면 요청을 보내지 않는다. 성공하면 대시보드를 다시 읽고 현재 `trainees` 명단에서 빠진다. 드랍 이력은 DB에 남아 기간별 `dropped` 계산에 사용된다.

## 16. 전담팀 편성, 팀 상세, 학습지원 연계

### 16.1 전담팀 편성 보드/표를 만드는 조회

[FacilitatorTeams.jsx](../frontend/src/pages/FacilitatorTeams.jsx)는 기수가 바뀌면 `GET /api/teams/cohort/{cohort_id}`와 `GET /api/dashboard/{cohort_id}?roster_only=true`를 병렬로 요청한다. 팀 API는 팀 목록을 이름순으로 읽고 **비드랍** 교육생을 현재 `team_id`에 따라 묶는다. 팀 ID가 null이거나 유효한 기수 팀에 연결되지 않는 교육생은 삭제하지 않고 `미배정` 가상 대기열로 넣는다. 각 팀의 프로젝트 요약도 붙이고 필요한 기본 프로젝트 항목이 없으면 화면용 `팀 셋팅 중` 상태를 채운다. 대시보드 응답은 카드의 현재 단계·개인 과제·최근 완료일·관심/연계 플래그를 보완한다.

| 화면 조작 | 프론트엔드 → 서버 → 지속 결과 |
| --- | --- |
| 보드/표 전환, 이름 검색 | React 상태만 바꾼다. 서버 행이나 `trainees` 값을 고치지 않는다. |
| 전담팀 추가 | `POST /api/teams/`에 `cohort_id`, `team_name`을 보내 `teams`를 INSERT·commit하고 목록을 다시 읽는다. 이 엔드포인트는 기수 존재를 별도로 검사하지 않는다. |
| 카드 드래그 | 출발/도착 열의 멤버를 화면에서 먼저 옮겨 보인 뒤 `PUT /api/trainees/{id}/team`에 `to_team_id`를 보낸다. null이면 미배정이다. 실패하면 목록을 다시 읽어 낙관적 화면 변경을 되돌린다. |
| 일괄 등록 | 붙여넣기 텍스트에서 이름과 이메일을 파싱하고 목적 팀을 정해 `POST /api/trainees/bulk`를 보낸다. 새 이메일은 교육생을 추가하고 같은 기수 기존 이메일은 목적 팀으로 재배정한다. |
| 팀 삭제 | 확인 후 `DELETE /api/teams/{team_id}`를 호출한다. 백엔드는 그 팀 교육생의 `team_id`를 null로 바꾸고 팀 행을 같은 commit에서 삭제한다. 교육생 자체는 남는다. |
| 카드의 메모/드랍 아이콘 | 각각 개인 메모 생성 또는 드랍 요청을 보낸다. 카드 클릭 이벤트는 전파를 막아 상세 열기와 동시에 실행되지 않도록 한다. |

~~~mermaid
sequenceDiagram
    actor User as 담당자
    participant Board as 전담팀 보드
    participant API as trainees.py
    participant DB as trainees / facilitator_memos
    User->>Board: 교육생을 다른 팀 또는 미배정으로 드래그
    Board->>Board: 멤버 열을 낙관적으로 이동
    Board->>API: PUT /trainees/{id}/team {to_team_id, note?}
    API->>DB: 교육생 조회, 변경 전후 팀 비교
    alt 실제 변경됨
        API->>DB: team_id 변경, 선택적 이동 메모 생성, commit
    else 동일 팀
        API->>API: DB 변경과 메모 생성 생략
    end
    alt 요청 성공
        API-->>Board: 응답
        Board->>Board: 낙관적으로 옮긴 열을 유지
    else 요청 실패
        Board->>API: 서버 목록 재조회로 화면 복원
    end
~~~

개별 팀 이동 API는 교육생 ID가 없으면 404다. 목적 팀의 존재와 **같은 기수인지 여부를 이 엔드포인트가 직접 확인하지는 않는다**. 반면 일괄 등록 API는 기수 없음 404, 목적 팀 없음/타 기수 422, 공백·요청 내 이메일 중복 422, 다른 기수 기존 이메일 409를 검사한다. 이메일은 trim·소문자화하며 기존 교육생의 이름은 일괄 등록으로 덮어쓰지 않는다. 일괄 요청 전체를 한 commit으로 처리하고 DB 오류에서는 rollback한다. 팀 프로젝트의 외부 `team_sn`은 전담팀 삭제의 물리 FK 대상이 아니다.

### 16.2 담당팀 상세의 다섯 데이터 원천

팀 카드에서 상세를 열면 [TeamDetail.jsx](../frontend/src/pages/TeamDetail.jsx)는 `team_id`를 포함한 `roster_only` 대시보드, 팀 목록, 기수 메모, 기수 연락 기록, 기수 팀 전화 기록을 병렬 조회한다. 명단의 현재 멤버 ID를 기준으로 개인 메모·상담을 화면에서 좁힌다. 이는 각각의 원천 테이블을 합성한 화면이지 `team_detail` 같은 별도 테이블이 아니다. 팀/기수가 바뀔 때, 화면이 보이는 동안 60초마다, 탭이 다시 보일 때 같은 묶음을 재조회한다.

1. 좌측 카드 검색은 이름 매치를 찾고 해당 단계 아코디언을 펼친다. 선택과제 완료/미완료, `requires_attention` 위험 표시, `is_tech_linked` 학습지원 연계 필터는 함께 적용된다. 각 카드의 단계·과제 수는 대시보드 파생 응답이며 메모 개수와 무관하다.
2. 위험/연계 토글은 `PUT /api/trainees/{id}/status`로 `trainee_flags` 한 행의 제공된 불리언 값만 바꾼다. 플래그 행이 없으면 생성한다. 연계해도 기존 `trainees.team_id`는 그대로다. 드랍은 별도의 `PUT /drop`이다.
3. 팀 메모는 `POST /api/teams/{team_id}/memos`, 교육생 개인 메모는 `POST /api/trainees/{trainee_id}/memos`를 쓴다. 두 종류 모두 `facilitator_memos`에 저장하지만 개인 메모에는 `trainee_id`가 들어간다. 팀 상세에서 수정은 PATCH, 삭제는 DELETE 뒤 관련 조회를 갱신한다.
4. 카드의 최근 연락은 개인 `contact_logs`와 해당 팀의 전화 캠페인 중 최신 시각을 비교해 선택한다. 팀 전화의 수신 여부는 카드 본문에 `받음/미수신`으로 보이고, 툴팁에는 공통 사유와 대상별 특이사항이 나온다. 우측 기록 목록은 **팀 메모 + 현재 멤버의 개인 메모 + 팀 전화 캠페인**을 수정일 또는 작성일 역순으로 합친다. 개인 상담은 최근 연락 판정에는 쓰지만 이 우측 기록 목록에는 포함하지 않는다.
5. [PeriodProgressSection.jsx](../frontend/src/components/PeriodProgressSection.jsx)은 별도로 `team_id`와 기간을 넣은 **전체** 대시보드 GET을 호출한다. 팀의 6개 변화 카드와 4개 선 계열은 그 응답에서 만든다. 그래프 아래 정체 명단은 마지막 완료일·기준일·임계일·기록 없음 포함·정렬을 적용하며 행 선택으로 메모 대상을 고를 수 있다.

### 16.3 학습지원 연계 화면

[TechSupportTeam.jsx](../frontend/src/pages/TechSupportTeam.jsx)는 `GET /api/dashboard/{cohort_id}?roster_only=true`의 교육생 중 `is_tech_linked=true`만 보여준다. 단계 분포 그래프와 선택과제·위험 필터는 이 집합을 화면에서 계산한다. 위험 표시를 바꾸거나 연계를 해제하면 `PUT /api/trainees/{id}/status`의 해당 필드를 갱신하고 다시 조회한다. 연계 해제는 교육생을 삭제하거나 전담팀에서 빼는 작업이 아니다. 따라서 같은 교육생이 전담팀 보드와 학습지원 화면에 동시에 보일 수 있다.

## 17. 교육생 명부, 상세, 상담, 개인 메모

### 17.1 명부 조회와 화면 필터

[TraineeList.jsx](../frontend/src/pages/TraineeList.jsx)는 선택 기수가 바뀌면 `GET /api/trainees/cohort/{cohort_id}`와 팀 목록을 가져온다. 교육생 목록 API는 [trainees.py](../backend/app/routers/trainees.py)에서 `trainees`에 팀명·`trainee_flags`를 outer join하고, 기수별 `progress_logs`를 배치로 읽어 단계와 과제 수를 파생한다. 플래그 행이 없어도 `requires_attention=false`, `is_tech_linked=false`로 반환한다. **이 명부 API에는 드랍 인원도 포함**된다. 대시보드의 현재 활성 명단과 대상 집합이 다르므로 두 화면의 단순 행 수를 같은 수치로 읽지 않는다.

이름/이메일 검색, `전체·학습지원 연계·미배정·특정 팀` 필터, 단계 필터와 드랍 인원을 아래로 보내는 정렬은 화면에서 적용한다. URL의 `?search=`를 검색 입력과 동기화하므로 Topbar의 검색 결과에서 넘어와도 명부 안에서 해당 이름을 찾을 수 있다. 검색어나 표 필터 변경은 서버에서 교육생을 다시 저장하지 않는다. 행을 한 번 클릭하면 상세를 열고 같은 행을 다시 누르면 닫는다.

### 17.2 한 교육생 상세를 열 때

~~~mermaid
sequenceDiagram
    actor User as 담당자
    participant List as TraineeList.jsx
    participant API as trainees.py
    participant DB as DB
    User->>List: 교육생 행 선택
    List->>API: GET /trainees/{trainee_id}/detail
    API->>DB: 교육생·팀·플래그 조회
    API->>DB: 해당 교육생 progress_logs 및 기수 미션 목표 조회
    API->>DB: contact_logs·facilitator_memos 최신순 조회
    API->>API: 현재 상태와 날짜별 진도 재구성
    API-->>List: trainee, logs, progress, memos
    List-->>User: 프로필·과제·진도 차트·상담·메모 표시
~~~

대상 교육생이 없으면 404다. 상세의 `trainee`는 기본 프로필과 현재 상태, `logs`는 개인 연락 기록, `memos`는 개인 메모, `progress`는 진도와 날짜별 차트 정보다. 날짜별 상세 진도는 완료일·단계 통과일·마지막 기록 시점들을 모아 상태를 재계산한다. 기록이 전혀 없으면 현재 시점의 점 하나를 표시한다. 프론트엔드는 단계 선과 과제 막대의 결합 차트로 보여준다. 이 차트 또한 매일 찍어둔 별도 스냅샷 테이블을 읽는 방식이 아니다.

팀 이동 선택은 `PUT /api/trainees/{id}/team`으로 `to_team_id`를 보내고 상세·명부를 재조회한다. 메모를 함께 보내면 **실제로 팀이 달라질 때만** 조 변경 메모가 `facilitator_memos`에 남는다. `to_team_id=null`은 미배정이다. 단건 이동 API에는 목적 팀의 같은 기수 여부를 직접 검사하는 코드가 없으므로, 화면이 보여주는 유효 팀 선택지가 실질적인 입력 경계다.

### 17.3 교육생 상태 변경의 저장 위치

| 행동/API | 입력과 검증 | DB 결과 | 화면 반영 |
| --- | --- | --- | --- |
| 단건 등록 `POST /api/trainees/` | `cohort_id`, `name`, `email`, 선택 `phone`. Pydantic 타입 검증 외에 라우터가 기수 존재·이메일 중복을 별도로 확인하지 않는다. | `trainees` INSERT, 기본 미배정·비드랍. 이메일 유일성은 DB 제약에 의존한다. | 응답은 등록 메시지이며 이후 목록 조회가 필요하다. |
| 드랍/복구 `PUT /api/trainees/{id}/drop` | `is_dropped`, 선택 `drop_date`, `drop_reason`. 교육생 없음 404. | 드랍 시 값 저장, 복구 시 날짜·사유를 null로 정리한다. | 명부/선택 상세를 다시 읽고, 대시보드 현재 활성 명단에서는 드랍자를 제외한다. |
| 위험/연계 `PUT /api/trainees/{id}/status` | `requires_attention?`, `is_tech_linked?`; 교육생 없음 404. | `trainee_flags` 행이 없으면 생성하고 요청에 제공된 필드만 바꾼다. | 전담팀·학습지원·상세의 뱃지와 필터가 재조회 후 바뀐다. |
| 일괄 등록 `POST /api/trainees/bulk` | `cohort_id`, `team_id?`, `{name,email}` 배열; 공백·이메일 중복·기수/팀 범위·타 기수 기존 이메일 검사. | 새 인원 INSERT 또는 같은 기수 기존 인원의 `team_id` 수정. 전체 한 번 commit. | 현재 전담팀 보드를 다시 읽는다. 명부 화면은 진입 또는 기수 변경 시 별도로 조회한다. |

### 17.4 상담/개별 연락 기록

명부의 상담 버튼을 누르면 방식·주제·내용을 입력한다. [TraineeList.jsx](../frontend/src/pages/TraineeList.jsx)는 현재 시각과 기본 담당자명을 함께 `POST /api/trainees/{id}/contact`로 보낸다. 백엔드 요청에는 `contact_date`, `contact_method`, `topic`, `content`, `manager_name`이 필요하고, `contact_logs` 한 행을 INSERT·commit한다. 상담 버튼의 기본 방식은 대면이며 화면에서 다른 방식도 고를 수 있다.

한 기수의 전체 상담 조회는 `GET /api/trainees/cohort/{id}/contacts`다. 서버가 `contact_logs → trainees`를 연결하고 팀 이름을 outer join해 최신 연락일·ID순으로 반환한다. 팀이 없으면 `미배정`으로 보인다. 개인 상세도 해당 사람의 로그를 최신순으로 보여준다. 삭제는 `DELETE /api/trainees/contact/{contact_id}`이고 없는 기록은 404다. 현재 이 라우터 집합에는 **상담 수정 API가 없고**, 생성 API는 대상 교육생의 존재를 직접 확인하지 않아 DB 관계 제약의 영향을 받는다.

### 17.5 개인 메모

개인 메모 생성은 `POST /api/trainees/{id}/memos`에 선택적 제목, 필수 본문, 선택적 작성자를 보낸다. 백엔드는 교육생 존재를 확인하고 공백 본문을 422로 거부한 뒤 `facilitator_memos`에 기수·당시 팀·교육생 ID를 기록한다. PATCH는 제목/본문 중 제공된 필드만 바꾸고 `updated_at`을 갱신한다. DELETE는 해당 메모를 제거한다. 개인 메모 API는 `trainee_id`가 들어 있는 메모만 대상으로 삼는다. 교육생 상세 화면은 생성/수정 뒤 상세를 다시 읽고, 삭제 뒤에는 현재 `memos` 상태에서 해당 ID를 로컬 제거한다. 현재 메모 카드는 수정된 내용은 보여주지만 날짜 텍스트는 `created_at`을 표시하므로 **수정 시각과 화면에 보이는 날짜가 다를 수 있다**.

## 18. 팀 기록 모음, 팀 메모, 팀 전화

### 18.1 `팀 기록 모음`은 읽기 모델이고 저장 테이블은 여섯 갈래

[TeamMemos.jsx](../frontend/src/pages/TeamMemos.jsx)는 선택 기수가 바뀌면 기수 메모, 팀 목록, 상담/연락, 공지, 일정, 팀 전화 캠페인 **여섯 API**를 병렬로 호출한다. 결과를 `source`, 화면용 ID, 제목/본문/팀/교육생/작성일/수정일 같은 공통 필드로 변환해 한 목록에 합친다. 이 목록을 저장하는 `all_records` 같은 테이블은 없다. 병렬 요청 가운데 하나가 실패하면 현재 구현의 전체 조회가 catch로 들어가므로 일부 소스만 정상 표시된다고 가정하면 안 된다.

| 피드에 보이는 원천 | 실제 저장 위치 | 이 화면에서 가능한 작업 |
| --- | --- | --- |
| 팀 메모 | `facilitator_memos`에서 `trainee_id` 없는 팀 연결 기록 | 팀 선택 후 생성, 수정, 삭제 |
| 개인 메모 | `facilitator_memos`에서 `trainee_id` 있는 기록 | 기수 메모 조회에 포함, 원래 개인 메모 API로 수정/삭제 |
| 상담/개별 연락 | `contact_logs` | 기록 조회, 삭제; 신규 상담은 교육생 명부에서 입력 |
| 팀 전화 | `team_call_campaigns` + `team_call_recipients` | 공통 사유/대상/수신 여부/특이사항 생성·수정·삭제 |
| 공지 | `notices` | 미완료 긴급 공지 구역에서 완료 처리, 일반 기록 카드에서는 삭제. 등록·고정 변경은 대시보드에서 수행 |
| 일정·행사 | `schedule_events` | 통합 목록에서 확인; 일정 자체의 수정·삭제는 일정 화면에서 수행 |

제목, 본문, 교육생, 팀, 작성자, 공지 분류, 전화 대상자 이름·개별 특이사항을 대상으로 하는 텍스트 검색과 기록 유형/팀 필터는 합쳐진 결과에 적용하는 **프론트엔드 필터**다. 정렬은 `updated_at`이 있으면 우선 쓰고 없으면 소스별 `displayDate`를 사용한다. 이 값은 상담은 `contact_date`, 일정은 `event_date`, 나머지 대부분은 `created_at`이다. `team_board_memos`는 팀 프로젝트 현황판의 별도 메모이며 이 여섯 소스 조회에는 포함되지 않는다.

### 18.2 팀 메모 작성과 수정

팀 기록 화면의 새 기록 모드는 현재 **팀 메모**와 **팀 전화** 두 가지다. 팀 메모는 팀과 본문을 선택하고 선택적 제목을 입력해 `POST /api/teams/{team_id}/memos`로 보낸다. 백엔드는 팀 존재를 확인하고 공백 본문을 422로 거부한다. `facilitator_memos`에 그 팀의 기수/팀 ID와 본문을 넣고 한 번 commit한다. 성공하면 현재 팀/유형 필터를 조정하고 기록을 다시 읽는다. 팀 상세에서도 같은 계열의 API를 사용한다.

팀 메모 PATCH/DELETE는 `team_id`와 `memo_id`의 조합을 찾고, 수정 시 `updated_at`을 갱신한다. **현재 팀 라우터에는 `trainee_id is null` 조건이 없어** 같은 팀 ID가 붙은 개인 메모 ID를 직접 넣어도 해당 행에 접근할 수 있다. 정상 UI는 기록 종류에 맞는 버튼을 쓰지만 API 차원에서 팀 메모 전용 권한 경계라고 볼 수 없다. 이 점은 향후 인증/인가와 메모 종류 검증을 추가할 때 검토해야 한다.

### 18.3 한 사유로 여러 명에게 전화한 기록

전화 기록은 실제 전화를 거는 기능이 아니다. 담당자가 전화를 돌린 뒤 **공통 전화 사유 한 건**과 **대상자별 결과 여러 건**을 남기는 기능이다. 팀을 고르면 화면은 팀원마다 `selected=false`, `received=true`, `note=''`의 입력 상태를 만든다. 대상 체크와 특이사항 편집은 분리되어 있어 대상 선택을 빠르게 하고 필요한 사람의 메모 칸만 확장할 수 있다. `received=true`가 기본이므로 연락을 받지 않은 사람만 해제하면 된다.

~~~mermaid
sequenceDiagram
    actor User as 담당자
    participant UI as TeamMemos.jsx
    participant API as teams.py
    participant DB as team_call_campaigns / recipients
    User->>UI: 팀, 공통 사유, 대상 1명 이상 선택
    User->>UI: 대상별 연락 받음 체크, 선택적 특이사항 입력
    UI->>API: POST /teams/cohort/{id}/call-campaigns
    API->>API: 팀/기수 및 대상의 소속·비드랍·중복 확인
    alt 입력 유효
        API->>DB: campaign 1행과 recipient N행 INSERT
        API->>DB: 한 트랜잭션 commit
        API-->>UI: 저장 결과
        UI->>API: 팀 전화 기록 재조회
    else 사유/대상/범위 오류
        API-->>UI: 404 또는 422, 저장하지 않음
    end
~~~

생성 요청의 핵심 구조는 `{team_id, reason, manager_name?, recipients:[{trainee_id, received, note?}]}`이다. 사유 공백, 대상 0명, 같은 교육생 중복은 422다. 해당 기수에 팀이 없으면 404다. 수신자는 모두 **같은 기수의 해당 팀에 현재 소속된 비드랍 교육생**이어야 하며 그렇지 않으면 전체 요청을 거부한다. 공통 사유·담당자·특이사항은 trim하고 빈 특이사항은 null로 저장한다. 캠페인과 모든 수신자를 하나의 commit에서 저장하므로 일부 대상만 기록되는 정상 성공 상태는 없다.

기록 조회는 기수의 캠페인을 최신순으로 읽은 뒤 수신자 행을 일괄 로드해 이름·수신 여부·특이사항을 붙인다. 수정 `PATCH /api/teams/cohort/{cohort_id}/call-campaigns/{campaign_id}`는 제공한 공통 사유 및 명단을 바꾼다. **수신자 명단을 제공하면 일부만 패치하는 방식이 아니라 기존 자식 행 전체를 새 명단으로 대체**한다. 따라서 수정 화면은 유지할 대상도 모두 다시 보내야 한다. 현재 수정 UI는 기존 대상자의 수신 여부·특이사항과 공통 사유만 편집하고 새 대상 추가/제거 컨트롤은 제공하지 않는다. API 차원에서는 전체 명단 대체가 가능하다. 수정 시 캠페인 `updated_at`이 갱신되고 피드 정렬에 반영된다. 삭제는 캠페인 ID와 기수를 확인한 뒤 캠페인 및 수신자 행을 함께 지운다. 없는 캠페인은 404다.

### 18.4 긴급 공지가 팀 기록 위에 보이는 경로

대시보드에서 공지의 `category`를 `긴급`으로 골라 등록해 두면 팀 기록 화면도 공지 API를 읽으므로 같은 공지를 받을 수 있다. 이 화면은 그중 **완료 상태가 아닌 긴급 공지**를 기록 건수 헤더 바로 아래 별도 구역으로 뽑는다. 표시 위치는 UI 조합이며 공지 DB 행을 복사하지 않는다. 완료 체크를 누르면 `PUT /api/dashboard/notices/{notice_id}`로 `status=완료`를 보내고 목록을 다시 읽는다. 그러면 별도 긴급 구역 조건에서는 빠지지만 원래 공지 기록은 삭제되지 않는다.

## 19. 팀 프로젝트, 공지 보드, 일정·행사

### 19.1 외부 LMS 팀 프로젝트를 보는 화면

[TeamProjects.jsx](../frontend/src/pages/TeamProjects.jsx)는 선택 기수가 바뀌면 `GET /api/teams/cohort/{cohort_id}/projects`와 `GET /api/teams/cohort/{cohort_id}/board-memos`를 병렬로 읽는다. 첫 API는 `team_projects`를 기수로 제한하고 전담팀 이름을 outer join해 팀 번호별 프로젝트를 묶는다. 프로젝트의 `team_id`는 LMS의 **외부 team_sn**을 저장하므로 전담팀의 `teams.team_id`와 같다는 보장은 없다. 이 때문에 이름 join이 맞지 않을 수 있고, 화면·문서는 외부 팀 번호를 전담팀 PK로 재사용해서는 안 된다.

화면은 프로젝트를 납작한 항목으로 만든 뒤 라벨이 `1-`, `2-`, `3-` 또는 `final`에 해당하는 단계로 그룹화한다. 팀/단계/멤버 검색과 상태 문자열의 대기·진행·완료 필터, 변경일 정렬은 React에서 적용한다. 한 프로젝트를 열면 상태, 팀, 단계, 멤버, 상태 변경일을 보여준다. 이 페이지에서 **LMS 프로젝트 상태를 직접 수정하는 API는 없다**. 다음 크롤링에서 수집된 상태/멤버가 달라지면 [crawl_persistence.py](../backend/app/services/crawl_persistence.py)가 `team_projects`를 갱신한다.

`status_changed_date`는 저장 경로상 프로젝트 **상태 또는 참여자 이름이 바뀐 때** 새로 기록한다. 과거 데이터에서 이 값이 없으면 조회 API가 관련 팀 과제 로그의 `last_updated` 최대값으로 화면용 날짜를 보완할 수 있다. 현재 UI의 `최근 크롤링 확인`이라는 문구를 모든 프로젝트의 마지막 HTTP 수집 시각이라고 해석하면 안 된다. 기록의 실제 의미는 위 두 경로에 따라 다르다.

### 19.2 프로젝트 현황판 메모는 기수 공용

현황판 메모는 팀 메모(`facilitator_memos`)나 LMS 프로젝트(`team_projects`)와 별도의 `team_board_memos`다. `GET /api/teams/cohort/{id}/board-memos`가 해당 기수 메모를 최신순으로 반환한다. `POST`는 본문과 작성자를 받아 기수 존재를 확인하고 공백 본문을 422로 거부한 뒤 저장한다. `DELETE /api/teams/cohort/{id}/board-memos/{memo_id}`는 **기수와 메모 ID가 함께 맞는지** 확인 후 지운다. 현재 이 집합에는 수정 API가 없고, 메모는 개별 LMS 팀 프로젝트 FK가 아니라 기수에 연결된다.

### 19.3 할 일/공지 보드

대시보드의 공지 입력은 화면에서 `일반`, `긴급`, `퍼실 공지`, `기술지원` 네 버튼을 제공한다. 이 값은 모두 **`notices.category` 하나의 필드**로 들어가며 분류별 별도 테이블이 없다. 빈 내용을 화면에서 막고 `POST /api/dashboard/{cohort_id}/notices`로 내용과 분류를 보낸다. 백엔드 요청 모델은 선택적 `author`도 받지만 현재 생성 함수는 그 값을 모델 생성에 전달하지 않아 DB의 기본 작성자 값이 저장된다. 서버에서는 빈 본문과 카테고리 문자열을 별도로 제한하지 않는다.

등록 후 공지 목록을 다시 읽는다. 서버 목록은 기수로 제한되고 **고정(`is_pinned`) 우선, 그 안에서 생성일 최신순**이다. 완료 원을 누르면 `PUT /api/dashboard/notices/{notice_id}`의 `status`를 `완료 ↔ 미완료`로 바꾸고, 핀을 누르면 같은 API의 `is_pinned`를 뒤집는다. 이 PUT은 내용·분류 수정 경로가 아니다. 삭제 버튼은 브라우저 확인 뒤 DELETE를 호출한다. 없는 공지 ID는 수정/삭제에서 404다. 일반 공지 API에 사용자 권한 검사는 아직 없다.

공지는 `notices`에 저장되는 메시지이고, 일정 화면에서 유형을 `공지`로 고른 항목은 **`schedule_events`의 날짜가 있는 이벤트**다. 이름이 비슷해도 API와 DB 경로가 다르다. 팀 기록 모음은 두 소스를 함께 읽어 보여줄 뿐 DB를 병합하지 않는다.

### 19.4 달력의 조회 범위와 일정 생성

[Schedule.jsx](../frontend/src/pages/Schedule.jsx)는 기본 선택 기수 모드에서 `GET /api/schedules/cohort/{selectedCohort}`를 요청한다. 서버는 그 기수 항목과 **`cohort_id=0` 공통 일정**을 합친다. 화면의 전체 모드에서는 `/api/schedules/cohort/all`로 모든 기수 일정을 읽는다. 달력의 월 이동, 선택한 날짜, 유형 필터는 UI 상태다. 서버 경로의 기수 문자열이 `all`도 정수도 아니면 현재 구현은 1기로 fallback하므로 이를 유효한 범용 검색 규칙으로 사용해서는 안 된다.

날짜를 한 번 누르면 선택 날짜만 바뀐다. 날짜를 두 번 누르거나 `새 일정` 버튼을 눌러 등록 창을 열고 제목, 설명, 날짜, 유형을 입력한다. 현재 UI 유형은 행사·교육/특강·휴일·공지다. 공통 일정으로 체크하면 `cohort_id=0`, 아니면 선택 기수 ID로 `POST /api/schedules/`에 보낸다. 서버는 `schedule_events`에 `title`, `description`, `event_date`, `event_type`, `cohort_id`를 저장한다. 이 API는 레거시 호환을 위해 남아 있는 시작/종료 datetime 컬럼을 채우지 않는다. 제목 필수 확인은 주로 화면에서 한다. 저장 후 달력 목록을 다시 읽는다.

항목을 클릭하면 상세/명단을 열고 `GET /api/schedules/{event_id}/roster`를 호출한다. 수정은 `PUT /api/schedules/{event_id}`로 일정 입력 필드를 다시 보내고, 삭제는 확인 뒤 `DELETE /api/schedules/{event_id}`를 사용한다. 삭제 시 서버는 해당 이벤트의 `event_registrations`를 먼저 지운 다음 이벤트를 같은 commit에서 제거한다. 존재하지 않는 이벤트는 수정·삭제·명단 조회에서 404다.

### 19.5 참석 명단은 신청 상태의 기록

일정·행사 명단에서 교육생을 찾는 UI는 **선택 기수의 비드랍 교육생**을 이름·팀으로 검색한다. 추가를 누르면 `POST /api/schedules/{event_id}/register`에 `trainee_id`를 보낸다. 서버는 일정 항목과 교육생의 존재를 확인하고, 일정이 공통 기수 0이거나 교육생과 일정의 기수가 같아야 허용한다. 같은 일정에서 이미 `신청완료`인 사람은 400이다. 취소된 이전 등록행은 남기 때문에 다시 신청하면 새 등록행을 만든다. 백엔드 등록 API는 `event_type=행사`만 허용하도록 제한하지 않는다.

명단 GET은 등록행에 현재 교육생·팀을 outer join한다. 원래 교육생 행이 사라졌다면 등록 당시의 `trainee_name` 스냅샷으로 이름을 표시한다. 취소 버튼은 확인 뒤 `PUT /api/schedules/cancel/{registration_id}`로 상태를 `취소됨`으로 바꾸고 명단을 다시 읽는다. 없는 등록 ID는 404다. 이 명단은 **신청완료/취소됨**을 기록하며 실제 행사 출석 여부를 확인하는 별도 API나 컬럼은 없다. 참가자 패널 안쪽은 독립 스크롤을 사용한다.

## 20. LMS 수집부터 진도 표시까지의 내부 플로우

### 20.1 실행 트리거와 기수 선택

운영 Vercel의 [vercel.json](../backend/vercel.json)은 `0 0 * * *`에 `GET /api/cron/crawl`을 호출한다. [cron.py](../backend/app/routers/cron.py)는 `Authorization: Bearer <CRON_SECRET>`을 비교한 뒤 `run_all_crawling_and_sync(cohort_id?)`를 부른다. 비밀값이 없으면 503, 불일치하면 401, 양수가 아닌 쿼리는 422, 활성 설정이 없는 기수 지정은 404, 수집 실패는 500이다. 로컬 일반 서버의 [APScheduler](../backend/app/crawl_scheduler.py)는 같은 09:00 KST에 HTTP를 거치지 않고 크롤러 함수를 직접 호출한다. `VERCEL=1`에서 앱 시작 시 로컬 스케줄러와 DDL이 꺼진다.

크롤러는 [crawl_config.py](../backend/app/services/crawl_config.py)의 `active`인 기수만 고른다. 현재 실행 설정은 **1기 한 개**이며 팀 7개 페이지를 먼저, 개인 8개 페이지를 이어서 수집한다. 2기 코드는 주석 예시이므로 2기 교육생이 DB에 있어도 자동 진도 수집 대상은 아니다. 각 미션 설정에는 단계, 표시 라벨, 외부 URL 파라미터 세 가지(`project_no`, `lcors_no`, `uqstn_no`)가 있다. `level_requirements`도 설정에 적혀 있지만 현재 진도 계산 코드가 읽지 않는다.

### 20.2 인증, HTTP 요청, HTML 파싱

1. [crawl.py](../backend/app/services/crawl.py)는 전체 실행에 인증 세션을 한 번 만든다. `CODYSSEY_ID`와 `CODYSSEY_PW`가 둘 다 있으면 [crawl_client.py](../backend/app/services/crawl_client.py)가 로그인 페이지와 인증 도메인에 먼저 방문해 XSRF 쿠키를 준비하고 인증 POST를 보낸다. 이 두 값이 없고 `CODYSSEY_COOKIE`가 있으면 쿠키 헤더를 사용한다. 둘 다 없으면 수집 시작 전에 오류가 난다.
2. 로그인 응답에 토큰이 있으면 세션의 Bearer 헤더에 담고 XSRF 쿠키가 있으면 `X-XSRF-TOKEN`을 갱신한다. 인증 요청에서 일부 상태 코드(400/415)는 form 전송 대신 JSON 전송으로 한 번 전환한다. 이후 같은 세션으로 외부 미션 상세 URL에 `projectNo`, `lcorsNo`, `uqstnNo`를 보내 HTML을 받는다. 페이지 요청은 15초 timeout과 HTTP 오류 검사를 사용한다.
3. [crawl_parser.py](../backend/app/services/crawl_parser.py)는 `.card.uqstn` 데이터 영역을 먼저 요구한다. 팀 미션은 `ul[id^="misTeamList_"] > li`에서 외부 `data-teamsn`, 상태, 완료일, 멤버의 이름·이메일 등을 읽는다. 개인 미션은 같은 영역에서 이름과 이메일이 둘 다 있는 멤버만 기록한다. `YY.MM.DD` 완료 날짜를 ISO 날짜로, 일부 상태 문자열을 사람이 읽는 표현으로 바꾼다.
4. 데이터 영역이 없거나 목록이 비어 있으면 기본적으로 오류다. 빈 목록이 실제 정상 결과인 미션만 `allow_empty=True`를 개별 설정에 넣는다. 데이터 영역 관련 RuntimeError이고 ID/PW 로그인을 쓰는 경우에만 재로그인 후 해당 페이지를 **한 번** 다시 요청한다. 일반 HTTP 오류나 임의 파싱 오류에 같은 재시도 규칙이 있는 것은 아니다.
5. 각 종류의 첫 페이지 이후에는 요청 사이에 0.3~0.7초의 무작위 대기가 있다. `collect_cohort`는 페이지 오류를 기록하면서 나머지 미션도 계속 시도해 어떤 페이지가 실패했는지 모은다. 이 네트워크 단계에서는 아직 DB 트랜잭션을 열지 않는다.

### 20.3 기수 단위 성공 판정과 DB 반영

기수의 설정된 페이지 중 **한 개라도 실패**하면 그 기수의 수집 결과 전체를 DB에 쓰지 않는다. 이전 진도와 프로젝트 행은 그대로 둔다. 다음 활성 기수는 별도로 시도할 수 있고 성공한 기수는 저장된다. 모든 기수를 돈 다음 실패 목록이 있으면 전체 실행은 예외로 끝나 Cron HTTP는 500을 반환한다. 따라서 `HTTP 500`이 모든 기수의 DB 쓰기를 되돌렸다는 의미는 아니다. 성공 기수의 commit은 이미 완료됐을 수 있다.

성공 기수에서는 [CrawlPersistence](../backend/app/services/crawl_persistence.py)가 같은 기수 교육생을 이메일 소문자 기준 딕셔너리로, 기존 미션 행을 `(trainee_id, level, mission_type, mission_label)` 키로, 기존 프로젝트 행을 `(저장된 team_id, 저장된 level)` 키로 먼저 읽는다. 새 수집 결과를 찾을 때는 외부 `team_sn`과 **소문자로 만든 미션 라벨**을 키로 사용한다. 기존 프로젝트의 level 원값을 미리 소문자로 바꾸지는 않으므로 레거시 행의 대문자 level과 일치하지 않을 수 있다. 페이지의 각 멤버를 이메일로 연결하고 기존 행을 찾아 갱신하거나 새 행을 만든다. 이 선조회는 행마다 DB SELECT를 반복하는 일을 줄인다.

| 수집물 | DB 쓰기와 예외 |
| --- | --- |
| 개인 미션 교육생 | 이메일이 로컬 기수 교육생과 일치하고 **비드랍**일 때만 `progress_logs`를 upsert한다. 미매칭이나 드랍 인원은 건너뛴다. |
| 팀 미션 멤버 | 이메일이 매칭되면 각 멤버의 `progress_logs`에 팀 미션 행을 upsert한다. 현재 코드에는 개인 미션 경로와 달리 드랍 멤버를 별도로 건너뛰는 조건이 없다. |
| 팀 프로젝트 | 외부 팀 번호가 정수로 해석될 때 `team_projects`를 생성·갱신한다. 상태나 참여자 이름 문자열이 바뀌었을 때만 `status_changed_date`를 새 시각으로 바꾼다. |
| 관측된 진도 행 | 상태, `completed_at`, `last_updated`를 현재 수집 결과로 갱신한다. `last_updated`는 확인 시각이고 `last_progress_at`은 이 가운데 **완료 상태 + 완료일**의 최대값으로 별도 계산한다. |
| 이번 페이지에서 사라진 기존 행 | 자동 삭제하지 않는다. 따라서 목록에서 빠진 사람이나 프로젝트의 오래된 행이 남을 수 있으며, 상태 전환은 실제로 다시 관측된 행에만 반영된다. |

팀 결과와 개인 결과를 저장한 뒤 **기수당 commit 한 번**을 한다. 저장 중 예외가 나면 해당 기수의 모든 미커밋 팀·개인 변경을 rollback한다. 현재 Cron 경로에서는 중간 JSON/CSV를 만들지 않는다. 과거 [sync_service.py](../backend/app/services/sync_service.py)는 `temp_data` 파일을 읽는 별도 레거시 경로이고 기수 1 고정·요약 진도 형식이어서 지금 경로와 섞어 쓰면 결과 형식이 달라진다. 자동 재시도나 중복 실행 잠금은 구현되지 않았다.

### 20.4 `progress_logs`에서 화면 단계로 바꾸는 규칙

[progress_state.py](../backend/app/services/progress_state.py)는 `progress_logs`와 미션 라벨로 **현재 상태를 매 요청에서 계산**한다. 상세 개인/팀 미션 행이 한 건이라도 있는 교육생은 상세 경로를 사용하고 과거 `summary` 행은 그 사람에 대해 무시한다. 상세가 전혀 없으면 `summary`의 단계 통과일·과제 수를 대체 경로로 사용한다. 상세 목표 수는 계산에 전달된 로그/기수별 목표에서 관측한 개인 미션 라벨 수가 우선이고, 없으면 1단계 3개·2단계 3개·Final 2개다. 팀 ID로 좁힌 대시보드 요청은 그 팀 로그의 라벨만 전달할 수 있으므로 범기수 목표와 달라질 여지가 있고, 교육생 상세 API는 별도로 기수 전체 미션 목표를 전달한다.

1. 각 미션의 상태에서 공백을 없애고 소문자화한 뒤 `미션완료`, `완료`, `completed`, `complete` 중 하나면 완료로 본다. **현재** 단계 계산에는 완료 날짜가 비어 있어도 이 상태를 인정한다.
2. 과거 날짜 `as_of`를 요청한 계산에서는 같은 완료 상태에 더해 `completed_at`이 있고 그 시각이 기준일 종료보다 늦지 않아야 인정한다. 완료 상태만 있고 날짜가 없는 행은 과거 시점에 배치할 수 없다.
3. 단계별 개인 완료 행 수가 목표 이상이고 그 단계의 **팀 미션 완료 행이 하나 이상** 있으면 다음 단계로 넘어간다. 팀 미션 목록의 모든 라벨을 완료할 필요는 없다. 가장 낮은 미충족 단계가 현재 단계다. 모든 단계가 충족되면 마지막 단계에 남되 `is_completed=true`가 된다.
4. `summary` 대체 경로는 현재 상태에서 `passed_date`가 있거나 기본 과제 목표+팀 완료값이 있는지를 본다. 과거 상태에서는 단계 통과일이 기준일 이전인지가 중요하다. 진도행이 없는 명단은 라우터에서 1단계·0개 등의 기본 표시값을 사용한다.

기간별 차트는 매일 저장한 별도 표를 읽지 않는다. [dashboard.py](../backend/app/routers/dashboard.py)가 요청 기간의 **매 날짜 종료 시각**으로 위 계산을 반복한다. 이때 저장된 각 행의 **현재 status와 기록된 completed_at**을 사용하므로 나중에 미션 상태가 바뀌면 과거 그래프를 다시 조회했을 때도 값이 달라질 수 있다. `tasksDone`은 그 날짜 활성 교육생의 **현재 단계 개인 완료 수 합**, `projectDone`은 현재 단계 팀 완료 불리언의 합이다. 전체 기수의 모든 미션 누적합으로 해석하면 안 된다. `team_id` 필터는 조회 시점의 현재 소속으로 명단을 제한하므로 과거 팀 이동 당시의 소속을 복원하지 않는다. 완료일과 옛 날짜 근거가 전혀 없으면 **오늘 이전**의 점은 `null`이고 오늘 및 미래 날짜는 해당 날짜 종료 시점으로 계산한다. 기본 최근 7일 범위라면 오늘 점만 계산된다.

## 21. 스키마 준비, 155명 이관, 배포 순서의 상세 플로우

### 21.1 새 DB를 준비할 때 실행되는 스키마 작업

로컬/일반 서버에서는 FastAPI lifespan이 시작할 때 `initialize_schema()`를 부른다. Vercel 함수는 요청마다 같은 함수를 실행하지 않도록 `VERCEL=1`에서 이 단계를 생략한다. 그러므로 Vercel에 빈 DB를 연결하기 전에 **개발자 컴퓨터에서 대상 DB URL로** `python -m app.migrations`를 한 번 실행해야 한다. [migrations.py](../backend/app/migrations.py)는 Alembic revision 파일이 아닌 코드 기반 호환 절차다.

| 순서 | `initialize_schema()` / `run_schema_migrations()`가 하는 일 |
| --- | --- |
| 0 | ORM `Base.metadata.create_all`로 아직 없는 현재 테이블을 만든다. 기존 테이블 구조를 모두 자동 교체하는 작업은 아니다. |
| 1 | 팀 프로젝트 `status_changed_date`, 일정 이벤트 호환 컬럼을 보강한다. |
| 2 | 과거 `schedules`를 `schedule_events`로 옮긴다. 이관 표식을 써 재실행 중복을 막고, 해석할 수 없는 날짜가 있으면 원본을 보존한다. |
| 3 | 과거 프로젝트 메모를 기수 공용 `team_board_memos`로 옮기고, 구 팀 이동 기록을 `facilitator_memos`로 옮긴다. 교육생 참조가 누락된 팀 이동 자료는 원본을 보존한다. |
| 4 | 메모·전화 수정일과 과거 메모 컬럼을 정리한다. |
| 5 | 예전 진도행의 미션 필드와 `cohort_id`를 보강하고, 요약행·완료일을 호환 형식으로 맞춘다. 교육생 관심/학습지원 값을 `trainee_flags`로 분리한다. |
| 6 | 미션 유일 키와 기수·팀·교육생/프로젝트의 조회 인덱스를 준비한다. |

이 절차에는 과거 표/컬럼을 옮긴 뒤 제거하는 경로가 있다. 이미 운영하던 DB라면 백업과 기존 스키마 확인을 먼저 해야 한다. 새 빈 DB에 적용하는 이관과 오래된 운영 DB를 업그레이드하는 이관은 위험도가 다르다.

특히 6단계의 미션 유일 인덱스는 `(trainee_id, level, mission_type, mission_label)` 조합을 요구한다. 기존 DB에 같은 조합의 진도행이 둘 이상 남아 있으면 인덱스 생성이 실패할 수 있다. 이 마이그레이션은 중복 행을 자동으로 합치지 않으므로, 오래된 DB를 올릴 때는 해당 조합의 중복을 먼저 확인하고 어떤 행을 보존할지 결정해야 한다.

### 21.2 로컬 원본에서 필요한 세 테이블만 내보내기

교육생 화면이 첫 배포 직후 명단을 보여주려면 `trainees`만으로는 충분하지 않다. `trainees.cohort_id`와 nullable `team_id`가 참조하는 `cohorts`, `teams`도 먼저 있어야 한다. [trainee_transfer.py](../backend/app/trainee_transfer.py)의 v2 export는 이 **세 테이블만** 읽기 전용으로 추출한다. 현재 준비된 비공개 추출본의 건수는 **기수 2, 팀 5, 교육생 155**다.

내보내는 기수 필드는 ID·이름·시작일·기한이고 팀 필드는 ID·기수 ID·이름이다. 교육생은 원래 ID, 기수/팀 연결, 이름, 성별, 나이, 전화, 이메일, 전공 관련 값, 학력, 취업 상태, 드랍 상태·날짜·사유를 담는다. 명단 파일에는 실제 개인정보가 들어 있으므로 경로나 건수를 문서화할 수 있어도 **JSON 내용을 GitHub 또는 Vercel 번들에 실어서는 안 된다**. export는 새 파일을 배타적으로 생성해 같은 경로의 기존 스냅샷을 조용히 덮어쓰지 않는다.

`progress_logs`, `trainee_flags`, 프로젝트, 메모, 전화, 상담, 공지, 일정, 신청 이력은 이 이관 범위 밖이다. 첫 크롤링 후 진도와 프로젝트가 채워질 수 있지만 운영자가 작성한 기록은 자동으로 재생성되지 않는다. 비어 있는 플래그는 API에서 false로 해석하고 이후 변경 시 행을 만든다. 전체 DB 보관용 `database_snapshot.py`는 export만 있으며 이 세 테이블 importer의 입력으로 쓰지 않는다.

두 기수의 명단을 이관하는 것과 두 기수 모두를 자동 수집하는 것은 별개다. 현재 `crawl_config.py`의 활성 크롤링 대상은 1기뿐이다. 2기 명단은 새 DB에서 조회할 수 있지만 2기의 진도·프로젝트가 자동으로 채워지려면 해당 기수의 LMS 페이지 설정을 추가하고 활성화해야 한다.

### 21.3 새 대상 DB로 import할 때의 검증과 순서

~~~mermaid
sequenceDiagram
    actor Operator as 배포 담당자
    participant CLI as trainee_transfer.py
    participant JSON as 비공개 roster JSON
    participant DB as 새 대상 DB
    Operator->>CLI: import --input (기본 미리보기)
    CLI->>JSON: format_version·세 배열 읽기
    CLI->>CLI: ID/이메일 중복·기수/팀 참조 검증
    CLI->>DB: 세 대상 테이블 및 기존 ID/이메일 확인
    CLI-->>Operator: 추가 예정 기수/팀/교육생 건수
    Operator->>CLI: import --input --apply
    CLI->>DB: 누락 기수 INSERT + flush
    CLI->>DB: 누락 팀 INSERT + flush
    CLI->>DB: 누락 교육생 INSERT + flush
    opt PostgreSQL
        CLI->>DB: 자동 증가 시퀀스 보정
    end
    CLI->>DB: commit
    CLI-->>Operator: 실제 추가 건수
~~~

CLI는 JSON의 v2 또는 구 v1을 읽을 수 있지만 v1의 플래그 섹션은 의도적으로 이관하지 않는다. 각 ID가 양의 정수이며 중복이 없는지, 팀이 존재하는 기수를 가리키는지, 교육생이 자기 기수의 팀만 참조하는지, 이메일이 중복되지 않는지 확인한다. 대상 DB에 `cohorts`, `teams`, `trainees`가 이미 만들어져 있어야 한다. 같은 ID가 다른 기수/팀/이메일을 나타내거나 같은 이메일이 다른 교육생 ID에 연결되어 있으면 충돌로 중단한다.

`--apply`가 없는 기본 import는 **추가 예정 건수만 출력하고 DB를 바꾸지 않는다**. 실제 반영 때는 기수 → 팀 → 교육생 순서로 빠진 행만 추가하고 원래 PK를 유지한다. 기존 행의 내용을 업데이트하지 않으므로 같은 파일로 재실행하면 정상적으로 추가 0건이 된다. PostgreSQL에서 명시적 PK를 넣은 뒤에는 다음 자동 생성 ID가 충돌하지 않도록 sequence를 보정한다. 새 DB에 사용자 쓰기가 시작되기 전에 이관을 마쳐야 한다. 실제 명령 예시는 [배포 안내](../backend/VERCEL_DEPLOY.md)에 있으며, 연결 URL은 문서나 Git 커밋에 넣지 않는다.

### 21.4 Vercel 프로젝트가 어떤 파일과 값을 받는지

| 대상 | 코드·설정 | 외부에서 주입할 값 | 순서 |
| --- | --- | --- | --- |
| 백엔드 Vercel 프로젝트, Root Directory `backend` | `index.py`의 ASGI 앱, `app/`, `requirements.txt`, `vercel.json`의 Cron | `DATABASE_URL`, `CRON_SECRET`, LMS 인증값, `CORS_ORIGINS` | 대상 DB 스키마와 초기 명단을 먼저 준비한 후 배포한다. |
| 프론트엔드 Vercel 프로젝트, Root Directory `frontend` | Vite 빌드, React SPA, `vercel.json`의 경로 rewrite | 빌드 시 `VITE_API_BASE_URL=https://<백엔드 도메인>/api` | 백엔드 URL이 정해진 뒤 빌드한다. |
| 로컬 이관 도구 | `app.migrations`, `app.trainee_transfer`, 비공개 roster JSON | 원본/대상 DB URL | 실행 결과만 확인하고 JSON/자격 증명은 Git·Vercel 업로드에서 제외한다. |

백엔드 `DATABASE_URL`은 지속성 있는 외부 MySQL 또는 PostgreSQL을 가리킨다. 서버리스 함수의 로컬 파일은 운영 DB가 아니다. 백엔드 CORS 허용 출처에는 프론트엔드 도메인을 넣고, 프론트엔드 API URL에는 `/api`까지 포함한다. 배포 후에는 상태 경로 `/`, 기수 조회, 초기 명단 수, Cron 인증 거부/성공, 첫 진도 반영, 프론트엔드 직접 경로 열기 순으로 확인해야 한다. **현재 저장소 문서는 이 순서를 정의하지만 실제 원격 Vercel 배포·원격 DB 이관·라이브 크롤링이 완료됐다는 뜻은 아니다.**

## 22. 데이터 원천과 변경 지점을 찾는 빠른 표

새 개발자가 화면의 한 값을 추적할 때는 다음 순서로 파일을 찾으면 된다. `화면`에서 값을 렌더링하는 코드를 확인하고 → `api` 래퍼에서 HTTP 경로를 확인하고 → 해당 라우터에서 조회/쓰기를 확인하고 → `models`와 서비스에서 원천·파생 규칙을 확인한다.

| 질문 | 먼저 볼 화면/래퍼 | 서버 원천과 주의할 점 |
| --- | --- | --- |
| 교육생이 현재 몇 단계인가? | `Dashboard`, `TraineeList`, `TeamDetail` → `dashboard.js`/`trainees.js` | `progress_logs` → `progress_state.py` 계산. `trainees`에 영구 단계 숫자를 단순 저장한 값이 아니다. |
| 왜 정체 명단에 X 또는 N일이 보이나? | `Dashboard`, `TeamDetail` | 완료 상태·완료일이 있는 마지막 미션을 dashboard API가 반환. 화면이 기준일과 비교한다. 최근 크롤 확인 시각과 다르다. |
| 교육생이 어느 전담팀인가? | `FacilitatorTeams`, `TraineeList` → 팀/교육생 API | `trainees.team_id`; null 또는 유효하지 않은 연결은 화면에서 미배정으로 취급한다. LMS 프로젝트 팀 번호와 별개다. |
| 전화 한 건에 여러 사람이 보이는 이유는? | `TeamMemos`, `TeamDetail` → `teams.js` | 공통 이유 1행(`team_call_campaigns`) + 대상별 결과 N행(`team_call_recipients`). PATCH 명단은 전체 교체다. |
| 긴급 공지가 두 화면에 보이는 이유는? | `Dashboard`, `TeamMemos` → `dashboard.js` | 둘 다 같은 `notices` 행을 읽는다. 긴급 헤더는 카테고리와 미완료 상태를 화면에서 필터한 표현이다. |
| 행사 참석자가 취소 후 다시 보이는 이유는? | `Schedule` → `schedules.js` | `event_registrations`의 과거 취소 행이 남고 다시 신청하면 새 행을 추가한다. 출석 확인 데이터는 아니다. |
| 프로젝트 날짜가 마지막 수집 시각인가? | `TeamProjects` → `teams.js` | 주로 `team_projects.status_changed_date`이며 상태/참여자 이름 변경 시각이다. 값이 비면 조회 시 관련 로그 시각을 대체한다. |
| DB 14개 테이블을 모두 새 Vercel에 이관해야 하나? | [이관 안내](../backend/VERCEL_DEPLOY.md) | 초기 명단 용도는 `cohorts`, `teams`, `trainees` 세 테이블만 추출한다. 나머지는 첫 크롤링 생성 또는 별도 운영 기록이며 자동 이관 범위가 아니다. |
