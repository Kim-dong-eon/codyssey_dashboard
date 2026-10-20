# Vercel 배포 및 초기 데이터 이관

이 문서는 백엔드를 별도 Vercel 프로젝트로 배포할 때의 절차입니다. Vercel 프로젝트의 **Root Directory를 `backend`**로 지정합니다. `index.py`가 FastAPI 앱을 노출하고, `vercel.json`이 매일 **09:00 KST(00:00 UTC)** `/api/cron/crawl`을 호출합니다. 프론트엔드는 Root Directory `frontend`의 별도 프로젝트로 배포하고 `VITE_API_BASE_URL=https://<백엔드 도메인>/api`를 빌드 환경 변수로 설정합니다. `frontend/vercel.json`은 React Router의 직접 접속 경로를 `index.html`로 연결합니다.

## Vercel에 올릴 파일과 초기 데이터

GitHub에는 애플리케이션 코드와 배포 설정만 푸시합니다. 백엔드의 `index.py`, `vercel.json`, `requirements.txt`, `app/migrations.py`, `app/trainee_transfer.py`와 나머지 앱 코드, 프론트엔드 코드가 여기에 해당합니다. `backend/.env`, `backend/private_exports/`의 roster JSON과 전체 DB 스냅샷은 **GitHub나 Vercel 함수 번들에 넣지 않습니다**.

대상 DB는 Vercel 밖의 지속성 있는 DB로 준비하고 연결 주소를 Vercel의 `DATABASE_URL` 환경 변수에 설정합니다. 초기 데이터는 로컬 컴퓨터에서 `TARGET_DATABASE_URL`로 그 대상 DB에 직접 연결해 **한 번 이관**합니다. 이때 이관할 데이터는 교육생 155명과 외래 키에 필요한 기수 2건·팀 5건뿐입니다. JSON 파일 자체를 Vercel에 업로드하는 절차는 없습니다.

## 실행 경로

- `app/services/crawl_config.py`: 기수별 미션 번호와 활성화 설정
- `app/services/crawl_client.py`: 로그인과 HTTP 요청
- `app/services/crawl_parser.py`: HTML → 팀/개인 미션 결과
- `app/services/crawl.py`: 기수별 수집 실행. 모든 미션 수집에 성공한 기수만 저장
- `app/services/crawl_persistence.py`: 교육생 이메일 매칭 및 기수당 한 트랜잭션의 DB 저장
- `app/routers/cron.py`: `CRON_SECRET` Bearer 인증 후 크롤러 호출. `?cohort_id=1`로 한 기수만 수동 실행 가능

`temp_data`/`sync_service.py`는 현재 Cron 경로에서 사용하지 않습니다. 파일을 거치지 않고 DB에 반영하므로 요청 실행 중 DB 연결을 오래 점유하지 않습니다. Vercel에서는 API 시작 시 스키마를 수정하거나 APScheduler를 시작하지 않습니다.

미션 페이지에서 목록 영역만 보이고 팀/교육생 행이 하나도 없으면 파서가 수집 실패로 처리합니다. 로그인 만료나 HTML 구조 변경을 빈 진도로 오인해 성공 처리하지 않기 위해서입니다. **정말로 빈 목록이 정상인 미션**만 `crawl_config.py`의 해당 항목에 `"allow_empty": True`를 명시합니다. 1기에서 현재 설정된 15개 미션은 모두 빈 목록을 오류로 처리합니다.

## 환경 변수

백엔드 Production 환경에 `DATABASE_URL`, `CODYSSEY_ID`, `CODYSSEY_PW`, `CRON_SECRET`, `CORS_ORIGINS`를 설정합니다. `CRON_SECRET`은 긴 무작위 값으로 지정합니다. `DATABASE_URL`은 지속성 있는 외부 DB의 SQLAlchemy URL이어야 합니다. MySQL은 `mysql+pymysql://...`, Postgres는 `postgresql://...` 또는 `postgresql+psycopg://...` 형식을 지원합니다. Vercel의 DB 연동이 다른 이름의 URL 변수를 제공하면 `DATABASE_URL`에도 연결합니다. `CORS_ORIGINS`에는 프론트엔드의 정확한 `https://...vercel.app` 출처를 넣습니다. `ENABLE_SCHEDULER`는 설정하지 않거나 `false`로 둡니다.

Vercel의 로컬 파일 시스템을 DB로 사용하지 마세요. `DATABASE_URL`이 빠지면 Vercel 앱은 시작 오류를 내도록 구성했습니다.

로컬 CLI 배포 시 `backend/.vercelignore`가 `.env`, `private_exports`, 로컬 DB, `venv`, 임시 데이터와 테스트를 업로드 대상에서 제외합니다. Git 기반 배포에서는 `.gitignore`와 Git 추적 상태도 함께 확인하세요. 실제 배포 전 `git ls-files backend/.env backend/private_exports backend/venv backend/codyssey.db`가 빈 결과인지 점검합니다.

## 첫 배포 전 DB 준비

다음 명령은 프로젝트의 Python 3.12 환경에서 **로컬 컴퓨터에서 한 번** 실행합니다. 대상 DB는 새로 만든 빈 DB여야 합니다. 자격 증명이나 출력 JSON은 Git에 올리지 마세요.

```powershell
cd C:\codyssey\backend
$env:DATABASE_URL = '<새 DB의 연결 URL>'
python -m app.migrations
```

위 명령은 빈 DB 테이블과 인덱스를 생성합니다. 기존 운영 DB에 실행할 때는 호환 마이그레이션이 포함되므로 별도 백업이 필요합니다.

교육생 이관 도구는 **기수, 팀, 교육생만** 복사하고 원래 ID를 유지합니다. 관심/학습지원 상태 플래그, 진도 기록, 메모, 공지, 일정, 전화 기록 등은 이 도구의 범위에 들어가지 않습니다. 플래그가 없는 교육생은 기본값 `false`로 표시되고, 이후 앱에서 상태를 수정하면 해당 플래그 행이 생성됩니다. 초기 진도는 배포 후 Cron 크롤링으로 채웁니다. 다른 운영 기록을 옮겨야 한다면 별도 이관이 필요합니다.

```powershell
cd C:\codyssey\backend
$env:SOURCE_DATABASE_URL = '<기존 DB의 연결 URL>'
python -m app.trainee_transfer export --output C:\private\codyssey-roster.json

$env:TARGET_DATABASE_URL = '<새 DB의 연결 URL>'
python -m app.trainee_transfer import --input C:\private\codyssey-roster.json
# 출력된 추가 건수와 대상 DB를 확인한 다음에만 실제 반영:
python -m app.trainee_transfer import --input C:\private\codyssey-roster.json --apply
```

기존 DB가 `backend/.env`의 `DATABASE_URL`로 이미 설정되어 있다면 `SOURCE_DATABASE_URL`을 다시 입력하지 않고 `python -m app.trainee_transfer export --local --output <보호된 경로>`를 사용할 수 있습니다.

기본 import는 미리보기이며 `--apply`가 있어야 기록합니다. 동일 ID와 이메일이 이미 있으면 중복으로 추가하지 않고, 충돌이 있으면 오류를 냅니다. 기존 행의 값은 덮어쓰지 않습니다. JSON에는 개인정보가 포함됩니다. 별도 보호된 경로에서 다루고 이관 후 보관 정책에 맞춰 처리하세요.

PostgreSQL 대상에서는 원래 ID를 지정해 넣은 뒤 기수·팀·교육생의 자동 증가 시퀀스를 현재 최대 ID 이상으로 맞춥니다. 이관은 서비스의 새 DB에서 쓰기 요청을 받기 전에 실행하세요. 이관 후 새 기수·팀·교육생을 하나씩 등록해 ID 충돌이 없는지 배포 QA에서 확인합니다. 이관 명령은 추가 건수만 출력하며 교육생의 이름·연락처·이메일을 출력하지 않습니다.

### 현재 로컬 DB에서 추출한 파일 (2026-10-20)

Vercel 대상 DB에 적용할 파일은 `backend/private_exports/roster-trainees-2026-10-20.json`입니다. 기수 2건, 팀 5건, 교육생 155건만 있으며 SHA-256은 `1E58FCB436432EA4C553C6D75E29C6758B0EC9D1EF19A489EFB33C3C85AD7C3E`입니다. 기존 로컬 추출본에서 플래그를 제외해 만들었습니다. 새 빈 SQLite DB에 미리보기·반영·재반영(추가 0건)을 확인했습니다. 이 파일은 Git에서 제외되며, **아직 Vercel 대상 DB에는 반영하지 않았습니다.**

기수의 **기한은 `cohorts.end_date`**입니다. 추출 당시 기수 ID 1과 ID 2 모두 시작일 `2026-10-01`, 기한 `2026-12-31`로 저장되어 있으며, 이 날짜들은 `roster` JSON의 각 기수 항목에도 들어 있습니다.

이전의 `roster-2026-10-20.json`에는 상태 플래그도 있지만 새 이관 코드는 그 구버전 파일을 읽더라도 플래그를 반영하지 않습니다. `backend/private_exports/database-2026-10-20.json`은 14개 테이블, 총 1,448행의 별도 보관용 스냅샷이며 자동 복원 도구가 아닙니다. 두 기존 파일도 Git에서 제외하고 초기 교육생 이관에는 사용하지 않습니다.

## 배포 QA

1. Vercel 백엔드 프로젝트의 Root Directory가 `backend`인지, Production 환경 변수가 모두 지정됐는지 확인합니다.
2. 배포 후 `/`가 `status: ok`를 반환하고 `/api/cohorts/`에서 이관한 기수가 조회되는지 확인합니다.
3. 인증이 없는 `/api/cron/crawl` 호출이 401인지 확인합니다. `CRON_SECRET` 누락은 503입니다.
4. 첫 Cron 실행 전 교육생 수와 팀 배정 수를 확인합니다. 첫 크롤링 후 미션별 진도와 마지막 업데이트 시간이 생겼는지 확인합니다.
5. Vercel Cron은 Production 배포에서만 실행됩니다. 수집 실패는 HTTP 500과 함수 로그에 남으며, 실패한 기수의 결과는 DB에 반영하지 않습니다. 현재 한 기수 실행이 함수 시간 제한을 넘으면 미션 단위 작업 분할이 필요합니다.

현재 1기 설정은 팀 7개와 개인 8개, 총 15개 페이지를 순차 요청합니다. 요청당 15초 제한에 로그인 재시도와 DB 저장 시간이 추가될 수 있습니다. [Vercel 함수 실행 시간](https://vercel.com/docs/functions/configuring-functions/duration)은 프로젝트 설정과 요금제에 따라 제한되며, [Cron은 실패한 호출을 자동 재시도하지 않습니다](https://vercel.com/docs/cron-jobs/manage-cron-jobs). 실제 배포 후 함수 실행 시간을 확인하고 제한에 가까워지면 기수별 또는 미션 묶음별 Cron으로 나누어야 합니다. 여러 호출이 겹칠 수 있으므로 분할 시에는 DB 잠금과 중복 실행 방지도 함께 구현합니다.

현재 일반 API에는 사용자 인증이 없습니다. 교육생 개인정보가 있는 서비스를 공개 도메인으로 운영하기 전에는 앱 로그인/인가 또는 프로젝트 접근 보호를 적용해야 합니다. `CORS_ORIGINS`는 브라우저 출처 설정일 뿐 API 접근 권한을 대신하지 않습니다.

이 저장소만으로 Vercel 프로젝트·DB를 자동으로 만들거나 기존 운영 DB의 실제 데이터를 업로드할 수는 없습니다. 이관 명령은 대상 DB 연결 정보가 준비된 뒤 실행합니다.
