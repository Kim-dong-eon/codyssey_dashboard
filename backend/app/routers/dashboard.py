from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import Optional
from pydantic import BaseModel
from app import models
from app.database import get_db

router = APIRouter(
    prefix="/api/dashboard",
    tags=["Dashboard"]
)

@router.get("/{cohort_id}")
def get_dashboard_data(cohort_id: int, db: Session = Depends(get_db)):
    trainees = db.query(models.Trainee).filter(
        models.Trainee.cohort_id == cohort_id,
        models.Trainee.is_dropped == False
    ).all()

    # 🚨 신규: 팀 번호(48) 대신 진짜 조 이름(김재은 퍼실님)을 찾기 위한 딕셔너리 생성
    teams = db.query(models.Team).filter(models.Team.cohort_id == cohort_id).all()
    team_dict = {team.team_id: team.team_name for team in teams}

    trainee_ids = [t.trainee_id for t in trainees]
    progress_logs = []
    if trainee_ids:
        progress_logs = db.query(models.ProgressLog).filter(
            models.ProgressLog.trainee_id.in_(trainee_ids)
        ).all()

    level_targets = {1: 3, 2: 3, 3: 2}
    trainee_list = []
    
    for t in trainees:
        current_log = next((log for log in progress_logs if log.trainee_id == t.trainee_id and log.level == t.current_level), None)
        done_tasks = getattr(t, 'personal_tasks_done', 0)
        opt_done = 0
        
        if current_log:
            log_dict = current_log.__dict__
            if 'personal_tasks_done' in log_dict:
                done_tasks = log_dict['personal_tasks_done']
            opt_done = log_dict.get('is_team_project_done', 0)
        else:
            opt_done = 0

        trainee_list.append({
            "id": t.trainee_id,
            "name": t.name,
            # 🚨 핵심 수정: t.team_id를 이용해 team_dict에서 진짜 팀 이름을 가져옴!
            "team": team_dict.get(t.team_id, "미배정") if t.team_id else "미배정", 
            "level": t.current_level,
            "done": done_tasks,
            "target": level_targets.get(t.current_level, 3),
            "optional_task_done": int(opt_done),
            "requires_attention": getattr(t, 'requires_attention', False),
            "is_tech_linked": getattr(t, 'is_tech_linked', False)
        })

    today = date.today()
    recent_dates = [today - timedelta(days=i) for i in range(6, -1, -1)]
    chart_data = []
    
    for d in recent_dates:
        l1_cnt = l2_cnt = l3_cnt = 0
        for t in trainees:
            passed_levels = []
            for log in progress_logs:
                if log.trainee_id == t.trainee_id:
                    log_dict = log.__dict__
                    date_val = log_dict.get('passed_date') or log_dict.get('last_updated')
                    if date_val and date_val.date() <= d:
                        passed_levels.append(log.level)
                        
            hist_level = max(passed_levels) if passed_levels else 1
            if d == today:
                hist_level = t.current_level
            else:
                hist_level = min(hist_level, t.current_level)
            
            if hist_level == 1: l1_cnt += 1
            elif hist_level == 2: l2_cnt += 1
            elif hist_level >= 3: l3_cnt += 1
                
        chart_data.append({
            "date": d.strftime("%m/%d"),
            "level1": l1_cnt,
            "level2": l2_cnt,
            "level3": l3_cnt
        })

    return {
        "trainees": trainee_list,
        "chartData": chart_data,
        "grassData": [] 
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
    return {"message": "등록 완료"}

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