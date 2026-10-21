# Codyssey 백엔드 개발 안내

이 디렉터리는 교육생 관리 서비스의 **FastAPI API, 관계형 DB 스키마, 외부 LMS 크롤러, 예약 실행, 초기 명단 이관 도구**를 담고 있다. 프론트엔드는 별도 React 앱이다. 두 저장소로 나누더라도 프론트엔드는 백엔드의 공개 HTTP 계약인 `/api/*`를 호출한다. 이 문서는 백엔드 저장소만 받은 개발자가 기능의 시작점과 데이터 흐름을 찾기 위한 안내다.

> 구현 기준: 2026-10-21 작업 공간의 소스 코드. 실제 Vercel 배포 및 원격 DB 이관 상태를 뜻하지 않는다. 실제 교육생 명단, DB URL, LMS 자격 증명은 이 문서에 넣지 않는다.

## 먼저 읽을 곳

| 작업 | 시작 파일 | 함께 볼 파일 |
| --- | --- | --- |
| API 추가·수정 | [`app/main.py`](app/main.py), [`app/routers/`](app/routers/) | [`app/models.py`](app/models.py), [`app/schemas.py`](app/schemas.py) |
| 교육생 진도 계산 | [`app/services/progress_state.py`](app/services/progress_state.py) | [`app/routers/dashboard.py`](app/routers/dashboard.py), [`app/routers/trainees.py`](app/routers/trainees.py) |
| 크롤링 페이지 추가 | [`app/services/crawl_config.py`](app/services/crawl_config.py) | [`app/services/crawl_client.py`](app/services/crawl_client.py), [`app/services/crawl_parser.py`](app/services/crawl_parser.py) |
| 크롤링 DB 반영 | [`app/services/crawl.py`](app/services/crawl.py) | [`app/services/crawl_persistence.py`](app/services/crawl_persistence.py) |
| DB 스키마 변경 | [`app/models.py`](app/models.py), [`app/migrations.py`](app/migrations.py) | [`app/database.py`](app/database.py) |
| 새 DB의 첫 명단 | [`app/trainee_transfer.py`](app/trainee_transfer.py) | [Vercel 배포·이관 절차](VERCEL_DEPLOY.md) |
| 배포 또는 Cron | [`index.py`](index.py), [`vercel.json`](vercel.json) | [`app/routers/cron.py`](app/routers/cron.py), [Vercel 배포·이관 절차](VERCEL_DEPLOY.md) |

[백엔드 구조 메모](ARCHITECTURE.md)는 크롤링·DB 반영 책임을 짧게 설명한다. 이 문서와 다른 설명이 있으면 현재 소스 코드를 기준으로 확인한다. FastAPI가 생성하는 `/docs`와 `/redoc`에서는 현재 실행 중인 API의 요청 모델을 볼 수 있다.

## 저장소 분리 후의 경계

```text
브라우저 / React 프론트엔드 저장소
  └─ HTTPS, JSON → 백엔드 /api/*
                     ├─ app/routers/* → SQLAlchemy → 지속성 있는 MySQL/PostgreSQL
                     └─ app/routers/cron.py → LMS 크롤러 → 같은 DB
Vercel Cron ─ Authorization: Bearer <CRON_SECRET> ─┘
```

- **프론트엔드 책임:** 화면, 검색·필터·모달·임시 입력 상태, 사용자 동작에 따른 API 호출, 반환값 표현. 프론트엔드에 DB 비밀번호나 LMS 로그인 정보를 넣지 않는다.
- **백엔드 책임:** 입력 모델과 저장·조회 API, 기수와 팀 범위 확인, 진도 계산, 외부 LMS 수집, DB 마이그레이션, Cron 인증. 개인정보를 담은 응답과 쓰기 기능도 이 API에서 제공한다.
- **DB 책임:** 기수·팀·교육생 원본 명단, 미션별 진도, 프로젝트 상태, 사람이 작성한 기록. 브라우저에서 DB에 직접 접속하지 않는다.
- **연결 계약:** 프론트엔드의 빌드 변수 `VITE_API_BASE_URL`에 `https://<백엔드 호스트>/api`를 지정하고, 백엔드의 `CORS_ORIGINS`에 실제 프론트엔드 **출처**를 지정한다. 이 변수는 각각 다른 Vercel 프로젝트에 둔다. 백엔드 URL이나 응답 구조를 바꾸면 두 저장소의 변경을 함께 검토한다.
- **Git/Vercel 경로:** 현재 한 저장소에서 배포할 때 백엔드 Vercel Root Directory는 `backend`다. `backend/` **내용 자체를 별도 Git 저장소의 최상위로 옮기면** Root Directory는 그 저장소의 최상위(`.`)로 바꾼다. 이때 `index.py`, `vercel.json`, `requirements.txt`, `app/`을 같은 최상위에 유지한다. [기존 배포 문서](VERCEL_DEPLOY.md)의 `backend` 경로 예시는 분리 전 레이아웃 기준이다.

## 주요 기술과 실행 진입점

Python 3.12 기준의 FastAPI·Pydantic v2·SQLAlchemy 2.x 앱이다. 외부 페이지에는 `requests`와 Beautiful Soup을 쓰고, 로컬 예약에는 APScheduler를 쓴다. 정확한 패키지 선언은 [`requirements.txt`](requirements.txt)를 따른다. [`index.py`](index.py)는 Vercel Python Function이 [`app/main.py`](app/main.py)의 `app`을 가져오는 얇은 진입점이다. 같은 FastAPI 앱을 로컬 Uvicorn에서도 사용한다.

`main.py`는 `/api/cohorts`, `/api/trainees`, `/api/teams`, `/api/dashboard`, `/api/schedules`, `/api/cron` 라우터를 등록한다. API 요청의 DB 세션은 [`app/database.py`](app/database.py)의 `get_db()`가 열고 요청 후 닫는다. 로컬 앱 시작은 `initialize_schema()`를 실행하고, 기본 설정이면 매일 09:00 KST의 APScheduler도 시작한다. `VERCEL=1`에서는 둘 다 건너뛴다. Vercel 스키마 이행은 배포 전에 별도 명령으로 수행하고, 예약 호출은 Vercel Cron이 맡는다.

## 사용자 기능 → API → 저장소

표의 API 경로는 모두 `/api`부터 적었다. 읽기 기능도 개인 정보가 포함될 수 있다. 아래의 `team_id`는 보통 **전담팀 PK**이나, `team_projects.team_id`에는 외부 LMS의 팀 번호가 들어온다. 둘을 같은 ID라고 가정하지 않는다.

### 기수·기한

| 동작 | API | 처리·데이터 |
| --- | --- | --- |
| 기수 선택 목록 | `GET /api/cohorts/` | [`cohorts.py`](app/routers/cohorts.py)가 `cohorts` 전체를 반환한다. 화면에서 선택한 기수 ID가 이후 조회의 기준이 된다. |
| 기수 만들기 | `POST /api/cohorts/` | `cohort_name`, 필수 `end_date`, 선택 `start_date`를 받는다. 시작일이 있다면 기한보다 늦을 수 없다. `cohorts`에 저장한다. |
| 기한 수정 | `PATCH /api/cohorts/{cohort_id}` | 존재하는 기수의 `end_date`만 바꾼다. 시작일보다 이른 기한은 422다. |

기수 행을 만들었다고 자동으로 LMS 크롤링 대상이 되지는 않는다. 수집 대상과 페이지 번호는 별도의 [`crawl_config.py`](app/services/crawl_config.py)에 설정해야 한다.

### 교육생 명부·상세·전담팀 이동

| 동작 | API | 처리·데이터 |
| --- | --- | --- |
| 기수 명부 | `GET /api/trainees/cohort/{cohort_id}` | [`trainees.py`](app/routers/trainees.py)가 `trainees`, `teams`, `trainee_flags`를 조인하고 `progress_logs`에서 단계·개인 완료 수를 계산한다. **드랍 인원도 포함**한다. |
| 단건 등록 | `POST /api/trainees/` | 기수 ID·이름·이메일·선택 전화번호를 `trainees`에 저장한다. 이 경로에는 일괄 등록 수준의 명시적 기수·이메일 검증이 없으므로 DB 제약을 함께 확인해야 한다. |
| 여러 명 등록·배정 | `POST /api/trainees/bulk` | 기수·선택 팀·이름/이메일 목록을 받는다. 기수/팀 일치와 요청 내 이메일 중복을 검사하고, 같은 기수 기존 이메일은 팀 배정을 갱신한다. 다른 기수에 있으면 409다. 한 번의 commit으로 처리한다. |
| 조 이동·미배정 | `PUT /api/trainees/{trainee_id}/team` | `trainees.team_id`를 대상 팀 ID 또는 `null`로 바꾼다. 이동하면서 적은 `note`는 `facilitator_memos`의 교육생 메모로 남긴다. **이 경로는 대상 팀의 존재·기수 일치를 별도 검증하지 않는다.** |
| 주의·기술지원 상태 | `PUT /api/trainees/{trainee_id}/status` | `trainee_flags.requires_attention`, `is_tech_linked`를 생성 또는 부분 갱신한다. |
| 드랍·복귀 | `PUT /api/trainees/{trainee_id}/drop` | `trainees.is_dropped`, 드랍일·사유를 갱신한다. 복귀 시 드랍일·사유를 지운다. |
| 상세 | `GET /api/trainees/{trainee_id}/detail` | 기본 정보, 개인 상담 기록, 교육생 메모, 미션 완료일로 재구성한 진도 차트를 반환한다. 상세 진도는 해당 교육생 로그만 읽고 기수의 미션 종류를 별도로 조회한다. |

팀 보드는 드랍 인원을 제외하고 미배정 인원을 별도 열에 보여준다. 대시보드 명단도 드랍 인원을 제외한다. 위 명부 API만 드랍 인원까지 반환하므로 새 화면에서 어떤 명단을 쓸지 결정해야 한다.

### 상담 기록과 교육생 메모

| 동작 | API | 처리·데이터 |
| --- | --- | --- |
| 개인 상담/연락 작성 | `POST /api/trainees/{trainee_id}/contact` | 연락일·방식·주제·내용·담당자를 `contact_logs`에 저장한다. |
| 기수 상담 모음 | `GET /api/trainees/cohort/{cohort_id}/contacts` | 교육생·전담팀 이름을 붙이고 연락일 내림차순으로 반환한다. |
| 상담 삭제 | `DELETE /api/trainees/contact/{contact_id}` | `contact_logs` 행을 삭제한다. 별도 상담 수정 API는 없다. |
| 교육생 메모 작성 | `POST /api/trainees/{trainee_id}/memos` | 제목 선택, 내용 필수. `facilitator_memos`에 `trainee_id`를 채워 저장한다. |
| 교육생 메모 수정·삭제 | `PATCH /api/trainees/memos/{memo_id}`, `DELETE /api/trainees/memos/{memo_id}` | 교육생 메모만 대상으로 삼는다. 수정 시 `updated_at`을 갱신한다. |

개인 상담(`contact_logs`)과 팀 전화 캠페인(`team_call_campaigns` + `team_call_recipients`)은 별개의 기록이다. 교육생 메모와 팀 메모는 **같은 `facilitator_memos` 테이블**을 쓰되 `trainee_id` 유무로 구분한다.

### 전담팀 보드·팀 프로젝트·팀 메모·전화

| 동작 | API | 처리·데이터 |
| --- | --- | --- |
| 팀 편성 보드 | `GET /api/teams/cohort/{cohort_id}` | [`teams.py`](app/routers/teams.py)가 활성 교육생을 현재 전담팀 또는 미배정으로 나누고, 진도 단계 및 `team_projects` 상태를 붙인다. 연결되지 않는 팀 ID도 미배정에서 찾을 수 있게 한다. |
| 전담팀 생성·삭제 | `POST /api/teams/`, `DELETE /api/teams/{team_id}` | `teams`에 추가하거나 삭제한다. 삭제 시 해당 팀의 교육생을 먼저 미배정으로 돌린다. |
| 팀 프로젝트 현황 | `GET /api/teams/cohort/{cohort_id}/projects` | LMS에서 들어온 `team_projects`를 외부 팀 번호별로 묶는다. `status_changed_date`가 없는 옛 행만 해당 미션의 최근 크롤링 시각을 대신 쓴다. |
| 팀별 메모 조회·작성·수정·삭제 | `GET/POST /api/teams/{team_id}/memos`, `PATCH/DELETE /api/teams/{team_id}/memos/{memo_id}` | `facilitator_memos`의 해당 팀 기록을 다룬다. 팀별 조회에는 같은 팀에 속한 교육생 메모도 포함될 수 있다. 수정 시 `updated_at`이 바뀐다. |
| 기수 전체 팀/교육생 메모 | `GET /api/teams/cohort/{cohort_id}/memos` | 같은 테이블에서 기수 전체를 읽어 `memo_type`을 `team` 또는 `trainee`로 붙인다. 팀 기록 모음의 원천 중 하나다. |
| 팀 전화 기록 조회·생성 | `GET/POST /api/teams/cohort/{cohort_id}/call-campaigns` | 하나의 공통 `reason`을 캠페인에, 대상자별 `received`(기본 `true`)·선택 `note`를 수신자 행에 저장한다. 등록 시 해당 기수·팀의 비드랍 교육생인지 확인한다. |
| 팀 전화 수정·삭제 | `PATCH/DELETE /api/teams/cohort/{cohort_id}/call-campaigns/{campaign_id}` | 사유와 선택한 수신자 목록을 수정하거나 삭제한다. 목록 수정은 기존 수신자 집합을 통째로 대체하며 `updated_at`을 갱신한다. |
| 팀 프로젝트 현황판 메모 | `GET/POST /api/teams/cohort/{cohort_id}/board-memos`, `DELETE /api/teams/cohort/{cohort_id}/board-memos/{memo_id}` | 특정 팀이 아닌 기수의 `team_board_memos`에 남긴다. |

한 팀 전화 캠페인은 여러 수신자와 함께 한 트랜잭션으로 저장된다. 미수신자는 `received=false`로 남기고 개인별 특이사항은 `note`에 적는다. `TeamCallRecipient`의 `received` 기본값은 true지만, 프론트엔드가 값을 명시하면 그 값이 우선한다. **전담팀 PK와 외부 LMS 프로젝트 팀 번호를 동일하게 연결하는 FK는 없다.**

### 대시보드·진도 정체·공지

| 동작 | API | 처리·데이터 |
| --- | --- | --- |
| 전체 대시보드 | `GET /api/dashboard/{cohort_id}` | [`dashboard.py`](app/routers/dashboard.py)가 비드랍 명단 `trainees`, `missionProgressByTrainee`, 기간별 `chartData`, `historyAvailable`, `historyMode`, `range`를 반환한다. 선택 `start_date`, `end_date`, `team_id`로 범위를 줄일 수 있다. 기본 기간은 오늘 포함 최근 7일이다. |
| 명단만 빠르게 조회 | `GET /api/dashboard/{cohort_id}?roster_only=true` | 팀 화면에 쓰는 교육생·파생 진도·마지막 완료일 명단을 돌려주고 미션별 목록과 기간별 차트 계산은 생략한다. |
| 공지 조회·작성 | `GET/POST /api/dashboard/{cohort_id}/notices` | `notices`를 기수별로 가져오거나 `content`, `category`(일반/긴급)를 저장한다. 조회는 고정 공지 우선·작성일 최신 순이다. |
| 공지 고정·완료·삭제 | `PUT /api/dashboard/notices/{notice_id}`, `DELETE /api/dashboard/notices/{notice_id}` | `is_pinned` 및 `status`를 바꾸거나 행을 삭제한다. 생성 요청의 `author` 필드는 현재 모델에 있으나 라우터에서 저장 시 사용하지 않아 DB 기본 작성자가 적용된다. |

단계는 저장된 단일 `current_level` 값이 아니라 [`progress_state.py`](app/services/progress_state.py)가 `progress_logs`의 미션별 완료 상태에서 계산한다. 개인 미션은 관측된 미션 라벨 수를 목표로 삼고, 없다면 1·2단계 3개, 3단계 2개를 기본으로 한다. 각 단계에서 개인 목표와 팀 미션 완료가 모두 충족되면 다음 단계로 넘어간다. `team_id` 필터는 현재 소속팀 기준이다.

현재 진도는 완료 상태 문자열을 사용하고, 과거 날짜 진도는 그 날짜 이전의 `completed_at`도 요구한다. 차트는 일일 스냅샷 테이블이 아니라 현재 보관된 미션 행과 완료일·드랍일에서 조회할 때 재구성한다. 따라서 상태가 나중에 되돌려지면 과거 차트도 바뀔 수 있다. `historyMode`는 `crawl_missions`, `legacy_logs`, `none` 중 하나다. 프론트엔드의 정체 명단은 명단 응답의 `last_progress_at`과 선택한 일수 기준을 이용해 계산한다. 별도의 정체 명단 테이블은 없다.

### 일정·행사 참석 명단

| 동작 | API | 처리·데이터 |
| --- | --- | --- |
| 기수 일정 | `GET /api/schedules/cohort/{cohort_id}` | [`schedules.py`](app/routers/schedules.py)가 해당 기수와 공통 일정(`cohort_id=0`)을 함께 반환한다. `all`은 전체 일정이다. |
| 일정 작성·수정·삭제 | `POST /api/schedules/`, `PUT/DELETE /api/schedules/{event_id}` | `schedule_events`에 제목·설명·날짜·종류를 저장한다. 삭제 시 관련 `event_registrations`도 지운다. |
| 참석 명단 | `GET /api/schedules/{event_id}/roster` | 신청 기록에 교육생·팀 이름을 붙여 반환한다. |
| 명단 추가·취소 | `POST /api/schedules/{event_id}/register`, `PUT /api/schedules/cancel/{registration_id}` | 다른 기수 교육생의 신청을 막고 이미 `신청완료`인 중복을 막는다. 취소는 삭제 대신 상태를 `취소됨`으로 바꾼다. |

일정 종류는 요청의 `event_type` 문자열이다. 현재 API는 특정 종류만 참석 명단을 만들도록 제한하지 않는다. `event_registrations`의 `event_id`·`trainee_id`는 ORM 외래 키로 선언되지 않았으므로 수정 시 참조 검증을 함께 살펴야 한다. 실제 출석 확인용 별도 상태/API는 아직 없다.

## 대표 기능의 끝까지 흐름

### 팀 편성에서 사람을 이동할 때

1. 프론트엔드가 선택 기수의 `GET /api/teams/cohort/{cohort_id}`와 `GET /api/dashboard/{cohort_id}?roster_only=true`를 받아, 팀별 현재 교육생과 미배정 대기열 및 진도 표시를 구성한다. 이 두 GET의 데이터는 각각 팀 배치와 진도 파생 정보라는 다른 목적을 가진다.
2. 사용자가 교육생을 다른 팀이나 미배정 열로 옮기면 프론트엔드가 `PUT /api/trainees/{trainee_id}/team`에 `to_team_id`(미배정은 `null`)와 선택 메모를 보낸다.
3. 라우터는 교육생을 찾고 기존 `team_id`와 대상이 다를 때만 변경한다. 내용이 있는 메모는 같은 commit 안에서 `facilitator_memos`에 `title="조 변경 메모"`로 저장한다. `team_id`는 새 팀, 미배정 이동이라면 이전 팀을 기록한다.
4. 이후 편성 보드를 다시 조회하거나 화면 상태를 갱신하면 새 팀 열에 인원이 보인다. 교육생 상세를 조회하면 이동 메모가 개인 메모 목록에도 나온다. 이 API에는 별도 팀 이동 이력 테이블이 없다.

### 교육생 개인 진도와 단계별 통계를 볼 때

1. 대시보드 GET은 현재 기수의 교육생·플래그를 읽고, `load_progress_logs()`로 해당 범위의 미션 로그를 불러온다. `build_progress_state_map()`은 각 교육생이 **현재 어느 단계에 있는지**를 계산한다.
2. 응답의 `trainees`는 현재 단계, 해당 단계 개인 완료 수/목표, 팀 미션 완료 여부, 주의·기술지원 여부, 최근 완료일을 가진다. `missionProgressByTrainee`는 화면이 미션 라벨별 완료 인원과 분모를 만드는 데 쓰는 미션 단위 목록이다. API가 카드의 모든 퍼센트를 완성해서 보내는 구조는 아니다.
3. 날짜 범위를 지정하면 백엔드가 날짜별 마감 시각을 기준으로 단계·과제·수료·드랍 추이를 `chartData`로 계산한다. 과거 재구성에는 완료일 정보가 중요하며, 저장된 현재 상태의 변화가 과거 조회 결과에도 영향을 줄 수 있다.
4. 교육생 한 명을 열면 `GET /api/trainees/{trainee_id}/detail`이 해당 교육생의 연락 기록·메모와 미션 완료 시점별 개인 차트를 만든다. 같은 사람에 관한 화면이라도 기수 대시보드와 개인 상세는 응답 모양이 다르다.

### 팀 메모·전화 기록을 남길 때

1. 한 사람의 학습 상황을 적으면 `POST /api/trainees/{id}/memos`가 `facilitator_memos`에 `trainee_id`를 채운다. 팀 전체의 공통 내용을 적으면 `POST /api/teams/{team_id}/memos`가 같은 테이블에 `trainee_id=null`로 저장한다. 기수 현황판의 짧은 메모는 별도 `team_board_memos`다.
2. 여러 사람에게 같은 이유로 전화했다면 `POST /api/teams/cohort/{cohort_id}/call-campaigns`가 먼저 기수와 팀의 관계, 사유의 비어 있지 않음, 수신자 중복·팀 소속·드랍 여부를 확인한다. 검증에 실패하면 기록을 만들지 않는다.
3. 성공하면 `team_call_campaigns` 1행에 공통 사유·담당자를, `team_call_recipients` 여러 행에 교육생 ID·연락 받음 여부·개인 특이사항을 연결해 한 번에 commit한다. GET은 캠페인과 수신자들을 묶어 반환한다.
4. 수정 화면이 PATCH를 보내면 공통 사유나 수신자 집합을 갱신하고 캠페인의 `updated_at`을 바꾼다. `recipients` 필드를 보내는 수정은 **부분 추가가 아니라 전체 교체**다. 새 클라이언트는 기존 수신자를 유지하려면 모두 다시 보내야 한다.

### 공지·일정을 팀 기록 모음에서 볼 때

1. 기수 공지는 `notices`에, 일정은 `schedule_events`에 각각 저장된다. 팀 메모·상담·전화도 별도 테이블과 API다. 백엔드에 이 모든 종류를 합쳐 반환하는 단일 `/feed` API는 없다.
2. 프론트엔드는 기수 공지, 일정, 팀/교육생 메모, 상담, 전화 등의 GET 결과를 가져와 종류별 항목으로 정규화하고 화면에서 날짜·필터 기준으로 합친다. 따라서 새 기록 종류를 추가하면 백엔드 CRUD뿐 아니라 프론트엔드 통합 목록의 변환·필터에도 연결해야 한다.
3. `category="긴급"` 공지는 일반 공지 목록에서도 내려온다. **미완료 긴급 공지를 눈에 띄는 위치에 따로 표시하는 것은 프론트엔드의 필터·배치 규칙**이다. 완료 처리에는 `PUT /api/dashboard/notices/{notice_id}`의 `status` 변경을 쓴다.
4. 일정의 참석자 보기에서는 `GET /api/schedules/{event_id}/roster`를 별도로 호출한다. 참석자를 추가하면 일정과 교육생의 기수가 맞는지 확인 후 `신청완료` 행을 만들고, 취소하면 기존 행의 상태를 `취소됨`으로 바꾼다.

## 크롤링과 진도 갱신 흐름

```text
Vercel Cron 또는 로컬 APScheduler
  → GET /api/cron/crawl 의 Bearer 검사(Vercel 경로)
  → crawl.py: 활성 기수마다 모든 팀·개인 미션 페이지 수집
  → crawl_client.py: LMS 로그인/쿠키/XSRF, HTTP 요청
  → crawl_parser.py: HTML에서 외부 팀·교육생 이메일·상태·완료일 추출
  → 기수의 전체 페이지 성공 여부 확인
  → crawl_persistence.py: 이메일로 교육생 매칭, 미션 행/팀 프로젝트 갱신
  → 기수 단위 commit; 실패 시 rollback
  → progress_state.py: 화면 조회 시 저장된 행에서 현재 단계 계산
```

1. [`crawl_config.py`](app/services/crawl_config.py)가 기수별 페이지 번호·레벨·라벨·활성 상태를 정의한다. 현재 **1기만 활성**이며 팀 7개 + 개인 8개, 총 15개 페이지다. 2기 항목은 주석 예시다. `level_requirements` 설정은 현재 `progress_state.py`의 목표 계산에는 연결되지 않는다.
2. [`crawl_client.py`](app/services/crawl_client.py)는 `CODYSSEY_ID`/`CODYSSEY_PW`가 있으면 로그인하고, 없으면 선택적 `CODYSSEY_COOKIE`를 사용한다. 페이지 요청 제한 시간은 15초다. 데이터 영역이 없다는 파서 오류가 나고 로그인 자격 증명이 있으면 재로그인 후 한 번 재시도한다.
3. [`crawl_parser.py`](app/services/crawl_parser.py)는 `.card.uqstn`과 `misTeamList_` 목록이 없으면 오류로 처리한다. 목록이 비어 있어도 기본은 실패다. 정말 빈 목록이 정상인 설정만 `allow_empty: True`를 명시한다. 파서는 DB를 직접 쓰지 않는다.
4. [`crawl.py`](app/services/crawl.py)는 페이지를 모으는 동안 DB 트랜잭션을 열지 않는다. 한 기수의 페이지가 **모두 성공해야** 저장을 시작한다. 한 페이지라도 실패하면 그 기수의 기존 DB 값은 그대로 두고, 다른 성공 기수는 별도로 commit될 수 있다. 전체 호출은 오류를 보고한다.
5. [`crawl_persistence.py`](app/services/crawl_persistence.py)는 해당 기수의 교육생·기존 미션 행·기존 프로젝트를 먼저 읽는다. LMS의 교육생 이메일을 소문자·공백 제거로 맞춰 `trainees`를 찾고, `(교육생, 단계, 종류, 라벨)`별 `progress_logs`를 갱신한다. `last_updated`는 이번 수집 확인 시각이며 `completed_at`은 LMS가 제시한 완료일이다. 개인 미션 저장은 드랍 인원을 건너뛰지만 팀 미션에서는 별도 드랍 검사를 하지 않는다.
6. 팀 프로젝트는 LMS `team_sn`과 미션 라벨로 `team_projects`를 찾는다. `status` 또는 `member_names`가 달라질 때만 `status_changed_date`를 바꾼다. 수집에서 보이지 않은 기존 행을 삭제하는 동기화는 아니다. 한 기수의 팀·개인 저장이 하나의 DB 트랜잭션이다.

현재 경로에는 중간 JSON/CSV 파일이 없다. [`app/services/sync_service.py`](app/services/sync_service.py)는 `temp_data` 파일을 읽던 **이전 경로**로, 지금의 Cron·APScheduler가 호출하지 않는다. 이 코드를 새 크롤링 결과의 DB 반영 경로로 연결하지 않는다.

### 예약과 수동 실행

[`vercel.json`](vercel.json)의 `0 0 * * *`는 00:00 UTC = 매일 09:00 KST다. Vercel은 `/api/cron/crawl`을 호출한다. [`cron.py`](app/routers/cron.py)는 `Authorization: Bearer <CRON_SECRET>`을 비교한다. 비밀값 없음은 503, 잘못된 토큰은 401, 활성화되지 않은 `cohort_id`는 404, 크롤링 오류는 500이다. `?cohort_id=1`처럼 지정하면 해당 활성 기수만 실행한다.

로컬 [`crawl_scheduler.py`](app/crawl_scheduler.py)는 09:00 KST에 같은 Python 크롤러 함수를 직접 호출한다. `ENABLE_SCHEDULER=false`로 끌 수 있다. `VERCEL=1`에서는 자동으로 켜지지 않는다. 현재 중복 실행 잠금·자동 재시도·미션별 체크포인트는 없다. Vercel 함수의 실제 실행 시간과 수집 실패 로그를 배포 후 확인해야 한다.

## DB 구조와 변경 순서

[`app/models.py`](app/models.py)에 ORM 테이블 14개가 있다. 기능별 주요 관계는 다음과 같다.

| 그룹 | 테이블 | 기록의 의미 |
| --- | --- | --- |
| 기본 명단 | `cohorts`, `teams`, `trainees`, `trainee_flags` | 기수·기한, 전담팀, 교육생·드랍 상태, 담당자 플래그 |
| LMS 진도 | `progress_logs`, `team_projects` | 교육생별 미션 상태/완료일/확인일, 외부 팀 프로젝트 상태 |
| 업무 기록 | `facilitator_memos`, `team_board_memos`, `contact_logs` | 팀/교육생 메모, 기수 현황판 메모, 개인 상담/연락 |
| 팀 전화 | `team_call_campaigns`, `team_call_recipients` | 공통 사유와 대상별 연락 받음/특이사항 |
| 공지·일정 | `notices`, `schedule_events`, `event_registrations` | 기수 공지, 날짜별 일정, 참석 신청/취소 |

`DATABASE_URL`이 있으면 해당 SQLAlchemy URL로 연결한다. 일반 로컬 실행에서 없으면 `codyssey.db` SQLite를 사용하지만, Vercel에서는 누락 시 앱 시작 오류다. `postgres://`·`postgresql://` URL은 `postgresql+psycopg://`로 정규화한다. 엔진은 `pool_pre_ping=True`, Vercel에서는 `NullPool`을 사용한다.

새 테이블 또는 컬럼을 만들 때는 **모델 → 기존 데이터 호환 마이그레이션 → 라우터/응답 → 프론트엔드 API 계약** 순서로 함께 검토한다. [`migrations.py`](app/migrations.py)의 `initialize_schema()`는 `create_all()` 후 레거시 테이블·컬럼 이행과 인덱스 생성을 수행한다. Alembic의 버전별 마이그레이션 체계는 없다. 오래된 DB를 바꾸는 경로에는 열·테이블 제거도 있으므로 기존 운영 DB에서는 백업과 스키마 검토를 먼저 한다. `progress_logs`의 미션 고유 인덱스는 `(trainee_id, level, mission_type, mission_label)`이다. 기존 중복 행이 있으면 인덱스 생성이 실패할 수 있고 자동 중복 정리는 구현돼 있지 않다.

Vercel 함수는 요청 때 DDL을 실행하지 않는다. 새 대상 DB에 연결 가능한 **로컬 작업 환경**에서 먼저 `python -m app.migrations`를 실행한 다음 앱을 배포한다. 실행 전 `DATABASE_URL`이 정확한 대상 DB를 가리키는지 확인한다.

## 새 DB에 교육생 명단 넣기

[`trainee_transfer.py`](app/trainee_transfer.py)는 소스 DB에서 **기수·팀·교육생만** 비공개 JSON으로 내보내고 새 DB에 같은 ID로 추가한다. 기수의 `start_date`와 **기한 `end_date`**도 포함한다. 기본 import는 추가 예정 건수를 보여 주는 미리보기이며 `--apply`를 해야 기록한다. 이미 있는 ID·이메일은 충돌 여부를 확인하며 기존 행을 덮어쓰지 않는다. PostgreSQL에서는 명시적으로 넣은 ID 이후 자동 증가 시퀀스를 조정한다.

이 도구는 `trainee_flags`, `progress_logs`, 메모, 공지, 일정, 상담, 팀 전화 기록을 이관하지 않는다. 진도는 배포 후 크롤링으로 들어오지만 다른 업무 기록은 별도 이관이 필요하다. [`database_snapshot.py`](app/database_snapshot.py)는 전체 DB의 **보관용 export**만 있고 자동 복원 기능은 없다. 현재 준비된 로컬 비공개 roster 파일과 구체적인 export/import 명령은 [배포·이관 절차](VERCEL_DEPLOY.md)에 있다. 비공개 JSON은 Git 저장소나 Vercel 함수 파일에 넣지 않는다. 명단에 2기수가 있어도 현 크롤러는 1기만 활성이라는 점을 구별한다.

## 로컬 실행과 환경 변수

```powershell
# 이 README가 있는 백엔드 디렉터리에서 실행
python -m pip install -r requirements.txt
$env:ENABLE_SCHEDULER = 'false'
python -m uvicorn app.main:app --reload
```

앱 기본 주소는 Uvicorn의 `http://127.0.0.1:8000`이고 `GET /`는 상태 확인용 `status: ok`를 반환한다. 별도 프론트엔드 개발 서버에서 API 프록시를 쓰거나 프론트엔드의 `VITE_API_BASE_URL`을 이 API의 `/api` 주소에 맞춘다. 환경 변수 예시는 [`.env.example`](.env.example)을 복사하되 실제 값은 `.env`에만 둔다.

| 변수 | 사용 위치 | 의미 |
| --- | --- | --- |
| `DATABASE_URL` | API·마이그레이션 | 지속성 있는 MySQL/PostgreSQL의 SQLAlchemy URL. Vercel에서 필수. |
| `CORS_ORIGINS` | API | 쉼표로 구분한 프론트엔드의 정확한 브라우저 출처. 기본은 로컬 5173 출처 2개. |
| `CRON_SECRET` | Cron API·Vercel | 요청의 Bearer 토큰과 비교할 비밀값. |
| `CODYSSEY_ID`, `CODYSSEY_PW` | 크롤러 | 외부 LMS 로그인. |
| `CODYSSEY_COOKIE` | 크롤러 | ID/PW가 없을 때만 쓰는 선택적 쿠키 대안. |
| `CODYSSEY_AUTH_URL`, `CODYSSEY_ID_FIELD`, `CODYSSEY_PW_FIELD` | 크롤러 | 외부 인증 주소·필드명이 기본값과 다를 때만 조정. |
| `ENABLE_SCHEDULER` | 로컬 API | `false`면 APScheduler 중지. Vercel에서는 자동 중지. |
| `SOURCE_DATABASE_URL`, `TARGET_DATABASE_URL` | **로컬** 이관 CLI | 원본/대상 DB 연결. Vercel 함수 환경에 둘 필요가 없다. |

## 분리 배포와 협업 시 주의할 점

1. 백엔드 Git 저장소에는 이 디렉터리의 **코드·설정 예시·문서**만 옮긴다. 로컬 `.env`, `codyssey.db`, `private_exports/`, 임시 JSON/CSV, 가상환경은 제외한다. 이 폴더의 [`.gitignore`](.gitignore)를 새 저장소 루트에 함께 옮긴다. 상위 단일 저장소의 제외 규칙은 자동으로 따라오지 않는다. [`.vercelignore`](.vercelignore)는 CLI 업로드 제외용으로 별도로 유지한다.
2. 백엔드 Vercel 프로젝트를 새 저장소와 연결하면 Root Directory는 `.`이고, `index.py`가 최상위에 있어야 한다. 프론트엔드는 별도 Vercel 프로젝트와 저장소를 사용한다. 현재 `vercel.json`은 백엔드 Cron만 설정한다.
3. 백엔드 Production 환경에는 DB·LMS·Cron 비밀값과 `CORS_ORIGINS`를, 프론트엔드 빌드 환경에는 백엔드 `/api` URL을 둔다. Vercel 함수 파일 시스템의 SQLite에 데이터를 보관하지 않는다.
4. 일반 API에는 사용자 로그인·역할별 인가가 **없다**. `CORS_ORIGINS`는 브라우저 출처 제한이며 API 인증이 아니다. 개인정보가 있는 공개 서비스라면 접근 보호를 먼저 설계해야 한다. Cron만 `CRON_SECRET` Bearer 검사를 한다.
5. 기능 작업 브랜치에서 API 경로·요청 필드·응답 필드를 바꾸면 프론트엔드 저장소의 API 래퍼와 화면도 함께 바꾼다. DB 변경은 기존 DB 이행 순서와 명단·크롤링 영향을 기록한다. 두 Vercel 프로젝트는 별도 배포이므로 호환 가능한 순서로 병합·배포한다.

현재 코드만으로 이미 운영 중인 Vercel 프로젝트의 Git 연결, 권한 또는 도메인이 자동 변경되지는 않는다. 실제 연결·배포·원격 초기 이관 절차는 [Vercel 배포·이관 절차](VERCEL_DEPLOY.md)를 참고한다.
