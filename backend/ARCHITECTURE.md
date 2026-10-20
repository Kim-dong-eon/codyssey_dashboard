# 백엔드 구조와 DB 작업 메모

## 책임 구분

- `app/main.py`: FastAPI 앱, CORS, 수명 주기, 라우터 등록만 담당합니다.
- `app/migrations.py`: 테이블 생성과 기존 데이터 호환 마이그레이션을 담당합니다. 현재는 API 시작 시 `initialize_schema()`가 실행됩니다.
- `app/services/crawl.py`: 로그인, 미션 페이지 요청 및 파싱, 기수별 실행 순서를 담당합니다.
- `app/services/crawl_persistence.py`: 크롤링 결과와 교육생을 이메일로 매칭하고 진도·팀 프로젝트를 DB에 저장합니다. 기존 행을 기수당 한 번 읽어 반복 조회를 줄이며, 팀·개인 미션을 **기수당 한 트랜잭션**으로 커밋합니다.
- `app/services/progress_state.py`: 진도 기록에서 현재·과거 단계와 완료 수를 계산합니다. 교육생 상세 화면은 기수 전체 기록 대신 대상 교육생 기록과 기수별 미션 종류만 읽습니다.
- `/api/dashboard/{cohort_id}?roster_only=true`: 팀 편성·팀 상세·기술지원 화면에 필요한 명단과 최근 진도만 돌려줍니다. 기간별 차트와 개별 미션 목록 계산을 생략합니다. 대시보드 본화면은 기존 전체 응답을 사용합니다.

## 크롤링 결과 저장 경로

현재 경로는 `crawl.py`에서 미션을 수집·파싱한 뒤 메모리의 결과를 `CrawlPersistence`에 넘겨 DB에 저장합니다. 중간 JSON/CSV나 `temp_data`는 사용하지 않습니다. `crawl_persistence.py`가 현재 DB 동기화 담당입니다.

`app/services/sync_service.py`는 `temp_data`의 `team_native_*.json` 및 CSV를 읽던 이전 파일 기반 경로이며, 현재 크롤러나 스케줄러에서는 호출하지 않습니다. 이 코드는 팀 데이터의 기수를 1로 고정하고 개인 진도를 요약 행으로 저장하므로, 현재의 기수별·미션별 저장 경로에 그대로 연결하면 안 됩니다. 재처리용 JSON을 추가하더라도 DB 반영은 `CrawlPersistence` 한 곳에서 처리하도록 유지합니다.

## DB 변경 시 주의할 점

`DATABASE_URL`이 설정되면 해당 DB에 연결하고, 없으면 로컬 SQLite를 사용합니다. 실제 DB 연결 전에 환경 변수를 확인하세요. 기존 DB 호환 마이그레이션에는 오래된 테이블·컬럼을 옮긴 뒤 제거하는 단계가 있으므로, 신규 환경에 적용하기 전에는 백업과 스키마 확인이 필요합니다.

기존 DB에도 `teams(cohort_id, team_name)`, `trainees(cohort_id, team_id)`, `team_projects(cohort_id, team_id, level)` 조회 인덱스가 생성됩니다. 미션 행의 고유 인덱스는 기존 `migrate_crawl_progress_schema()`에서 관리합니다.

크롤링은 수집한 미션만 갱신합니다. 페이지 수집 실패로 빠진 미션의 기존 행은 삭제하지 않으며, 정상 수집한 미션을 저장한 뒤 전체 작업을 실패로 보고합니다. DB 저장 중 오류가 나면 해당 기수의 팀·개인 변경을 함께 롤백합니다. 스케줄러도 실패를 다시 던져 실행 결과에 오류가 남도록 합니다.

## 배포 전에 남은 작업

로컬 API 시작 시 스키마 초기화 및 호환 마이그레이션이 실행됩니다. Vercel에서는 이를 건너뛰고 `python -m app.migrations`를 배포 전 별도로 실행합니다. Cron 엔드포인트, DB 연결 설정 및 기수·팀·교육생 이관 도구의 상세 절차는 `VERCEL_DEPLOY.md`에 있습니다. 실제 원격 배포와 운영 DB 이관은 대상 프로젝트·DB 연결 정보가 준비된 뒤 진행합니다.

로컬 확인에는 실제 운영 DB 대신 `DATABASE_URL=sqlite:///:memory:`와 `ENABLE_SCHEDULER=false`를 사용했습니다. 파이썬 컴파일, 스키마 재초기화, 크롤링 결과 재저장, 교육생 상세·대시보드, 일괄 등록 경로를 확인했습니다.
