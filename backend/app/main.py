from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.migrations import initialize_schema
from app.crawl_scheduler import start_scheduler, scheduler
from app.routers import cohorts, trainees, teams, dashboard, schedules, cron

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Serverless requests must not run DDL or compatibility migrations.
    # Initialize the target database once as a deployment step instead.
    on_vercel = os.getenv('VERCEL', '').lower() in {'1', 'true', 'yes', 'on'}
    if not on_vercel:
        initialize_schema()
    scheduler_setting = os.getenv('ENABLE_SCHEDULER')
    scheduler_enabled = not on_vercel and (
        scheduler_setting.lower() in {'1', 'true', 'yes', 'on'}
        if scheduler_setting is not None
        else True
    )
    if scheduler_enabled:
        start_scheduler()
    logger.info('Codyssey API started')
    try:
        yield
    finally:
        if scheduler.running:
            scheduler.shutdown(wait=False)
        logger.info('Codyssey API stopped')


app = FastAPI(title='교육생 관리 LMS API', lifespan=lifespan)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        'CORS_ORIGINS',
        'http://localhost:5173,http://127.0.0.1:5173',
    ).split(',')
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allow_headers=['Content-Type', 'Authorization'],
)


@app.get('/')
def read_root():
    return {'status': 'ok', 'message': 'Codyssey API is running'}


app.include_router(cohorts.router, prefix='/api/cohorts', tags=['Cohorts'])
app.include_router(trainees.router, prefix='/api/trainees', tags=['Trainees'])
app.include_router(teams.router, prefix='/api/teams', tags=['Teams'])
app.include_router(dashboard.router, prefix='/api/dashboard', tags=['Dashboard'])
app.include_router(schedules.router, prefix='/api/schedules', tags=['Schedules'])
app.include_router(cron.router, prefix='/api/cron', tags=['Cron'])
