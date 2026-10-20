"""Collect mission pages and persist one cohort at a time."""

import random
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

# Keep the previous direct-file command working; module execution is preferred.
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.database import SessionLocal
from app.services.crawl_client import make_session, fetch_with_retry
from app.services.crawl_config import COHORT_CONFIGS
from app.services.crawl_parser import parse_team_mission, parse_personal_mission
from app.services.crawl_persistence import CrawlPersistence

KST = ZoneInfo("Asia/Seoul")


def log(message):
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] {message}", flush=True)


def collect_cohort(session, cohort_id, config):
    """Collect one cohort without opening a database transaction."""
    results = {"team": [], "personal": []}
    failures = []
    for mission_type, parser in (("team", parse_team_mission), ("personal", parse_personal_mission)):
        for idx, mission in enumerate(config.get(f"{mission_type}_missions", [])):
            if idx:
                time.sleep(random.uniform(0.3, 0.7))
            try:
                result = fetch_with_retry(session, mission, parser)
                results[mission_type].append(result)
                log(f"[{cohort_id}기 {mission_type} {mission['label']}] 수집 완료")
            except Exception as error:
                log(f"[{cohort_id}기 {mission_type} {mission['label']}] 수집 실패: {error}")
                failures.append(f"{cohort_id}기 {mission_type} {mission['label']}")
    return results, failures


def persist_cohort(cohort_id, results):
    """Write one complete snapshot in a single transaction."""
    with SessionLocal() as db:
        try:
            persistence = CrawlPersistence(db, cohort_id)
            team_count = persistence.save_team_results(results["team"])
            personal_count = persistence.save_personal_results(results["personal"])
            db.commit()
        except Exception:
            db.rollback()
            raise
    return {"cohort_id": cohort_id, "team_projects_changed": team_count,
            "personal_records_seen": personal_count}


def run_all_crawling_and_sync(cohort_id=None):
    """Run an authenticated crawl for all active cohorts or one requested cohort."""
    configs = {
        key: value for key, value in COHORT_CONFIGS.items()
        if value.get("active", True) and (cohort_id is None or key == cohort_id)
    }
    if not configs:
        raise ValueError(f"활성화된 기수를 찾을 수 없습니다: {cohort_id}")

    log("Codyssey 크롤링 및 DB 동기화 시작")
    session = make_session()
    summaries = []
    failures = []
    try:
        for current_id, config in configs.items():
            results, cohort_failures = collect_cohort(session, current_id, config)
            if cohort_failures:
                failures.extend(cohort_failures)
                log(f"[{current_id}기] 미션 수집 실패로 DB 반영 생략")
                continue
            summary = persist_cohort(current_id, results)
            summaries.append(summary)
            log(f"[{current_id}기] DB 반영 완료: {summary}")
        if failures:
            raise RuntimeError(f"{len(failures)}개 미션 수집 실패: {failures}")
        return {"cohorts": summaries}
    finally:
        session.close()


if __name__ == '__main__':
    run_all_crawling_and_sync()
