from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging
from pytz import timezone

# Run the saved cohort-aware crawl.py implementation.
from app.services.crawl import run_all_crawling_and_sync

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def daily_update_job():
    """Run the cohort-aware crawler that stores mission completion dates."""
    logger.info("⏰ 아침 9시 스케줄러: 기수별 미션 크롤링 및 DB 동기화 시작")
    try:
        run_all_crawling_and_sync()
        logger.info("✅ 기수별 미션 크롤링 및 DB 동기화 종료")
    except Exception as e:
        logger.exception("❌ 기수별 크롤링 실패: %s", e)
        raise

# 스케줄러 객체 생성
scheduler = BackgroundScheduler()

def start_scheduler():
    """
    FastAPI가 켜질 때 스케줄러를 시작하는 함수
    """
    if scheduler.running:
        return

    # 서버 시간대에 관계없이 한국 시간으로 실행합니다.
    kst_tz = timezone('Asia/Seoul')
    
    scheduler.add_job(
        daily_update_job,
        trigger=CronTrigger(hour=9, minute=00, timezone=kst_tz),
        id="daily_morning_sync",
        replace_existing=True
    )
    scheduler.start()
    logger.info("⏱️ 백그라운드 스케줄러가 시작되었습니다. (매일 09:00 KST 업데이트 대기 중)")
