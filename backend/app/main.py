from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import engine, Base
from app.crawl_scheduler import start_scheduler, scheduler
from app.routers import cohorts, trainees, teams, dashboard, schedules

# DB 테이블 자동 생성
Base.metadata.create_all(bind=engine)

# ==========================================
# 1. Lifespan (스케줄러 시작/종료) 먼저 정의
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 FastAPI 서버 시작 중...")
    start_scheduler()  # 스케줄러 가동
    
    yield  # 서버가 돌아가는 동안 대기
    
    print("🛑 FastAPI 서버 종료 중...")
    scheduler.shutdown() # 서버 종료 시 스케줄러도 종료

# ==========================================
# 2. FastAPI 앱 생성 (한 번만! lifespan도 여기서 연결)
# ==========================================
app = FastAPI(title='교육생 관리 LMS API', lifespan=lifespan)

# ==========================================
# 3. CORS 허용 설정
# ==========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 중에는 모든 프론트엔드 주소 허용
    allow_credentials=True,
    allow_methods=["*"],  # GET, POST, PUT, DELETE 모두 허용
    allow_headers=["*"],
)

# ==========================================
# 4. 라우터 등록 (이전에 백지화되던 부분 복구!)
# ==========================================
@app.get('/')
def read_root():
    return {'status': 'success', 'message': 'Backend Running!'}

app.include_router(cohorts.router)
app.include_router(trainees.router)
app.include_router(teams.router)
app.include_router(dashboard.router)
app.include_router(schedules.router)