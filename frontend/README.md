# Codyssey 프론트엔드

기수별 교육생·전담팀·LMS 진도·운영 기록을 다루는 React 단일 페이지 앱(SPA)이다. 이 폴더만 별도 Git 저장소로 옮겨도 화면의 책임과 백엔드 연결 지점을 찾을 수 있도록 **현재 구현**을 설명한다. 교육생 원본 데이터, DB 파일, API 비밀값은 이 저장소에 두지 않는다.

## 처음 보는 개발자를 위한 지도

```text
사용자 → src/App.jsx 경로 선택 → src/pages/*.jsx 화면
      → src/api/*.js Axios 래퍼 → FastAPI /api/... → DB 또는 LMS 수집 결과
                        ↑
              src/context/GlobalContext.jsx의 선택 기수 ID
```

| 위치 | 책임 |
| --- | --- |
| [src/main.jsx](src/main.jsx), [src/App.jsx](src/App.jsx) | 테마 초기화, React 시작, 라우팅, 화면 지연 로드, 기수 Context |
| [src/components/Layout.jsx](src/components/Layout.jsx), [src/components/Topbar.jsx](src/components/Topbar.jsx) | 공통 외곽, 메뉴, 기수 선택·기한, 전역 검색, 테마 전환 |
| [src/pages/](src/pages/) | 경로별 화면과 사용자 입력·필터·모달·화면 상태 |
| [src/api/](src/api/) | 엔드포인트별 요청 함수. 화면에서 URL 문자열을 직접 만들지 않도록 하는 경계 |
| [src/api/axios.js](src/api/axios.js) | Axios의 공통 base URL과 JSON 헤더 |
| [src/styles/index.css](src/styles/index.css), 각 화면의 `.css` | 다크/라이트 토큰과 화면별 스타일 |

`App.jsx`는 `/` 및 알 수 없는 URL을 `/dashboard`로 보낸다. `GlobalContext`에 공유하는 것은 `selectedCohort`와 setter뿐이다. 첫 ID는 `1`이고, Topbar가 서버 기수 목록에 1이 없으면 첫 기수로 조정한다. 기수 선택은 새로고침 후 보존되지 않는다. 각 화면은 선택 기수가 바뀌면 필요한 API를 다시 호출한다. 서버 상태용 별도 캐시나 실시간 WebSocket은 없다.

의존성 선언은 [package.json](package.json), 고정된 설치 해상도는 [package-lock.json](package-lock.json)에 있다. 주요 기술은 React/React DOM 18, React Router 6, Axios 1, Recharts 3, Lucide React 1, Vite 8, Tailwind CSS 4 및 일반 CSS다. 버전 숫자는 현재 `package.json`의 선언 기준이며 실제 설치 버전은 lockfile을 따른다.

## 화면·기능·소스 위치

아래의 “쓰기”는 버튼이 보내는 요청을 뜻한다. LMS 미션·프로젝트의 원천 갱신은 백엔드 크롤러가 담당하며, 프론트에서 미션 완료 상태 자체를 수정하지 않는다.

| 경로와 화면 | 사용자가 하는 일과 화면의 계산 | 읽기 및 쓰기 API | 고칠 파일 |
| --- | --- | --- | --- |
| `/dashboard` 대시보드 | 기수 현황·기간별 선 그래프·단계별 개인/팀 미션 완료율을 본다. 이전 주 기본 범위와 날짜 프리셋을 바꿀 수 있다. 마지막 미션 완료일 기준 정체 명단을 기준일·경과일·팀·기록 없음 포함 여부로 거른다. 단계 아코디언의 검색/선택과제 완료 필터, 공지 작성·상태/고정 토글·삭제, 빠른 드랍을 제공한다. | `GET /dashboard/{cohort_id}`와 `GET/POST /dashboard/{cohort_id}/notices`, `PUT/DELETE /dashboard/notices/{notice_id}`, `PUT /trainees/{id}/drop` | [Dashboard.jsx](src/pages/Dashboard.jsx), [MissionProgressByLevel.jsx](src/components/MissionProgressByLevel.jsx), [PeriodProgressSection.jsx](src/components/PeriodProgressSection.jsx) |
| `/facilitator-teams` 전담팀 편성 | 미배정 대기열과 전담팀 보드/표를 보고 검색한다. 팀 생성·삭제, 이름/이메일 붙여넣기 일괄 등록, 팀 사이 드래그 이동, 교육생 개인 메모, 빠른 드랍, 학습지원 화면 이동·팀 상세 이동을 한다. 팀 목록과 대시보드 명단은 병렬 조회하므로 한쪽만 실패해도 다른 쪽은 표시할 수 있다. 드래그는 화면에 먼저 반영하고 실패하면 서버에서 다시 읽는다. | `GET/POST/DELETE /teams/...`, `GET /dashboard/{cohort_id}?roster_only=true`, `POST /trainees/bulk`, `PUT /trainees/{id}/team`, `POST /trainees/{id}/memos`, `PUT /trainees/{id}/drop` | [FacilitatorTeams.jsx](src/pages/FacilitatorTeams.jsx) |
| `/facilitator-teams/:teamId` 전담팀 상세 | 단계별 팀 명단·진도·최근 연락·정체 명단을 보고 이름/선택과제/위험/학습지원으로 거른다. 위험 및 학습지원 상태 토글, 드랍, 팀 메모 또는 교육생 개인 메모 작성·수정·삭제, 팀 전화 기록 열람, 선택 기간 진도 그래프를 제공한다. 표시 중 60초마다, 브라우저 탭이 다시 보일 때 새로 읽는다. | `GET /dashboard/{cohort_id}?team_id=...&roster_only=true`, `GET /teams/cohort/{cohort_id}`, 기수 메모·상담·전화 목록, `PUT /trainees/{id}/status|drop`, 팀/개인 메모 CRUD, 기간 그래프용 대시보드 GET | [TeamDetail.jsx](src/pages/TeamDetail.jsx), [PeriodProgressSection.jsx](src/components/PeriodProgressSection.jsx) |
| `/team-memos` 팀 기록 모음 | 팀/개인 메모, 상담, 팀 전화, 공지, 일정·행사를 한 피드로 합쳐 검색·기록 종류·팀으로 거른다. 팀 메모와 팀 전화 기록을 새로 작성한다. 전화 기록은 공통 사유와 여러 교육생 수신 여부·개별 특이사항을 묶고, 최초 수신값은 `true`다. 기존 전화 기록에서는 사유와 기존 대상자의 수신/특이사항을 수정한다. 미완료 `긴급` 공지는 별도 영역에도 표시하고 완료 처리할 수 있다. | 기수 메모·팀·상담·공지·일정·전화 목록 6개 GET; 팀 메모 POST/PATCH/DELETE; 전화 POST/PATCH/DELETE; 상담/공지 삭제; 긴급 공지 상태 PUT | [TeamMemos.jsx](src/pages/TeamMemos.jsx) |
| `/projects` 팀 프로젝트 현황판 | LMS에서 저장된 팀 프로젝트를 단계별로 그룹화해 팀·단계·참여자 검색 및 대기/진행/완료 필터로 본다. 프로젝트 선택 시 상세를 보고 현황판 메모를 작성·삭제한다. 화면의 “최근 갱신”은 주로 프로젝트 `status_changed_date`이며, 없는 옛 행은 관련 로그 시각으로 대체한다. | `GET /teams/cohort/{cohort_id}/projects`, 현황판 메모 `GET/POST/DELETE /teams/cohort/{cohort_id}/board-memos...` | [TeamProjects.jsx](src/pages/TeamProjects.jsx) |
| `/tech-support` 학습지원 연계팀 | `is_tech_linked` 교육생만 따로 보여 단계 분포, 선택과제·위험 필터, 위험 표시 토글, 연계 해제를 제공한다. 연계 해제는 원래 전담팀 소속을 바꾸지 않는다. | `GET /dashboard/{cohort_id}?roster_only=true`, `PUT /trainees/{id}/status` | [TechSupportTeam.jsx](src/pages/TechSupportTeam.jsx) |
| `/trainees` 전체 교육생 | 이름/이메일 검색, 전담팀·단계 필터, 드랍자를 뒤로 보낸 목록을 제공한다. 행을 열어 기본 정보, 미션 진도와 변경 기록, 상담, 개인 메모를 본다. 팀 이동, 드랍·복구, 상담 기록 작성·삭제, 개인 메모 작성·수정·삭제를 할 수 있다. Topbar 검색은 `?search=`로 이 화면에 들어온다. | `GET /trainees/cohort/{cohort_id}`, `GET /trainees/{id}/detail`, 팀 목록 GET, `PUT /trainees/{id}/team|drop`, 상담 POST/DELETE, 개인 메모 POST/PATCH/DELETE | [TraineeList.jsx](src/pages/TraineeList.jsx) |
| `/schedule` 전체 일정 | 월별 달력에서 날짜를 선택하고 일정·행사를 생성·수정·삭제한다. 현재 기수/전체 보기 및 행사 종류 필터가 있다. 공통 일정은 `cohort_id=0`으로 저장한다. 일정 상세에서 교육생 검색 후 참석 명단 등록 또는 취소를 한다. 날짜 한 번 클릭은 선택이고, 두 번 클릭이나 새 일정 버튼은 작성 창을 연다. | `GET /schedules/cohort/{cohort_id 또는 all}`, `POST /schedules/`, `PUT/DELETE /schedules/{event_id}`, `GET /schedules/{event_id}/roster`, 참석 등록 POST와 취소 PUT | [Schedule.jsx](src/pages/Schedule.jsx) |

### 공통 조작과 화면 사이 데이터 흐름

- [Topbar.jsx](src/components/Topbar.jsx): `GET /cohorts/`로 기수 목록을 받고 기수 생성은 `POST /cohorts/`, 기한 변경은 `PATCH /cohorts/{id}`다. 현재 생성 UI에는 **이름과 기한 입력**만 있다. 검색은 선택 기수의 `GET /trainees/cohort/{id}` 결과에서 이름/이메일로 최대 6건을 제안한다. `Ctrl/Cmd+K`로 검색창에 초점을 준다.
- [MissionProgressByLevel.jsx](src/components/MissionProgressByLevel.jsx): 서버가 반환한 교육생·미션 행을 받아 단계별 대상/전체 인원 전환과 미션별 완료 인원·비율을 계산한다. **완료 판정과 원시 미션 행 생성은 백엔드**의 책임이다. 서버 응답 필드가 바뀌면 여기와 대시보드 사용부를 같이 바꾼다.
- [PeriodProgressSection.jsx](src/components/PeriodProgressSection.jsx): 기간 프리셋·날짜 범위를 `GET /dashboard/{id}`의 `start_date`, `end_date`, 선택적 `team_id`로 보낸다. 서버의 `chartData`, `historyAvailable`, `historyMode`를 표시한다.
- 팀 상세의 최근 연락은 개인 상담과 팀 전화 수신자를 결합해 화면에서 가장 최근 것을 고른다. 팀 기록 모음은 여섯 API 결과를 화면에서 합치며, **별도의 통합 피드 엔드포인트는 없다**. 새 기록을 저장하면 해당 화면이 다시 조회한다.

### 기능별 실제 요청 흐름

1. **기수 변경·기한 수정.** Topbar가 `GET /cohorts/`로 선택 옵션을 채운다. 사용자가 기수를 바꾸면 `setSelectedCohort`가 전역 Context 값을 바꾼다. 열린 페이지의 `useEffect`가 새 ID로 해당 목록을 요청하고 교체한다. 새 기수 생성은 이름과 `YYYY-MM-DD` 기한을 입력받아 `POST /cohorts/`로 보낸 후 목록을 다시 받고 새 ID를 선택한다. 기한 수정은 `PATCH /cohorts/{id}` 결과로 Topbar의 기수 배열 항목만 교체한다. 이 작업에서 다른 페이지의 기록을 자동 생성하지 않는다.
2. **대시보드 기간 조회.** [Dashboard.jsx](src/pages/Dashboard.jsx)는 기본으로 직전 월요일~일요일을 `range`에 넣는다. 프리셋 또는 조회 버튼으로 범위를 확정하면 `useEffect`가 `dashboardApi.get`에 `start_date`, `end_date`를 보낸다. 응답의 명단·미션 행·차트·히스토리 가용 정보를 각 state에 저장한다. 카드와 그래프는 해당 응답으로 다시 그려진다. [MissionProgressByLevel.jsx](src/components/MissionProgressByLevel.jsx)의 “단계별 대상/전체 인원”은 화면에서 대상 집합을 전환하는 계산이며, 서버 DB를 변경하지 않는다.
3. **정체 명단과 빠른 드랍.** 대시보드가 교육생의 `last_progress_at`과 선택한 기준일 차이를 일 단위로 계산한다. 완료일이 없으면 `X`로 나타내며, 기준 경과일·전담팀·정렬·기록 없는 인원 포함 옵션은 브라우저에서 필터한다. 카드의 드랍 버튼은 확인과 선택적 사유 입력 후 `PUT /trainees/{id}/drop`을 보내고 대시보드를 다시 조회한다. “마지막 진도”는 마지막 **미션 완료** 시각으로, 크롤러가 데이터를 확인한 시각과 다르다.
4. **전담팀 편성과 일괄 등록.** [FacilitatorTeams.jsx](src/pages/FacilitatorTeams.jsx)가 팀 목록과 `roster_only` 명단을 병렬로 읽는다. 새 팀 이름을 입력하면 `POST /teams/` 후 두 자료를 다시 읽는다. 일괄 등록창은 붙여넣은 텍스트에서 이름·이메일 쌍을 미리 파싱하고, 선택한 팀 또는 미배정 ID와 함께 `POST /trainees/bulk`를 보낸다. 성공하면 창을 닫고 보드를 재조회한다. 팀 사이 드래그는 먼저 `teams` 화면 state를 이동시키고 `PUT /trainees/{id}/team`을 보낸다. 요청이 실패하면 목록을 다시 읽어 화면을 되돌린다. 팀 삭제 후에도 목록을 다시 읽으며, 소속 인원 처리 규칙은 백엔드가 결정한다.
5. **전담팀 상세 상태와 기록.** 팀 상세 진입 시 해당 `team_id`의 대시보드 명단, 팀 목록, 기수 메모, 상담, 팀 전화 목록을 병렬 조회한 뒤 현재 팀 인원과 관련 기록만 화면에서 추린다. 위험·학습지원 아이콘은 `PUT /trainees/{id}/status`로 한 필드를 뒤집고 다시 읽는다. 팀 메모는 `POST /teams/{team_id}/memos`, 개인 메모는 `POST /trainees/{id}/memos`를 쓰며 완료 후 다시 읽는다. 팀 상세의 최근 연락은 **개인 상담과 해당 팀 전화의 대상자 기록** 중 날짜가 최신인 것을 보여준다. 기간 그래프는 별도 `PeriodProgressSection`에서 `team_id`를 포함한 대시보드 GET을 수행한다.
6. **전체 교육생 상세·상담·개인 메모.** 목록에서 행을 열면 `GET /trainees/{id}/detail`로 상세·진도·상담·메모를 가져온다. 전담팀을 변경하면 `PUT /trainees/{id}/team` 후 전체 목록과 열린 상세를 재조회한다. 상담 등록은 방식·주제·내용·시각을 `POST /trainees/{id}/contact`로 전송하고, 해당 상세가 열려 있으면 다시 조회한다. 개인 메모 추가/수정 후에는 상세를 다시 읽고, 삭제 후에는 열린 상세의 `memos` state에서 해당 항목을 제거한다. 드랍·복구 역시 `PUT /trainees/{id}/drop` 후 목록과 상세를 갱신한다.
7. **팀 단위 전화 기록.** [TeamMemos.jsx](src/pages/TeamMemos.jsx)는 선택한 팀의 `members`를 전화 대상 후보로 펼친다. 사용자가 공통 사유와 대상자를 선택하고 각 사람의 연락 받음 체크 및 특이사항을 편집한다. 새 대상의 `received` 기본값은 `true`; 특이사항 입력창은 개별로 열 수 있다. 저장 시 `POST /teams/cohort/{id}/call-campaigns`에 `team_id`, `reason`, `recipients[{trainee_id, received, note}]`를 보낸다. 성공하면 전화 기록 필터로 전환하고 여섯 자료를 다시 읽어 피드에 표시한다. 수정창은 **기존 대상자**의 수신·특이사항과 공통 사유를 `PATCH`로 저장한 뒤 재조회한다.
8. **통합 기록·긴급 공지.** 팀 기록 화면은 기수 메모, 전담팀, 상담, 공지, 일정, 팀 전화 목록을 각각 가져와 클라이언트에서 `source`와 표시 날짜를 부여한다. `updated_at`이 있으면 이를 우선해 정렬하고 종류/팀/텍스트 필터를 적용한다. `category=긴급`이고 `status!=완료`인 공지만 별도 긴급 영역에 올린다. 완료 버튼은 `PUT /dashboard/notices/{notice_id}`에 `status: 완료`를 보내고 다시 읽는다. 새 공지 작성·고정 토글은 대시보드에서 담당한다. 통합 피드에 보이는 일정은 이 화면에서 수정하지 않고 일정 화면에서 관리한다.
9. **팀 프로젝트 현황판.** [TeamProjects.jsx](src/pages/TeamProjects.jsx)는 프로젝트 목록과 현황판 메모를 병렬 조회한다. 프로젝트 검색, 상태 필터, 1단계/2단계/Final 묶음과 `status_changed_date` 최신순 정렬은 브라우저에서 수행한다. 메모 추가는 `POST /teams/cohort/{id}/board-memos` 후 메모만 재조회하고, 삭제는 DELETE 성공 후 state에서 제거한다. LMS 프로젝트 카드의 상태는 이 화면에서 변경하는 폼이 없다.
10. **일정과 참석자.** [Schedule.jsx](src/pages/Schedule.jsx)는 선택 기수 또는 `all`의 이벤트를 조회해 달력에 배치한다. 날짜 클릭은 선택, 일정 작성 버튼/날짜 더블클릭은 작성창이다. 공통 체크 시 `cohort_id=0`으로 `POST /schedules/`하고, 저장·수정·삭제 뒤 일정 목록을 다시 읽는다. 일정 상세를 열면 `GET /schedules/{id}/roster`를 요청한다. 교육생 검색 후 등록은 `POST /schedules/{id}/register`, 취소는 `PUT /schedules/cancel/{registration_id}`이며 각각 참석 명단만 다시 읽는다.

## API 계약과 백엔드 분리 경계

모든 함수는 [src/api/axios.js](src/api/axios.js)의 Axios 인스턴스를 쓴다. 기본 `baseURL`은 `/api`다. 도메인 래퍼는 [cohorts.js](src/api/cohorts.js), [dashboard.js](src/api/dashboard.js), [teams.js](src/api/teams.js), [trainees.js](src/api/trainees.js), [schedules.js](src/api/schedules.js)로 나뉜다. UI가 기대하는 응답 모양을 바꿀 때는 화면과 래퍼, 백엔드 계약을 동시에 확인한다.

| 프론트에서 기대하는 값 | 영향을 받는 기능 |
| --- | --- |
| 대시보드의 `trainees`, `missionProgressByTrainee`, `chartData`, `historyAvailable`, `historyMode` | 현황 카드·명단·단계별 완료율·기간 그래프. `roster_only=true`는 명단만 필요한 화면에서 쓴다. |
| 교육생의 `id`, `name`, `email`, `team_id`, `team`, `level`, `done`, `target`, `optional_task_done`, `last_progress_at`, `is_dropped`, `is_tech_linked`, `requires_attention` | 검색, 필터, 진도율, 정체일, 위험/학습지원 토글, 드랍 표시 |
| 팀의 `team_id`, `team_name`, `members` | 전담팀 보드, 이동, 메모·전화 대상 선택 |
| 프로젝트의 `projects` 단계별 맵, `status`, `member_names`, `status_changed_date` | 팀 프로젝트 현황판 정렬·상세 |
| 메모/전화의 `created_at`, `updated_at`, 전화 `recipients[*].received|note` | 통합 피드 정렬, 수정 날짜, 팀 상세 최근 연락 |

이 저장소에는 서버 라우터, DB 모델·마이그레이션, LMS 로그인/크롤링, Vercel Cron이 없다. 백엔드 저장소의 FastAPI가 `/api` 접두사로 엔드포인트를 제공해야 한다. 브라우저가 별도 도메인의 API를 호출하므로 **백엔드 CORS 허용 origin에 프론트 배포 주소**가 포함돼야 한다. Vite의 개발 프록시는 배포된 정적 사이트에서는 작동하지 않는다.

## 로컬 실행

Node.js와 npm을 준비한 뒤 이 저장소 루트(현재 모노레포에서는 `frontend/`)에서 실행한다.

```bash
npm ci
npm run dev
```

기본 로컬 요청은 `/api`로 나가고 [vite.config.js](vite.config.js)가 이를 `http://localhost:8000` 백엔드로 프록시한다. 다른 로컬 백엔드를 쓸 때는 `.env.local`에 `API_PROXY_TARGET=http://localhost:8000` 형식으로 설정한다. 이 파일의 예시는 [.env.example](.env.example)에 있다. 별도 프로덕션 API 주소를 로컬에서 직접 확인하려면 `VITE_API_BASE_URL=https://.../api`를 설정한다. 실제 개인 데이터나 비밀값을 `.env`/소스에 커밋하지 않는다.

```bash
npm run build
```

빌드 결과는 `dist/`에 생성된다. 이 폴더의 [`.gitignore`](.gitignore)를 분리된 저장소 루트에 함께 옮겨 `node_modules/`, `dist/`, 로컬 환경 파일이 Git에 들어가지 않게 한다.

## 프론트엔드만 Vercel에 배포하기

1. **프론트엔드 저장소**를 별도의 Vercel 프로젝트에 연결한다. 저장소 루트에 이 폴더의 `package.json`이 놓이도록 분리한다. 기존 모노레포를 그대로 연결한다면 Root Directory는 `frontend`다.
2. Framework Preset은 **Vite**, Install은 `npm ci`(또는 Vercel 기본 설치), Build는 `npm run build`, Output Directory는 `dist`로 둔다.
3. 프로젝트 환경 변수 `VITE_API_BASE_URL`에 **배포된 백엔드의 공개 주소와 `/api` 접두사**를 함께 넣는다. 예: `https://backend.example.com/api`. 실제 주소가 정해지기 전에는 예시를 그대로 쓰지 않는다. `VITE_` 변수는 빌드된 브라우저 번들에 포함되므로 비밀키를 넣지 않는다. 변경 후 새 빌드/배포가 필요하다.
4. [vercel.json](vercel.json)의 `/index.html` rewrite는 `/trainees` 같은 SPA 직접 접속을 처리한다. `VITE_API_BASE_URL`을 빼고 별도 프론트 도메인으로 배포하면 `/api` 호출도 프론트 프로젝트로 향해 정상 API 응답을 받을 수 없다.
5. 백엔드가 프론트 도메인을 CORS로 허용하고 접근 가능한 상태에서 페이지의 기수 목록과 한 개의 읽기 화면을 확인한다. 프론트 프로젝트에는 DB 연결 문자열이나 LMS 로그인 값을 설정할 필요가 없다.

각 저장소를 별도 Git으로 관리하더라도 프론트 배포는 **백엔드 API 계약 및 배포 주소**에 의존한다. 엔드포인트/응답 변경은 두 저장소의 변경 내용을 함께 검토하고 배포 순서를 맞춘다.

## 스타일과 수정 지점

초기 테마는 [main.jsx](src/main.jsx)가 `localStorage['codyssey-theme']`를 읽어 `html[data-theme]`에 설정한다. [Topbar.jsx](src/components/Topbar.jsx)의 전환 버튼은 이 속성, `color-scheme`, 브라우저 `theme-color`, localStorage를 갱신한다. 공통 색상·배경·버튼·차트 변수는 [src/styles/index.css](src/styles/index.css)의 `:root`(다크)와 `html[data-theme="light"]`(라이트)에 있다. 라이트 배경 기본값은 `#fcfcfc`다. 화면 구조·간격은 각 `src/pages/화면명.css` 또는 `src/components/컴포넌트명.css`에서 수정한다. JSX에 인라인 Tailwind 조합을 집중시키지 않고 컴포넌트별 CSS도 사용한다.

| 변경하려는 것 | 먼저 볼 곳 |
| --- | --- |
| 새 메뉴/페이지 | [App.jsx](src/App.jsx)의 Route, [Topbar.jsx](src/components/Topbar.jsx)의 NavLink, 새 `src/pages/*.jsx`와 CSS |
| 기수 전역 선택·검색·테마 | [Topbar.jsx](src/components/Topbar.jsx), [GlobalContext.jsx](src/context/GlobalContext.jsx), [index.css](src/styles/index.css) |
| API URL·요청 규약 | [axios.js](src/api/axios.js), 관련 `src/api/*.js`, 백엔드 라우터 계약 |
| 단계별 완료 인원 계산 표시 | [MissionProgressByLevel.jsx](src/components/MissionProgressByLevel.jsx)와 [Dashboard.jsx](src/pages/Dashboard.jsx); 미션 완료 원천 계산은 백엔드 |
| 전담팀 진도·정체·기록 | [FacilitatorTeams.jsx](src/pages/FacilitatorTeams.jsx), [TeamDetail.jsx](src/pages/TeamDetail.jsx), [PeriodProgressSection.jsx](src/components/PeriodProgressSection.jsx) |
| 팀 메모·전화·긴급 공지 통합 표시 | [TeamMemos.jsx](src/pages/TeamMemos.jsx)와 각 API 래퍼. 공지 자체 작성은 [Dashboard.jsx](src/pages/Dashboard.jsx) |
| 달력·참석 명단 | [Schedule.jsx](src/pages/Schedule.jsx), [schedules.js](src/api/schedules.js) |

## 현재 구현의 경계

- 사용자 로그인·역할별 버튼 권한을 이 프론트에서 구현하지 않았다. 데이터 접근 권한은 배포 및 백엔드 정책과 별도로 확인해야 한다.
- 기수 선택은 브라우저 새로고침 시 다시 기본 ID에서 시작한다. 테마만 localStorage로 유지한다.
- 화면의 검색·대부분 필터는 이미 받은 기수 데이터에 적용된다. 교육생이 늘면 요청량과 화면 계산 비용을 다시 검토해야 한다.
- `/team-memos`는 여섯 API를 `Promise.all`로 읽으므로 하나가 실패하면 통합 피드 로딩이 실패한다. `/facilitator-teams`와 `/projects`는 각각 일부 요청 실패를 허용한다.
- 팀 상세는 60초 간격 및 탭 복귀 시 재조회하지만 다른 화면은 주로 기수 변경·작업 성공 시 조회한다. 푸시 실시간 갱신은 아니다.
- 단계별/기간별 진도, 수료 판정, 미션 완료일, 프로젝트 상태의 신뢰할 원천은 백엔드와 LMS 수집 결과다. 프론트에서 계산한 비율·정체일은 그 응답을 표시하기 위한 값이다.
