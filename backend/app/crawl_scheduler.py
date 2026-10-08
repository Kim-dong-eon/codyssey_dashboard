from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging
from pytz import timezone

# 🚨 실제 crawl.py와 sync_service.py에 있는 진짜 함수들을 임포트합니다.
from app.services.crawl import clear_temp_files, make_session, run_team, download_progress
from app.services.sync_service import sync_team_json_to_db, sync_progress_csv_to_db
from app.database import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def daily_update_job():
    """
    매일 아침 9시에 실행될 실제 작업 (크롤링 -> 데이터 전처리 -> DB 업데이트)
    """
    logger.info("⏰ 아침 9시 스케줄러 작동 시작: 크롤링 및 데이터 전처리 파이프라인 가동")
    
    # ==========================================
    # 1. 크롤링 파이프라인 (crawl.py 로직)
    # ==========================================
    try:
        logger.info("▶️ 1단계: 기존 임시 파일 삭제 및 크롤링 시작...")
        clear_temp_files()              # 찌꺼기 파일 청소
        session = make_session()        # 로그인 세션 생성
        run_team(session)               # 팀 현황 크롤링 (JSON 저장)
        download_progress(session)      # 개인 진도 크롤링 (CSV 저장)
        logger.info("✅ 1단계: 크롤링 완료 및 파일 임시 저장 성공")
        
    except Exception as e:
        logger.error(f"❌ 크롤링 단계 실패: {str(e)}")
        return # 크롤링이 실패하면 DB 동기화는 진행하지 않고 멈춥니다.

    # ==========================================
    # 2. DB 동기화 파이프라인 (sync_service.py 로직)
    # ==========================================
    db = SessionLocal()
    try:
        logger.info("▶️ 2단계: DB 동기화 및 전처리 시작...")
        
        team_result = sync_team_json_to_db(db)
        logger.info(f"✅ [JSON -> 팀플 DB] {team_result}")
        
        prog_result = sync_progress_csv_to_db(db)
        logger.info(f"✅ [CSV -> 개인진도 DB] {prog_result}")
        
        logger.info("🎉 스케줄러 전체 작업 성공적으로 완료!")
        
    except Exception as e:
        logger.error(f"❌ DB 동기화 실패: {str(e)}")
    finally:
        db.close() # 작업이 끝나면 DB 세션을 안전하게 닫아줍니다.

# 스케줄러 객체 생성
scheduler = BackgroundScheduler()

def start_scheduler():
    """
    FastAPI가 켜질 때 스케줄러를 시작하는 함수
    """
    # 서버 환경(클라우드 등)과 무관하게 '한국 시간(KST)'을 강제 지정합니다.
    kst_tz = timezone('Asia/Seoul')
    
    scheduler.add_job(
        daily_update_job,
        trigger=CronTrigger(hour=19, minute=50, timezone=kst_tz),
        id="daily_morning_sync",
        replace_existing=True
    )
    scheduler.start()
    logger.info("⏱️ 백그라운드 스케줄러가 시작되었습니다. (매일 09:00 KST 업데이트 대기 중)")