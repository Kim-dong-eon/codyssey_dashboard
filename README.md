# Codyssey 교육생 관리 대시보드

기수별 교육생·전담팀·미션 진도·팀 프로젝트를 관리하는 React/FastAPI 애플리케이션입니다. 외부 LMS의 미션 현황은 정기 크롤링으로 가져오고, 상담·메모·팀 전화·공지·일정은 관리 DB에 저장합니다.

## 문서 안내

- [기술 명세서](docs/TECHNICAL_SPEC.md): 전체 아키텍처, 화면과 API 흐름, 14개 DB 테이블, 크롤링·진도 계산·초기 이관·배포 경계를 다이어그램과 함께 설명합니다. 처음 참여한 개발자는 여기부터 읽으세요.
- [백엔드 구조 메모](backend/ARCHITECTURE.md): 크롤링과 DB 반영 코드의 책임을 짧게 정리합니다.
- [Vercel 배포 및 초기 이관](backend/VERCEL_DEPLOY.md): 두 Vercel 프로젝트, 환경 변수, 대상 DB 준비와 비공개 교육생 자료 이관 절차입니다.

## 로컬 실행

백엔드와 프론트엔드를 각각 실행합니다. 백엔드는 `DATABASE_URL`이 없으면 로컬 SQLite를 사용합니다. 크롤링 예약 실행이 필요 없는 개발 환경에서는 다음처럼 스케줄러를 끕니다.

~~~powershell
cd backend
$env:ENABLE_SCHEDULER = 'false'
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
~~~

다른 터미널에서 프론트엔드를 실행합니다. 개발 서버의 `/api` 요청은 기본적으로 `http://localhost:8000`으로 전달됩니다.

~~~powershell
cd frontend
npm ci
npm run dev
~~~

교육생 이관 JSON에는 개인정보가 들어 있습니다. `backend/private_exports/`의 파일과 `.env`, 로컬 DB는 Git 또는 Vercel 함수 번들에 넣지 않습니다.
