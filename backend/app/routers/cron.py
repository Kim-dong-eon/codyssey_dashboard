"""Authenticated entry point for Vercel Cron and manual scheduled runs."""

import logging
import os
import secrets

from fastapi import APIRouter, Header, HTTPException, Query

from app.services.crawl import run_all_crawling_and_sync


router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/crawl")
def crawl_missions(
    authorization: str | None = Header(default=None),
    cohort_id: int | None = Query(default=None, ge=1),
):
    secret = os.getenv("CRON_SECRET", "")
    if not secret:
        raise HTTPException(status_code=503, detail="Cron secret is not configured")
    if not authorization or not secrets.compare_digest(authorization, f"Bearer {secret}"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        return run_all_crawling_and_sync(cohort_id=cohort_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception:
        logger.exception("Scheduled mission crawl failed")
        raise HTTPException(status_code=500, detail="Scheduled crawl failed")
