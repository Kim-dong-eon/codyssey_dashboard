# 프론트엔드·백엔드 저장소 분리와 기능 인수인계

> 기준: 2026-10-21 현재 `C:\codyssey` 코드. **이 문서는 분리·배포를 수행했다는 기록이 아니라, 분리 후에도 개발자가 기능의 위치와 데이터 흐름을 찾도록 돕는 작업 지도다.** 실제 GitHub 저장소, Vercel 프로젝트, 운영 DB의 이름·URL은 준비된 뒤 각 저장소 README에 기록한다. 실명 명단, 연락처, 비밀번호, 토큰, DB 접속 문자열은 이 문서에 넣지 않는다.

## 1. 먼저 이해할 경계

현재 저장소는 하나지만 코드의 실행 단위는 이미 둘이다.

| 실행 단위 | 담당하는 것 | 담당하지 않는 것 |
| --- | --- | --- |
| **프론트엔드**: React 18, Vite, React Router, Axios, Recharts | 사용자 입력·검색·필터, 카드/차트/달력/모달, 테마, API 호출, 여러 API 결과를 한 화면에 합성 | DB 직접 접속, LMS 인증·수집, 운영 자료의 최종 검증과 저장 |
| **백엔드**: FastAPI, SQLAlchemy, Pydantic | HTTP 계약, 요청 검증, DB 조회·쓰기, 진도 계산, LMS 크롤링·DB 반영, Cron 진입점, 초기 명단 이관 도구 | 버튼/모달/CSS 렌더링, 브라우저 localStorage |
| **외부 지속 DB**: MySQL 또는 PostgreSQL | 교육생·팀·진도·메모·전화·공지·일정 14개 현재 테이블 보존 | Vercel 함수의 임시 로컬 파일 시스템이나 Git 저장소 |

~~~mermaid
flowchart LR
    Browser[담당자 브라우저] -->|HTML, JS, CSS| Front[Vercel 프론트엔드 프로젝트]
    Browser -->|HTTPS /api/...| Back[Vercel 백엔드 프로젝트]
    Front -.->|빌드 시 API 주소 설정| Browser
    Back -->|SQLAlchemy| DB[(지속 DB)]
    Cron[Vercel Cron] -->|Bearer CRON_SECRET| Back
    Back -->|로그인, 미션 페이지 요청| LMS[외부 Codyssey LMS]
    LMS -->|HTML 수집 결과| Back
~~~

프론트 코드가 백엔드 Python 파일을 import하지 않고, 백엔드도 React 파일을 읽지 않는다. 따라서 **코드는 저장소 두 개로 나눌 수 있지만 기능 계약은 하나로 함께 관리**해야 한다. 프론트의 [API 래퍼](../frontend/src/api/)가 부르는 경로·필드와 백엔드 [라우터](../backend/app/routers/)가 받아 반환하는 경로·필드가 연결점이다. 구체적인 도메인 계산과 화면 동작은 [전체 기술 명세서](TECHNICAL_SPEC.md)의 14~22장에도 상세히 설명한다.

## 2. 분리 뒤 각 저장소의 기준 구조

현재 `frontend/`와 `backend/` **내부 내용을 각각 새 저장소의 루트로 옮긴다**. 모노레포에서 쓰던 Vercel Root Directory `frontend`/`backend`를 그대로 전제하지 않는다. 두 새 저장소에서는 보통 저장소 루트를 Vercel 프로젝트 루트로 지정한다. 실제 프로젝트 설정을 연결 전에 확인한다.

### 2.1 프론트엔드 저장소

~~~text
frontend-repo/
  README.md                   # 이 저장소의 실행·기능·API 연결 안내
  .gitignore                  # .env.local, node_modules, dist 등 제외
  .env.example                # 공개 가능한 변수 이름과 예시
  package.json
  package-lock.json
  index.html
  vite.config.js
  vercel.json                 # SPA 새로고침/직접 URL 접근 rewrite
  src/
    main.jsx                 # 테마 초기화, React 마운트
    App.jsx                  # BrowserRouter와 8개 화면 경로
    context/GlobalContext.jsx
    api/                     # 공통 Axios와 도메인별 HTTP 계약
    components/              # Layout, Topbar, 진도 컴포넌트
    pages/                   # 기능별 JSX + 짝이 되는 CSS
    styles/index.css         # 공통 색 토큰과 라이트/다크 변수
~~~

현재 원천은 [frontend/](../frontend/)다. [프론트엔드 `.gitignore`](../frontend/.gitignore), `frontend/.env.example`, `frontend/vercel.json`, `package-lock.json`까지 함께 가져간다. `node_modules/`, `dist/`, `.vercel/`, 실제 `.env*` 값은 옮기지 않는다. `VITE_API_BASE_URL`은 브라우저 번들에 포함되는 **공개 API 주소**이며 비밀번호나 DB URL을 이 이름 또는 다른 `VITE_` 변수에 넣지 않는다.

### 2.2 백엔드 저장소

~~~text
backend-repo/
  README.md                   # 이 저장소의 API, DB, 크롤러, 운영 절차
  .gitignore                  # .env, DB, private_exports 등 제외
  .vercelignore              # CLI 배포 시 비공개 파일 제외
  .env.example               # 변수 이름만 설명
  requirements.txt
  index.py                   # Vercel ASGI 진입점
  vercel.json                # GET /api/cron/crawl 예약
  ARCHITECTURE.md
  VERCEL_DEPLOY.md
  app/
    main.py                  # FastAPI/CORS/라우터/lifespan
    database.py              # DB 엔진·세션
    models.py                # 14개 현재 ORM 테이블
    schemas.py               # 공통 입력·출력 모델
    routers/                 # 6개 도메인 라우터
    services/                # 수집·파싱·반영·진도 계산
    migrations.py            # 새 DB 준비 및 구 스키마 호환
    trainee_transfer.py      # 기수·팀·교육생 3종 이관
    database_snapshot.py     # 별도 보관용 export
    crawl_scheduler.py       # 로컬 서버 예약 실행
  tests/                     # 기존 백엔드 테스트 코드
~~~

현재 원천은 [backend/](../backend/)다. `backend/private_exports/`의 실제 roster JSON, `backend/codyssey.db`, `.env`, `temp_data`, 가상환경, 로그는 코드 저장소에 포함하지 않는다. [백엔드 `.gitignore`](../backend/.gitignore)와 [배포 안내](../backend/VERCEL_DEPLOY.md)를 분리 후 새 저장소 루트 기준으로 다시 확인한다. `.vercelignore`는 CLI 업로드 범위를 보조하지만 Git 추적 파일을 지우지 않으므로 Git 추적 여부도 따로 점검한다.

### 2.3 문서가 분리 후에도 살아 있게 하는 방법

이 파일과 [전체 기술 명세서](TECHNICAL_SPEC.md)는 현재 모노레포의 `../frontend`, `../backend` 상대 링크를 사용한다. **파일을 한쪽 저장소에 그대로 복사하면 상대 저장소 링크는 깨진다.** 새 프론트 README에는 프론트 화면·API 연결 지도를, 새 백엔드 README에는 라우터·DB·크롤러·이관 지도를 자체 경로로 유지한다. 이 긴 통합 문서는 원래 모노레포/공용 문서 저장소에 두거나, 복사하는 경우 상대 저장소 GitHub URL로 교차 링크를 수정한다. 한 저장소의 README만 읽어도 로컬 실행, 환경 변수 이름, 맞은편 저장소 주소, 변경 시 연락 지점을 찾을 수 있어야 한다.

## 3. 화면에서 저장 위치까지: 기능 소유권 지도

아래 경로는 **현재 모노레포 기준**이다. 분리 후 `frontend/src/...`는 프론트 저장소의 `src/...`, `backend/app/...`는 백엔드 저장소의 `app/...`가 된다. API는 [frontend/src/api/axios.js](../frontend/src/api/axios.js)의 base URL 뒤에 붙는 `/api` 경로다. 표의 DB는 실제로 지속하는 원천이고, 단순 화면 필터는 DB 행을 만들지 않는다.

| 사용자 기능 | 프론트 화면·래퍼 | 백엔드 API·계산 | DB 원천/결과 |
| --- | --- | --- | --- |
| 앱 이동·기수 선택·전역 검색·테마 | [App.jsx](../frontend/src/App.jsx), [Topbar.jsx](../frontend/src/components/Topbar.jsx), [GlobalContext.jsx](../frontend/src/context/GlobalContext.jsx), [main.jsx](../frontend/src/main.jsx) | `GET /api/cohorts/`, 검색 후보용 교육생 목록. 테마·라우팅은 서버 호출 없음 | `cohorts`, `trainees`; 테마는 브라우저 localStorage |
| 기수 생성·기한 수정 | [Topbar.jsx](../frontend/src/components/Topbar.jsx), [cohorts.js](../frontend/src/api/cohorts.js) | `POST /api/cohorts/`, `PATCH /api/cohorts/{id}` → [cohorts.py](../backend/app/routers/cohorts.py), [schemas.py](../backend/app/schemas.py) | `cohorts`; `end_date`가 기한 |
| 대시보드 기간 카드·선 그래프 | [Dashboard.jsx](../frontend/src/pages/Dashboard.jsx), [dashboard.js](../frontend/src/api/dashboard.js) | `GET /api/dashboard/{cohort_id}?start_date&end_date` → [dashboard.py](../backend/app/routers/dashboard.py), [progress_state.py](../backend/app/services/progress_state.py) | `trainees`, `teams`, `trainee_flags`, `progress_logs`를 읽어 날짜별 재계산 |
| 단계별 개인·팀 미션 완료율 | [MissionProgressByLevel.jsx](../frontend/src/components/MissionProgressByLevel.jsx), [Dashboard.jsx](../frontend/src/pages/Dashboard.jsx) | 같은 대시보드 GET의 `trainees`와 `missionProgressByTrainee` | `progress_logs`; 프론트가 현재 단계 대상/전체 인원 분모와 중복 없는 완료 ID 수를 계산 |
| 진도 업데이트 정체 명단 | [Dashboard.jsx](../frontend/src/pages/Dashboard.jsx), 팀의 [PeriodProgressSection.jsx](../frontend/src/components/PeriodProgressSection.jsx) | 대시보드 GET이 `last_progress_at`을 반환 | 완료 상태와 `completed_at`이 있는 `progress_logs`; 기준일·N일·정렬은 프론트 상태 |
| 전담팀 보드·표·미배정·팀 추가/삭제 | [FacilitatorTeams.jsx](../frontend/src/pages/FacilitatorTeams.jsx), [teams.js](../frontend/src/api/teams.js) | `GET/POST /api/teams/...`, `DELETE /api/teams/{id}` → [teams.py](../backend/app/routers/teams.py); 명단 보완은 대시보드 `roster_only` | `teams`, `trainees.team_id`, `progress_logs` |
| 드래그 팀 이동·명단 일괄 등록 | [FacilitatorTeams.jsx](../frontend/src/pages/FacilitatorTeams.jsx), [trainees.js](../frontend/src/api/trainees.js) | `PUT /api/trainees/{id}/team`, `POST /api/trainees/bulk` → [trainees.py](../backend/app/routers/trainees.py) | `trainees`; 선택적 이동 사유는 `facilitator_memos` |
| 전담팀 상세·최근 연락·60초 재조회 | [TeamDetail.jsx](../frontend/src/pages/TeamDetail.jsx), [PeriodProgressSection.jsx](../frontend/src/components/PeriodProgressSection.jsx) | 팀 목록, 팀 범위 대시보드, 기수 메모/상담/팀 전화 API 병렬 조회 | `trainees`, `teams`, `progress_logs`, `facilitator_memos`, `contact_logs`, `team_call_*` |
| 관심 필요·학습지원 연계 | [TeamDetail.jsx](../frontend/src/pages/TeamDetail.jsx), [TechSupportTeam.jsx](../frontend/src/pages/TechSupportTeam.jsx) | `PUT /api/trainees/{id}/status`, 대시보드 `roster_only` → [trainees.py](../backend/app/routers/trainees.py) | `trainee_flags`; 소속 `team_id`는 바꾸지 않음 |
| 교육생 명부·검색·상세 | [TraineeList.jsx](../frontend/src/pages/TraineeList.jsx), [trainees.js](../frontend/src/api/trainees.js) | `GET /api/trainees/cohort/{id}`, `GET /api/trainees/{id}/detail` → [trainees.py](../backend/app/routers/trainees.py) | `trainees`, `teams`, `trainee_flags`, `progress_logs`, `contact_logs`, `facilitator_memos` |
| 교육생 드랍·복구 | [TraineeList.jsx](../frontend/src/pages/TraineeList.jsx), [Dashboard.jsx](../frontend/src/pages/Dashboard.jsx) | `PUT /api/trainees/{id}/drop` → [trainees.py](../backend/app/routers/trainees.py) | `trainees.is_dropped/drop_date/drop_reason`; 현재 대시보드 명단에서 제외 |
| 개인 상담·연락과 개인 메모 | [TraineeList.jsx](../frontend/src/pages/TraineeList.jsx), [TeamDetail.jsx](../frontend/src/pages/TeamDetail.jsx) | `/api/trainees/{id}/contact`, `/api/trainees/{id}/memos`, 삭제/수정 경로 → [trainees.py](../backend/app/routers/trainees.py) | `contact_logs`와 `facilitator_memos`의 `trainee_id`가 있는 행 |
| 팀 메모·전화 캠페인·통합 기록 | [TeamMemos.jsx](../frontend/src/pages/TeamMemos.jsx), [teams.js](../frontend/src/api/teams.js) | `/api/teams/.../memos`, `/api/teams/cohort/{id}/call-campaigns` → [teams.py](../backend/app/routers/teams.py) | 팀 메모 `facilitator_memos`, 공통 사유 `team_call_campaigns`, 수신/특이사항 `team_call_recipients` |
| 공지·긴급 공지·완료/고정 | [Dashboard.jsx](../frontend/src/pages/Dashboard.jsx), [TeamMemos.jsx](../frontend/src/pages/TeamMemos.jsx), [dashboard.js](../frontend/src/api/dashboard.js) | `/api/dashboard/{id}/notices`, `/api/dashboard/notices/{id}` → [dashboard.py](../backend/app/routers/dashboard.py) | `notices`; 팀 기록의 긴급 표시는 프론트가 `긴급`·미완료를 필터 |
| LMS 팀 프로젝트·현황판 메모 | [TeamProjects.jsx](../frontend/src/pages/TeamProjects.jsx), [teams.js](../frontend/src/api/teams.js) | `GET /api/teams/cohort/{id}/projects`, `/board-memos` → [teams.py](../backend/app/routers/teams.py); 프로젝트 쓰기는 [crawl_persistence.py](../backend/app/services/crawl_persistence.py) | `team_projects`는 LMS 팀 번호, 현황판 메모는 `team_board_memos` |
| 달력 일정·행사·참석 명단 | [Schedule.jsx](../frontend/src/pages/Schedule.jsx), [schedules.js](../frontend/src/api/schedules.js) | `/api/schedules/...` CRUD/roster/register/cancel → [schedules.py](../backend/app/routers/schedules.py) | `schedule_events`와 `event_registrations`; `cohort_id=0`은 공통 일정 |
| 정기 LMS 수집 | 프론트에서 직접 실행 버튼 없음 | [cron.py](../backend/app/routers/cron.py) → [crawl.py](../backend/app/services/crawl.py) → [crawl_client.py](../backend/app/services/crawl_client.py)/[crawl_parser.py](../backend/app/services/crawl_parser.py) → [crawl_persistence.py](../backend/app/services/crawl_persistence.py) | `progress_logs`, `team_projects`; 설정은 [crawl_config.py](../backend/app/services/crawl_config.py) |
| 새 DB 스키마·초기 교육생 이관 | 프론트 배포에 데이터 파일을 포함하지 않음 | [migrations.py](../backend/app/migrations.py), [trainee_transfer.py](../backend/app/trainee_transfer.py) | 새 DB의 `cohorts`, `teams`, `trainees`에만 최초 명단 반영 |

### 한 화면이 한 API나 한 테이블과 1:1로 대응하지 않는 이유

- **대시보드**는 미리 저장된 완성 화면을 읽지 않는다. 백엔드가 현재 `progress_logs`에서 단계와 날짜별 상태를 계산하고, 프론트가 선택한 범위·분모·필터로 다시 시각화한다.
- **팀 기록 모음**이라는 DB 테이블은 없다. 팀/개인 메모, 개인 상담, 팀 전화, 공지, 일정·행사를 각 API에서 받아 프론트가 한 피드로 합친다. 항목을 수정할 때는 해당 원래 API로 돌아간다.
- **전담팀**의 `teams.team_id`와 **LMS 팀 프로젝트**의 `team_projects.team_id`는 의미가 다르다. 프로젝트의 값은 외부 `team_sn`이다. 두 번호가 우연히 같아도 외래 키처럼 연결하지 않는다.
- **진도 정체**의 마지막 날짜는 마지막 크롤링 확인 시각이 아니다. 완료된 미션의 `completed_at` 가운데 최신 날짜다. 완성 시각이 없으면 화면에 기록 없음으로 나타날 수 있다.
- **행사 참석 명단**은 신청완료/취소됨의 관리 기록이다. 실제 출석 확인을 위한 별도 값이나 API는 현재 없다.

## 4. 사용자가 클릭한 뒤 두 저장소를 통과하는 대표 흐름

### 4.1 전담팀으로 교육생 이동

1. [FacilitatorTeams.jsx](../frontend/src/pages/FacilitatorTeams.jsx)가 팀 목록과 `roster_only=true` 대시보드 명단을 읽어 팀 열과 미배정 열을 만든다.
2. 담당자가 카드를 다른 열로 옮기면 프론트가 **화면상의 카드 위치를 먼저 바꾼다**.
3. [trainees.js](../frontend/src/api/trainees.js)가 `PUT /api/trainees/{trainee_id}/team`에 목적 `to_team_id`를 보낸다. 미배정은 `null`이다.
4. [trainees.py](../backend/app/routers/trainees.py)는 교육생을 조회하고 이전 팀과 비교한다. 실제 변경이면 `trainees.team_id`를 갱신하고 선택적 이동 메모를 `facilitator_memos`에 작성한 후 commit한다.
5. 성공하면 프론트의 낙관적 위치를 유지한다. 실패하면 서버 목록을 다시 읽어 카드를 복원한다. 서버의 단건 이동 API는 목적 팀이 같은 기수인지 직접 검증하지 않으므로, 해당 규칙을 강화하려면 **백엔드 검증과 프론트 오류 표시를 같이** 수정한다.

### 4.2 팀 전화 한 건에 여러 교육생의 결과 저장

1. [TeamMemos.jsx](../frontend/src/pages/TeamMemos.jsx)는 팀과 대상 교육생을 선택하고 **공통 전화 사유**를 입력받는다. 대상별 `received`의 기본값은 `true`이고 특이사항 `note`는 선택이다.
2. [teams.js](../frontend/src/api/teams.js)가 `POST /api/teams/cohort/{cohort_id}/call-campaigns`에 `{team_id, reason, recipients:[{trainee_id, received, note}]}`를 보낸다.
3. [teams.py](../backend/app/routers/teams.py)는 이유가 비지 않았는지, 대상이 최소 1명인지, 같은 교육생이 중복되지 않았는지, 모든 대상이 그 기수·팀의 비드랍 교육생인지 확인한다.
4. `team_call_campaigns`에 공통 사유 1행, `team_call_recipients`에 대상별 결과 N행을 같은 DB commit으로 저장한다. 응답에는 새 캠페인 ID가 온다.
5. 프론트가 기수 기록을 다시 읽으면 팀 상세의 최근 연락과 팀 기록 모음에도 반영된다. PATCH에서 `recipients` 배열을 보내면 **기존 대상 결과 전체가 교체**되므로, 부분 수정 UI라도 기존 대상의 값을 모두 포함해 보내야 한다.

### 4.3 LMS 수집 후 대시보드 진도 표시

1. 백엔드 Vercel의 [vercel.json](../backend/vercel.json)이 00:00 UTC, 즉 09:00 KST에 `GET /api/cron/crawl`을 호출하도록 선언한다. [cron.py](../backend/app/routers/cron.py)가 `CRON_SECRET` Bearer 값을 검사한다.
2. [crawl_config.py](../backend/app/services/crawl_config.py)에서 `active`인 기수를 고른다. 현재 설정은 **1기만 활성**이고, 2기 설정은 주석 예시다.
3. [crawl.py](../backend/app/services/crawl.py)가 LMS에 로그인해 팀 미션 7페이지, 개인 미션 8페이지를 수집한다. [crawl_parser.py](../backend/app/services/crawl_parser.py)가 HTML에서 외부 팀 번호, 교육생 이메일, 미션 상태와 완료일을 읽는다.
4. 해당 기수의 페이지 하나라도 실패하면 그 기수 결과를 쓰지 않는다. 전부 성공하면 [crawl_persistence.py](../backend/app/services/crawl_persistence.py)가 이메일로 교육생을 찾아 `progress_logs`와 `team_projects`를 기수당 한 트랜잭션으로 upsert한다. 현재 Cron 경로에서 중간 JSON이나 `temp_data`를 만들지 않는다.
5. 이후 브라우저가 대시보드를 다시 조회하면 [progress_state.py](../backend/app/services/progress_state.py)가 현재 단계·개인 완료 수·팀 미션 여부를 계산한다. [dashboard.py](../backend/app/routers/dashboard.py)는 날짜별 차트와 마지막 완료일을 만든다. 프론트가 이를 카드·선 그래프·정체 명단에 표시한다. 브라우저에 서버 푸시는 없으므로 이미 열린 화면은 해당 화면의 재조회 시점에 새 값이 보인다.

### 4.4 일정 등록과 행사 명단

1. [Schedule.jsx](../frontend/src/pages/Schedule.jsx)에서 날짜 **한 번 클릭은 선택**, 더블 클릭 또는 추가 버튼은 작성창을 연다. 선택 가능한 UI 유형은 행사, 교육/특강, 휴일, 공지다.
2. [schedules.js](../frontend/src/api/schedules.js)가 `POST /api/schedules/`로 기수, 제목, 설명, 날짜, `event_type`을 보낸다. 공통 일정이면 `cohort_id=0`이다.
3. [schedules.py](../backend/app/routers/schedules.py)가 `schedule_events`에 기록한다. 이 라우터의 `event_type` 모델은 현재 문자열이므로 **프론트 UI의 목록이 서버 enum 검증으로 보장되는 구조는 아니다**.
4. 명단 추가는 `POST /api/schedules/{event_id}/register`다. 백엔드는 행사 존재·교육생 존재·같은 기수 또는 공통 일정인지·활성 신청 중복 여부를 확인하고 `event_registrations`에 신청완료 행을 추가한다.
5. 취소는 행을 지우지 않고 `status=취소됨`으로 바꾼다. 같은 교육생을 나중에 다시 등록하면 새 신청 행이 생길 수 있다. 일정 삭제는 관련 신청 기록을 삭제한다.

## 5. 기능을 바꿀 때 실제로 어디부터 손댈지

### 5.1 예시 A — 팀 전화의 대상별 기록에 새 필드를 추가한다

가령 `received`와 `note` 외에 `follow_up_date`를 저장한다고 가정한다. 아래는 **미래 변경 절차의 예시**이며 현재 필드가 존재한다는 뜻이 아니다.

1. **의미와 범위 결정:** 캠페인 공통 값인지 대상별 값인지 정한다. 대상마다 날짜가 다르면 `team_call_recipients`가 맞고, 한 통화 묶음의 공통 날짜라면 `team_call_campaigns`가 맞다. 날짜 누락 허용 여부와 기존 행 기본 표시도 정한다.
2. **백엔드 DB 변경:** [models.py](../backend/app/models.py)에 필드를 선언하고 [migrations.py](../backend/app/migrations.py)에 기존 DB의 컬럼 추가 절차를 넣는다. Vercel 함수 시작은 스키마를 바꾸지 않으므로 대상 DB에 배포 전에 마이그레이션을 실행한다.
3. **백엔드 API 변경:** [teams.py](../backend/app/routers/teams.py)의 생성·수정 요청 모델, 대상 검증, INSERT/PATCH, GET 응답 직렬화를 함께 바꾼다. 기존 프론트가 새 필드를 보내지 않아도 동작하도록 새 필드는 처음에는 선택적으로 받는 편이 안전하다. PATCH는 대상 배열 전체 교체이므로 누락 시 기존 날짜가 사라질지 보존할지 계약을 정한다.
4. **프론트 변경:** [teams.js](../frontend/src/api/teams.js) 요청 계약과 [TeamMemos.jsx](../frontend/src/pages/TeamMemos.jsx)의 작성·수정 입력, 목록 카드 표시, 편집 초기값을 바꾼다. [TeamDetail.jsx](../frontend/src/pages/TeamDetail.jsx)의 최근 연락 카드/툴팁에도 보여줄지 결정한다. CSS는 각 페이지 CSS에 추가한다.
5. **배포 순서:** 백엔드 스키마 → 이전 프론트와 호환되는 백엔드 → 새 프론트 순으로 반영한다. 한쪽 저장소 PR만 병합하면 화면이 데이터를 버리거나 API가 미지원 필드를 받는 기간이 생길 수 있다. 두 PR 설명에 서로의 링크, 필드 계약, 배포 순서를 적는다.

### 5.2 예시 B — 미션 진도 또는 단계 승급 규칙을 바꾼다

1. **원천 판별:** 외부 LMS 페이지의 라벨/번호 자체가 바뀐 것인지, 완료 상태 문구가 바뀐 것인지, 단계 승급의 업무 규칙이 바뀐 것인지 구분한다. 전자는 [crawl_config.py](../backend/app/services/crawl_config.py)·[crawl_parser.py](../backend/app/services/crawl_parser.py), 후자는 [progress_state.py](../backend/app/services/progress_state.py)가 중심이다.
2. **백엔드 수집:** LMS 미션이 추가되면 해당 기수의 팀/개인 미션 번호·라벨을 설정에 추가한다. 파싱 구조가 바뀌면 parser와 인증/요청 client를 살핀다. 이 설정이 없는 새 기수는 명단이 있어도 자동 수집되지 않는다.
3. **백엔드 판정:** 현재 규칙은 개인 목표 수와 그 단계 팀 미션 **한 건 이상 완료**를 같이 요구한다. 개인 목표는 관측된 미션 라벨 수가 우선이고 없으면 3/3/2다. 이를 바꾸면 대시보드·교육생 상세·전담팀 목록이 모두 공유하는 `progress_state.py`의 현재/과거 계산을 같이 검토한다. 날짜별 차트는 현재 상태와 완료 날짜로 과거를 재계산하므로 변경이 기존 기간 표시에도 영향을 줄 수 있다.
4. **프론트 표시:** [Dashboard.jsx](../frontend/src/pages/Dashboard.jsx)의 단계 카드·필터, [MissionProgressByLevel.jsx](../frontend/src/components/MissionProgressByLevel.jsx)의 분모/완료율, [TraineeList.jsx](../frontend/src/pages/TraineeList.jsx)·[TeamDetail.jsx](../frontend/src/pages/TeamDetail.jsx)의 단계 문구를 살핀다. `단계별 대상`은 현재 단계 인원, `전체 인원`은 기수 전체 비드랍 인원이라는 뜻을 유지하거나 명시적으로 변경한다.
5. **API 영향:** 응답 필드 `level`, `done`, `target`, `optional_task_done`, `is_completed`, `last_progress_at`, `missionProgressByTrainee`, `chartData` 중 의미가 달라지면 프론트와 백엔드 PR에 동일한 예시 응답과 산식 설명을 넣는다. 필드 이름만 같고 의미가 달라지는 변경이 특히 위험하다.

### 5.3 예시 C — 일정 유형을 새로 만들거나 이름을 바꾼다

1. 먼저 [Schedule.jsx](../frontend/src/pages/Schedule.jsx)의 작성/수정 select 옵션, 달력 색과 배지 CSS, 현재 데이터에서 만든 유형 필터를 살핀다. [TeamMemos.jsx](../frontend/src/pages/TeamMemos.jsx)는 일정을 통합 기록 피드로도 보여주므로 그 표시/필터도 본다.
2. [schedules.py](../backend/app/routers/schedules.py)의 `EventCreateRequest`/`EventUpdateRequest`는 현재 `event_type: str`이다. 새 유형을 제한된 목록으로 공식화하려면 백엔드 검증을 추가하고 이전 유형의 기존 `schedule_events` 행을 어떻게 보일지 결정한다.
3. 유형 이름을 단순 교체하면 이전 DB 행은 옛 문자열로 남는다. 기존 기록도 새 이름으로 표시해야 한다면 **데이터 이행** 또는 읽기 시 별칭 처리가 필요하다. 신규 유형 추가만이면 대개 DB 컬럼 추가는 필요 없다.
4. 행사 참석 명단은 유형 문자열만으로 엄격히 제한되는 서버 기능이 아니다. 어떤 유형에 명단 버튼을 보일지 프론트 정책과 백엔드 허용 정책을 별도로 맞춘다.
5. 새 백엔드 검증이 기존 프론트의 유형을 거부하지 않는지 먼저 확인하고, 이후 프론트를 배포한다. 두 프로젝트의 Preview URL에서 작성·수정·기수별 조회·팀 기록 피드까지 함께 확인한다.

### 5.4 예시 D — 버튼 색, 라이트/다크 테마만 바꾼다

1. [styles/index.css](../frontend/src/styles/index.css)의 공통 CSS 변수와 `html[data-theme="light"]` 재정의, 관련 페이지 CSS를 찾는다. JSX와 CSS는 각 페이지별로 분리되어 있다.
2. API 경로나 DB를 바꾸지 않는 순수 시각 변경이면 **프론트 저장소 PR 하나**로 충분하다. 테마 상태는 [main.jsx](../frontend/src/main.jsx)와 [Topbar.jsx](../frontend/src/components/Topbar.jsx)의 localStorage/HTML 속성에서 제어한다.
3. 기능 추가에 따라 색이 바뀌는 경우에는 서버 응답 상태 값의 의미와 CSS class 분기를 함께 확인한다. UI가 같은 색을 쓰더라도 서버 enum/문구를 멋대로 바꾸지 않는다.

### 5.5 예시 E — DB 컬럼이나 API 경로를 바꾼다

1. DB 소유자는 **백엔드 저장소**다. [models.py](../backend/app/models.py), [migrations.py](../backend/app/migrations.py), 해당 [라우터](../backend/app/routers/)·[schemas.py](../backend/app/schemas.py)를 같이 수정한다. `Base.metadata.create_all()`은 기존 컬럼 변경을 자동 적용하지 않는다.
2. 변경한 API의 소비자는 프론트 [api/](../frontend/src/api/)부터 검색한다. 화면에 직접 `api.get/post`가 있는지도 검색한다. 요청·응답 필드를 확장할 때는 이전 버전 프론트도 일정 기간 읽을 수 있는 형태가 안전하다.
3. 양쪽 저장소에 서로 연결된 PR을 만들고, 백엔드 스키마 이행과 배포가 먼저인지, 프론트 배포가 먼저여도 안전한지 명시한다. 새 필드를 필수화하거나 경로를 없애는 변경은 한 번의 배포로 두 버전을 동시에 바꿀 수 없으므로 호환 기간을 둔다.
4. 운영 DB 이행은 코드 커밋과 별도 단계다. Vercel에서는 [main.py](../backend/app/main.py)가 요청 시작 시 DDL을 건너뛴다. 배포 전 DB 백업/스키마 확인 → `python -m app.migrations` → 백엔드 배포 → 프론트 배포 순서를 검토한다.

## 6. 분리 작업 순서와 Vercel 연결

### 6.1 코드와 Git 경계 만들기

1. 현재 모노레포의 어떤 커밋을 분리 원본으로 삼았는지 두 새 README에 기록한다. 작업 중 원본이 계속 바뀌면 프론트/백엔드가 서로 다른 API 계약의 시점에서 출발할 수 있다.
2. 프론트 새 저장소에는 2.1의 파일을 **루트**에, 백엔드 새 저장소에는 2.2의 파일을 **루트**에 놓는다. 한 저장소에 상대편 코드 전체를 다시 넣지 않는다.
3. 각각의 `.gitignore`와 `git ls-files`를 확인해 실제 `.env`, `private_exports`, DB 파일, CSV/JSON 명단, 로그, 빌드 산출물이 Git 추적 대상이 아님을 검토한다. 기존 커밋 기록 속의 민감 파일 여부도 분리 전 확인한다.
4. 두 README의 경로를 독립 저장소 기준으로 고친다. 프론트는 `/api` 연결 방법과 화면 목록, 백엔드는 API·DB·Cron·이관 방법을 적는다. 상대 저장소 URL을 링크하되 URL이 확정되기 전에는 임의 주소를 사실처럼 쓰지 않는다.
5. 새 저장소의 `main`은 배포 기준, 협업자의 작업 브랜치는 변경 기준으로 둔다. 누가 저장소를 만들든 상대 협업자를 **프론트·백엔드 양쪽**에 초대해야 두 영역의 기능 변경을 함께 처리할 수 있다.

### 6.2 프론트/백엔드 배포 연결 값

| 위치 | 필요한 설정 | 의미와 확인 방법 |
| --- | --- | --- |
| 백엔드 Vercel 프로젝트 | `DATABASE_URL` | 외부 지속 DB의 SQLAlchemy URL. 없으면 Vercel 앱은 시작 오류. 코드·문서에 실제 값 기록 금지. |
| 백엔드 Vercel 프로젝트 | `CODYSSEY_ID`, `CODYSSEY_PW` 또는 운영 방식에 맞는 인증값 | LMS 크롤러 로그인. 현재 코드에서는 ID/PW 둘 다 있으면 이를 우선 사용한다. |
| 백엔드 Vercel 프로젝트 | `CRON_SECRET` | `/api/cron/crawl` Bearer 검증. 프론트 번들에는 넣지 않는다. |
| 백엔드 Vercel 프로젝트 | `CORS_ORIGINS` | 프론트 Production 출처와 실제로 사용할 Preview 출처를 쉼표 구분으로 허용. 경로 `/api`는 origin에 넣지 않는다. CORS는 인증 기능이 아니다. |
| 프론트엔드 Vercel 프로젝트 | `VITE_API_BASE_URL` | 빌드 시 주입되는 백엔드 공개 URL **끝에 `/api` 포함**. 예: `https://<backend-host>/api`. 변경 뒤 프론트를 새로 빌드·배포해야 한다. |
| 로컬 백엔드 | `ENABLE_SCHEDULER=false` 권장 | 개발 중 매일 크롤링 예약을 막는다. Vercel에서는 앱 내부 스케줄러가 자동으로 꺼진다. |
| 로컬 프론트 | `API_PROXY_TARGET`, 선택 | `VITE_API_BASE_URL`이 없을 때 `/api` 요청을 기본 `http://localhost:8000`으로 Vite가 전달한다. |

분리 저장소 루트에 각자의 `vercel.json`이 위치해야 한다. 프론트 것은 React Router의 `/trainees` 같은 직접 접속을 `index.html`로 보내고, 백엔드 것은 `/api/cron/crawl`의 일정만 정의한다. `index.py`는 백엔드 프로젝트에만 둔다. 설정을 바꾸면 Preview/Production 환경별 변수 값도 확인한다. Vercel의 Git 배포는 일반적으로 작업 브랜치에 Preview, 지정된 Production 브랜치에 Production을 만든다. [Vercel Git 배포 문서](https://vercel.com/docs/git), [환경 변수 문서](https://vercel.com/docs/environment-variables).

### 6.3 새 DB 준비와 처음 155명 명단 반영

1. 백엔드가 사용할 **새 빈 지속 DB**를 준비한다. 데이터 파일을 프론트나 백엔드 Git에 올려 전달하는 과정이 아니다.
2. 로컬 컴퓨터에서 새 DB URL을 `DATABASE_URL`로 지정하고 `python -m app.migrations`를 한 번 실행해 14개 현재 테이블과 필요한 인덱스를 만든다. 이미 사용 중인 DB라면 호환 마이그레이션 전에 백업·스키마 확인이 필요하다.
3. 현재 준비된 비공개 roster export는 **기수 2건, 팀 5건, 교육생 155명**만 포함한다. [trainee_transfer.py](../backend/app/trainee_transfer.py)는 원본/대상 DB에 직접 연결해 export와 import를 수행한다. import 기본 동작은 미리보기이며 `--apply`가 있어야 실제 쓴다. 자세한 명령과 파일 취급은 [백엔드 배포 안내](../backend/VERCEL_DEPLOY.md)를 따른다.
4. 진도·프로젝트는 현재 활성 크롤링 기수에 대해서만 나중에 채워진다. 상담·메모·공지·일정·팀 전화·상태 플래그는 이 명단 이관 도구의 대상이 아니다. 이전 운영 기록을 모두 보존하려면 별도 이관 계획이 필요하다.
5. DB 스키마와 명단을 준비한 후 백엔드 배포를 연결한다. `/` 상태와 `/api/cohorts/` 응답을 확인한 다음 프론트 `VITE_API_BASE_URL`과 백엔드 `CORS_ORIGINS`를 실제 두 도메인에 맞게 설정한다. 프론트 배포 뒤 브라우저에서 직접 `/dashboard`, `/trainees`, `/schedule`을 열어 SPA rewrite와 API 요청을 확인한다.

### 6.4 기존 `gn-dashboard` 프로젝트를 재사용할 때

화면에 보였던 기존 Vercel 배포는 **이 저장소의 최신 코드가 아니라 이전 버전의 다른 Git 소스**에서 만들어진 프로젝트다. 기존 Vercel 프로젝트를 프론트용으로 재사용할지, 새 프론트 프로젝트를 만들지는 프로젝트 설정·배포 권한과 Git 연결 상태를 확인한 뒤 결정한다. 기존 프로젝트에 CLI로 직접 배포할 수 있더라도 예전 Git 연결이 남아 있으면 그 소스의 Production 브랜치 푸시가 다시 배포를 일으킬 수 있다. 운영 주소를 유지하려면 Git 소스와 Production 브랜치, 환경 변수, 도메인 연결을 함께 정리한다. 도메인은 나중에 전달받는 것으로 합의했으므로 이 문서에서는 특정 커스텀 도메인을 전제하지 않는다.

## 7. 두 Git 저장소에서 함께 개발하는 방식

### 7.1 권한과 브랜치

저장소 관리자는 협업자를 **프론트 저장소와 백엔드 저장소 각각**에 초대한다. 초대만으로 Vercel 프로젝트의 관리 권한이 생기는 것은 아니므로 배포·환경 변수 변경을 맡길 사람에게는 Vercel 프로젝트 권한도 별도로 확인한다. 실제 계정 이름과 브랜치 이름은 협업자와 합의해 README에 기록한다.

각 저장소의 `main`을 Production 배포 기준으로 두고 작업 브랜치에서 수정한다. 예를 들어 `feature/team-call-follow-up`처럼 기능 단위 브랜치를 사용할 수 있다. **두 저장소가 모두 바뀌는 기능은 PR도 두 개**다. PR 본문에 상대 PR 링크, 변경된 API 요청/응답 예시, DB 마이그레이션 여부, Preview URL, 안전한 병합·배포 순서를 적는다. 프론트만 바꾸는 시각 작업은 프론트 PR 하나로 충분하다.

### 7.2 PR 검토 순서 예시

| 변경 종류 | 먼저 확인할 저장소 | 함께 검토할 내용 | 배포 순서의 기본값 |
| --- | --- | --- | --- |
| 버튼·CSS·필터만 변경 | 프론트 | API 요청이 새로 생기지 않는지 | 프론트만 |
| 기존 API 응답에 선택 필드 추가 | 백엔드 → 프론트 | 기존 프론트 호환, null 기본 표시 | 백엔드 → 프론트 |
| API 경로/필수 필드 변경 | 양쪽 | 이전 프론트가 깨지지 않을 전환 기간 | 호환 백엔드 → 프론트 → 구 계약 제거 |
| DB 컬럼/인덱스 추가 | 백엔드 | 마이그레이션·기존 데이터·롤백 방법 | DB 준비 → 백엔드 → 프론트 |
| LMS 파싱/진도 규칙 | 백엔드 중심, 프론트 확인 | 크롤 결과·차트 의미·분모·과거 값 | 백엔드 → 새 응답 확인 → 프론트 |
| 일정 UI 유형 추가 | 프론트, 필요 시 백엔드 | 서버 검증/기존 문자열/팀 기록 표시 | 기존 값 호환 백엔드 → 프론트 |

저장소가 둘이어도 기능 완료의 기준은 화면과 API 양쪽의 **같은 계약**이다. 둘 중 하나의 `main`만 먼저 새 규칙을 강제하면 다른 쪽 배포가 남아 있는 동안 요청이 실패할 수 있다. Vercel Preview를 쓸 때 프론트 Preview가 어느 백엔드 Preview/Production URL을 가리키는지도 명시한다. 별도 Preview DB가 없다면 쓰기 작업이 운영 DB로 갈 수 있으므로 환경 연결을 확인해야 한다.

## 8. 흔히 잘못 연결되는 지점과 현재 구현의 경계

1. **일반 사용자 인증이 없다.** 현재 일반 API는 앱 로그인/인가를 확인하지 않는다. `CORS_ORIGINS`는 브라우저 출처 제어일 뿐 개인정보 API를 보호하지 않는다. 외부 공개 운영 전에 접근 보호 설계가 필요하다.
2. **Vercel 함수는 DB 스키마를 자동 초기화하지 않는다.** [main.py](../backend/app/main.py)가 `VERCEL=1`이면 DDL을 생략한다. 빈 DB에 코드를 배포만 하면 테이블이 생기지 않는다.
3. **브라우저의 API 주소는 빌드 결과에 반영된다.** 프론트 `VITE_API_BASE_URL`을 바꾼 후에는 새 프론트 배포가 필요하다. 백엔드 `CORS_ORIGINS`에는 `/api` 없는 정확한 프론트 origin을 넣는다.
4. **기수 2건 이관과 2기 크롤링은 다르다.** 현재 [crawl_config.py](../backend/app/services/crawl_config.py)에는 1기만 활성이다. 2기 명단이 보여도 진도 수집이 자동으로 돌지는 않는다.
5. **Cron 실패는 자동 복구를 뜻하지 않는다.** 페이지 한 개라도 실패한 기수의 쓰기는 건너뛰고 HTTP 오류로 남는다. 다른 기수는 이미 성공 commit했을 수 있다. 별도 중복 실행 잠금·자동 재시도는 없다.
6. **팀 기록 모음은 읽기 조합이다.** 새 기록 종류를 추가하면 원천 API뿐 아니라 [TeamMemos.jsx](../frontend/src/pages/TeamMemos.jsx)의 병렬 로딩, 공통 카드 필드 변환, 필터·정렬, 수정 동작을 모두 살펴야 한다.
7. **대시보드 명단과 교육생 전체 명단의 인원이 다를 수 있다.** 대시보드 현재 `trainees`는 드랍 제외, 교육생 명부 API는 드랍 포함이다. 단계별 미션의 현재 단계 대상과 전체 인원 분모도 서로 다르다.
8. **기간 차트는 저장된 일일 스냅샷이 아니다.** 현 상태와 완료일로 과거를 재계산한다. 이후 미션 상태가 뒤집히면 같은 기간의 과거 수치도 달라질 수 있다.
9. **`team_projects.team_id`를 전담팀 FK로 쓰지 않는다.** LMS 팀 번호와 앱 팀 번호를 연결할 근거가 없으면 이름이나 ID가 같다는 이유로 JOIN하지 않는다.
10. **행사 취소는 이력이다.** `event_registrations.status`가 취소됨으로 남고 재신청 시 새 행이 생길 수 있다. 출석 완료를 의미하지 않는다.
11. **초기 roster JSON은 배포 산출물이 아니다.** 이관 도구를 로컬에서 대상 DB에 실행하고, JSON·전체 DB 스냅샷·로그·자격 증명은 Git과 Vercel 번들에서 제외한다.

## 9. 분리 완료 후 README에 남길 최소 정보

| 프론트 README | 백엔드 README |
| --- | --- |
| 화면 URL 8개와 [App.jsx](../frontend/src/App.jsx) 라우팅 | API 접두사 6개와 [main.py](../backend/app/main.py) 등록 |
| 화면 → [api/](../frontend/src/api/) 래퍼 → 백엔드 라우터를 찾는 표 | 라우터 → 서비스 → [models.py](../backend/app/models.py)·DB를 찾는 표 |
| `npm ci`, `npm run dev`, `npm run build`와 로컬 Vite 프록시 | `pip install -r requirements.txt`, `uvicorn`, 스케줄러 로컬 비활성화 |
| `VITE_API_BASE_URL`의 `/api` 포함 형식과 Production/Preview API 연결 | `DATABASE_URL`, LMS 인증, `CRON_SECRET`, `CORS_ORIGINS`의 변수 이름·용도 |
| CSS 토큰·테마 위치, 화면별 JSX/CSS 짝 | 마이그레이션, 크롤러, 이관 도구, 비공개 자료 제외 규칙 |
| 상대 백엔드 저장소 URL과 API 계약 변경 절차 | 상대 프론트 저장소 URL과 API 계약 변경 절차 |
| 자체 Vercel 프로젝트/Production 브랜치/도메인 | 자체 Vercel 프로젝트/Production 브랜치/Cron/DB |

문서의 최종 기준은 실행 중인 배포보다 **각 저장소의 해당 배포 커밋과 환경 설정**이다. 화면의 기능 위치를 찾을 때는 이 문서 3장 → 해당 프론트 JSX·API 래퍼 → 백엔드 라우터·서비스 → ORM 테이블 순서로 읽는다. 상세 계산식, 응답 필드, 각 API의 전체 목록은 [기술 명세서](TECHNICAL_SPEC.md)와 [백엔드 배포 안내](../backend/VERCEL_DEPLOY.md)를 함께 참조한다.
