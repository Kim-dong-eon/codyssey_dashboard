from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from typing import Optional
from pydantic import BaseModel
from app import models
from app.database import get_db
from app.services.progress_state import DONE_STATUSES, build_progress_state_map, load_progress_logs

router = APIRouter()
KST = ZoneInfo("Asia/Seoul")

@router.get("/{cohort_id}")
def get_dashboard_data(
    cohort_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    team_id: Optional[int] = None,
    roster_only: bool = False,
    db: Session = Depends(get_db),
):
    today = datetime.now(KST).date()
    end_day = end_date or today
    start_day = start_date or end_day - timedelta(days=6)
    if start_day > end_day:
        raise HTTPException(status_code=422, detail="시작일은 종료일보다 늦을 수 없습니다.")

    # Join the cohort roster to its current team and normalized facilitator flags.
    roster_rows = (
        db.query(
            models.Trainee,
            models.Team.team_name,
            models.TraineeFlag.requires_attention,
            models.TraineeFlag.is_tech_linked,
        )
        .outerjoin(models.Team, models.Team.team_id == models.Trainee.team_id)
        .outerjoin(models.TraineeFlag, models.TraineeFlag.trainee_id == models.Trainee.trainee_id)
        .filter(models.Trainee.cohort_id == cohort_id)
        .order_by(models.Trainee.name.asc())
        .all()
    )
    if team_id is not None:
        roster_rows = [row for row in roster_rows if row[0].team_id == team_id]
    scoped_trainee_ids = {row[0].trainee_id for row in roster_rows}
    progress_logs = load_progress_logs(
        db, cohort_id, scoped_trainee_ids if team_id is not None else None
    )
    current_states = build_progress_state_map(progress_logs)
    last_progress_by_trainee = {}
    for log in progress_logs:
        if (
            log.mission_type not in {"personal", "team"}
            or not log.mission_label
            or not log.completed_at
            or (log.status or "").strip().replace(" ", "").lower() not in DONE_STATUSES
        ):
            continue
        previous = last_progress_by_trainee.get(log.trainee_id)
        if previous is None or log.completed_at > previous:
            last_progress_by_trainee[log.trainee_id] = log.completed_at
    current_rows = [row for row in roster_rows if not row[0].is_dropped]
    trainee_list = [
        {
            "id": trainee.trainee_id,
            "name": trainee.name,
            "team_id": trainee.team_id,
            "team": team_name or "미배정",
            "level": current_states.get(trainee.trainee_id, {}).get("current_level", 1),
            "done": current_states.get(trainee.trainee_id, {}).get("personal_tasks_done", 0),
            "target": current_states.get(trainee.trainee_id, {}).get("target", 3),
            "optional_task_done": int(bool(current_states.get(trainee.trainee_id, {}).get("is_team_project_done"))),
            "is_dropped": trainee.is_dropped,
            "drop_date": trainee.drop_date,
            "is_completed": bool(current_states.get(trainee.trainee_id, {}).get("is_completed")),
            "requires_attention": bool(requires_attention),
            "is_tech_linked": bool(is_tech_linked),
            "last_progress_at": last_progress_by_trainee.get(trainee.trainee_id),
        }
        for trainee, team_name, requires_attention, is_tech_linked in current_rows
    ]
    if roster_only:
        return {
            "trainees": trainee_list,
            "missionProgressByTrainee": [],
            "chartData": [],
            "historyAvailable": False,
            "historyMode": "none",
            "range": {"start_date": start_day.isoformat(), "end_date": end_day.isoformat()},
        }
    roster_trainee_ids = {row[0].trainee_id for row in roster_rows}
    mission_progress_by_trainee = [
        {
            "trainee_id": log.trainee_id,
            "level": log.level,
            "mission_type": log.mission_type,
            "mission_label": log.mission_label,
            "is_completed": (log.status or "").strip().replace(" ", "").lower()
            in {"미션완료", "완료", "completed", "complete"},
            "completed_at": log.completed_at,
        }
        for log in progress_logs
        if log.trainee_id in roster_trainee_ids
        and log.mission_label and log.mission_type in {"personal", "team"}
    ]

    end_cutoff = datetime.combine(end_day, time.max)
    chart_data = []
    legacy_history_available = any(
        (log.completed_at is not None and log.completed_at <= end_cutoff)
        or (log.passed_date is not None and log.passed_date <= end_cutoff)
        or (log.last_updated is not None and log.last_updated <= end_cutoff)
        for log in progress_logs
    )
    has_mission_dates = any(log.mission_label and log.completed_at for log in progress_logs)
    historical_data_available = has_mission_dates or legacy_history_available
    history_mode = "crawl_missions" if has_mission_dates else "legacy_logs" if legacy_history_available else "none"
    display_levels = sorted({log.level for log in progress_logs if log.level is not None}) or [1, 2, 3]
    day_count = (end_day - start_day).days + 1
    for day_offset in range(day_count):
        point_day = start_day + timedelta(days=day_offset)
        if not historical_data_available and point_day < today:
            chart_data.append({
                "date": point_day.strftime("%m/%d"),
                "fullDate": point_day.isoformat(),
                "level1": None,
                "level2": None,
                "level3": None,
                "tasksDone": None,
                "projectDone": None,
                "completed": None,
                "dropped": None,
            })
            continue
        cutoff = datetime.combine(point_day, time.max)
        counts = {level: 0 for level in display_levels}
        tasks_done = 0
        project_done = 0
        completed = 0
        dropped = 0
        state_by_trainee = build_progress_state_map(progress_logs, as_of=cutoff)

        for trainee, _, _, _ in roster_rows:
            state = state_by_trainee.get(trainee.trainee_id, {})
            level = state.get("current_level", 1)
            done = state.get("personal_tasks_done", 0)
            did_project = state.get("is_team_project_done", False)
            is_completed = state.get("is_completed", False)
            is_dropped = bool(trainee.drop_date and trainee.drop_date <= point_day)
            if trainee.is_dropped and trainee.drop_date is None:
                is_dropped = point_day >= today
            if is_dropped:
                dropped += 1
                continue
            counts[level] = counts.get(level, 0) + 1
            tasks_done += int(done or 0)
            project_done += int(bool(did_project))
            completed += int(bool(is_completed))

        chart_data.append({
            "date": point_day.strftime("%m/%d"),
            "fullDate": point_day.isoformat(),
            **{f"level{level}": counts.get(level, 0) for level in display_levels},
            "tasksDone": tasks_done,
            "projectDone": project_done,
            "completed": completed,
            "dropped": dropped,
        })

    return {
        "trainees": trainee_list,
        "missionProgressByTrainee": mission_progress_by_trainee,
        "chartData": chart_data,
        "historyAvailable": historical_data_available,
        "historyMode": history_mode,
        "range": {"start_date": start_day.isoformat(), "end_date": end_day.isoformat()},
    }

# ==========================================
# 2. 공지사항 관련 API (상단고정, 상태변경 추가)
# ==========================================
class NoticeCreateRequest(BaseModel):
    content: str
    category: str = "일반"
    author: str = "퍼실리테이터"

class NoticeUpdateRequest(BaseModel):
    is_pinned: Optional[bool] = None
    status: Optional[str] = None

@router.get("/{cohort_id}/notices")
def get_notices(cohort_id: int, db: Session = Depends(get_db)):
    # 🚨 상단 고정(is_pinned)된 항목을 최상단으로 정렬하여 내려줍니다.
    notices = db.query(models.Notice).filter(
        models.Notice.cohort_id == cohort_id
    ).order_by(
        models.Notice.is_pinned.desc(), 
        models.Notice.created_at.desc()
    ).all()
    return notices

@router.post("/{cohort_id}/notices")
def create_notice(cohort_id: int, req: NoticeCreateRequest, db: Session = Depends(get_db)):
    new_notice = models.Notice(cohort_id=cohort_id, content=req.content, category=req.category)
    db.add(new_notice)
    db.commit()
    db.refresh(new_notice)
    return {
        "message": "등록 완료",
        "notice_id": new_notice.notice_id,
        "created_at": new_notice.created_at,
    }

@router.put("/notices/{notice_id}")
def update_notice(notice_id: int, req: NoticeUpdateRequest, db: Session = Depends(get_db)):
    notice = db.query(models.Notice).filter(models.Notice.notice_id == notice_id).first()
    if not notice: raise HTTPException(status_code=404)
    
    if req.is_pinned != None: notice.is_pinned = req.is_pinned
    if req.status is not None: notice.status = req.status
    
    db.commit()
    return {"message": "업데이트 완료"}

@router.delete("/notices/{notice_id}")
def delete_notice(notice_id: int, db: Session = Depends(get_db)):
    notice = db.query(models.Notice).filter(models.Notice.notice_id == notice_id).first()
    if not notice: raise HTTPException(status_code=404)
    db.delete(notice)
    db.commit()
    return {"message": "삭제 완료"}
