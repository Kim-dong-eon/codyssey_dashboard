from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app import models
from app.database import get_db

router = APIRouter(
    prefix="/api/trainees",
    tags=["Trainees"]
)

# --- Pydantic 스키마 ---
class TeamMoveRequest(BaseModel):
    to_team_id: Optional[int] = None
    note: Optional[str] = None 

class ContactLogRequest(BaseModel):
    contact_date: datetime
    contact_method: str
    topic: str
    content: str
    manager_name: str

class DropUpdateRequest(BaseModel):
    is_dropped: bool
    drop_date: Optional[datetime] = None
    drop_reason: Optional[str] = None

class TraineeCreateRequest(BaseModel):
    cohort_id: int
    name: str
    email: str
    phone: Optional[str] = None

# --- API 엔드포인트 ---
@router.get("/cohort/{cohort_id}")
def get_trainee_list(cohort_id: int, db: Session = Depends(get_db)):
    trainees = db.query(models.Trainee).filter(models.Trainee.cohort_id == cohort_id).all()
    teams = db.query(models.Team).filter(models.Team.cohort_id == cohort_id).all()
    team_dict = {team.team_id: team.team_name for team in teams}

    level_targets = {1: 3, 2: 3, 3: 2}
    result = []
    
    for t in trainees:
        result.append({
            "id": t.trainee_id,
            "name": t.name,
            "team_name": team_dict.get(t.team_id) if t.team_id else None,
            "level": t.current_level,
            "done": t.personal_tasks_done,
            "target": level_targets.get(t.current_level, 3),
            "is_completed": t.is_completed,
            "is_dropped": t.is_dropped,
            "phone": t.phone or "미입력",
            "email": t.email,
            "is_tech_linked": getattr(t, 'is_tech_linked', False),
            "requires_attention": getattr(t, 'requires_attention', False)
        })
    return result

@router.put("/{trainee_id}/team")
def update_trainee_team(trainee_id: int, req: TeamMoveRequest, db: Session = Depends(get_db)):
    trainee = db.query(models.Trainee).filter(models.Trainee.trainee_id == trainee_id).first()
    if not trainee:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    
    from_team_id = trainee.team_id
    if from_team_id != req.to_team_id:
        trainee.team_id = req.to_team_id
        move_log = models.TeamMoveLog(
            trainee_id=trainee_id,
            from_team_id=from_team_id,
            to_team_id=req.to_team_id,
            move_date=datetime.now(),
            note=req.note 
        )
        db.add(move_log)
        db.commit()
    return {"message": "조 이동 및 기록 저장 완료"}

@router.post("/{trainee_id}/contact")
def add_contact_log(trainee_id: int, req: ContactLogRequest, db: Session = Depends(get_db)):
    new_log = models.ContactLog(
        trainee_id=trainee_id,
        contact_date=req.contact_date,
        contact_method=req.contact_method,
        topic=req.topic,
        content=req.content,
        manager_name=req.manager_name
    )
    db.add(new_log)
    db.commit()
    return {"message": "연락 기록이 성공적으로 등록되었습니다."}

# ==========================================
# 🚨 완벽 수정: contact_id를 기반으로 한 상담 기록 삭제 API
# ==========================================
@router.delete("/contact/{contact_id}")
def delete_contact_log(contact_id: int, db: Session = Depends(get_db)):
    # 모델에 정의된 contact_id 컬럼을 기준으로 정확히 검색합니다.
    log = db.query(models.ContactLog).filter(models.ContactLog.contact_id == contact_id).first()
    
    if not log:
        raise HTTPException(status_code=404, detail="상담 기록을 찾을 수 없습니다.")
    
    db.delete(log)
    db.commit()
    return {"message": "상담 기록이 성공적으로 삭제되었습니다."}

@router.put("/{trainee_id}/drop")
def update_drop_status(trainee_id: int, req: DropUpdateRequest, db: Session = Depends(get_db)):
    trainee = db.query(models.Trainee).filter(models.Trainee.trainee_id == trainee_id).first()
    if not trainee:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    
    trainee.is_dropped = req.is_dropped
    trainee.drop_date = req.drop_date if req.is_dropped else None
    trainee.drop_reason = req.drop_reason if req.is_dropped else None
    
    db.commit()
    return {"message": "드랍 상태가 업데이트 되었습니다."}

@router.post("/")
def create_trainee(req: TraineeCreateRequest, db: Session = Depends(get_db)):
    new_trainee = models.Trainee(
        cohort_id=req.cohort_id,
        name=req.name,
        email=req.email,
        phone=req.phone,
        current_level=1,
        personal_tasks_done=0,
        is_completed=False,
        is_dropped=False
    )
    db.add(new_trainee)
    db.commit()
    return {"message": f"{req.name} 교육생 등록 완료"}

@router.get("/{trainee_id}/detail")
def get_trainee_detail(trainee_id: int, db: Session = Depends(get_db)):
    trainee = db.query(models.Trainee).filter(models.Trainee.trainee_id == trainee_id).first()
    if not trainee:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    
    logs = db.query(models.ContactLog).filter(
        models.ContactLog.trainee_id == trainee_id
    ).order_by(models.ContactLog.contact_date.desc()).all()
    
    progress_records = db.query(models.ProgressLog).filter(
        models.ProgressLog.trainee_id == trainee_id
    ).order_by(models.ProgressLog.last_updated.asc()).all()
    
    chart_data = [{"date": "시작", "level": 0}]
    actual_level = trainee.current_level
    actual_done = getattr(trainee, 'personal_tasks_done', 0)

    for p in progress_records:
        date_val = getattr(p, 'passed_date', None) or getattr(p, 'last_updated', None)
        if date_val:
            chart_data.append({
                "date": date_val.strftime("%m/%d"),
                "level": p.level
            })
        actual_level = max(actual_level, p.level)
        actual_done = max(actual_done, getattr(p, 'personal_tasks_done', 0))
            
    if len(chart_data) == 1:
        chart_data.append({"date": "현재", "level": actual_level})
        
    team_name = None
    if trainee.team_id:
        team = db.query(models.Team).filter(models.Team.team_id == trainee.team_id).first()
        if team:
            team_name = team.team_name

    trainee_data = {
        "id": trainee.trainee_id,
        "name": trainee.name,
        "email": trainee.email,
        "phone": getattr(trainee, 'phone', '미입력'),
        "team_id": trainee.team_id,
        "team_name": team_name,
        "is_dropped": getattr(trainee, 'is_dropped', False),
        "major": getattr(trainee, 'major', '미입력'),
        "education": getattr(trainee, 'education_level', '미입력'),
        "is_major": "전공" if getattr(trainee, 'is_major_related', 0) == 1 else "비전공",
        "is_employed": getattr(trainee, 'employment_status', '미입력'),
        "current_level": actual_level, 
        "personal_tasks_done": actual_done
    }

    return {
        "trainee": trainee_data, 
        "logs": logs, 
        "progress": chart_data
    }

class BulkAddTrainee(BaseModel):
    name: str
    email: str

class BulkCreateRequest(BaseModel):
    cohort_id: int
    team_id: Optional[int] = None
    trainees: List[BulkAddTrainee]

@router.post("/bulk")
def create_trainees_bulk(req: BulkCreateRequest, db: Session = Depends(get_db)):
    success_count = 0
    try:
        for t in req.trainees:
            existing = db.query(models.Trainee).filter(models.Trainee.email == t.email).first()
            if existing:
                existing.team_id = req.team_id
                success_count += 1
            else:
                new_trainee = models.Trainee(
                    cohort_id=req.cohort_id,
                    team_id=req.team_id,
                    name=t.name,
                    email=t.email,
                    phone="010-0000-0000",
                    current_level=1,
                    personal_tasks_done=0,
                    is_completed=False,
                    is_dropped=False
                )
                db.add(new_trainee)
                success_count += 1
        
        db.commit()
        return {"message": f"{success_count}명의 교육생이 성공적으로 반영되었습니다."}
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB 저장 오류: {str(e)}")

@router.get("/team-logs/{team_id}")
def get_team_transfer_logs(team_id: int, db: Session = Depends(get_db)):
    logs = db.query(models.TeamMoveLog).filter(
        (models.TeamMoveLog.from_team_id == team_id) | (models.TeamMoveLog.to_team_id == team_id)
    ).order_by(models.TeamMoveLog.move_date.desc()).all()
    
    result = []
    for log in logs:
        trainee = db.query(models.Trainee).filter(models.Trainee.trainee_id == log.trainee_id).first()
        from_team = db.query(models.Team).filter(models.Team.team_id == log.from_team_id).first()
        to_team = db.query(models.Team).filter(models.Team.team_id == log.to_team_id).first()
        
        result.append({
            "log_id": getattr(log, 'log_id', getattr(log, 'id', 0)), 
            "trainee_name": trainee.name if trainee else "알수없음",
            "from_team_name": from_team.team_name if from_team else "미배정",
            "to_team_name": to_team.team_name if to_team else "미배정",
            "is_incoming": log.to_team_id == team_id, 
            "move_date": log.move_date,
            "note": getattr(log, 'note', '인계 사항 없음')
        })
    return result

class TraineeStatusUpdate(BaseModel):
    requires_attention: Optional[bool] = None
    is_tech_linked: Optional[bool] = None

@router.put("/{trainee_id}/status")
def update_trainee_status(trainee_id: int, req: TraineeStatusUpdate, db: Session = Depends(get_db)):
    trainee = db.query(models.Trainee).filter(models.Trainee.trainee_id == trainee_id).first()
    if not trainee:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    
    if req.requires_attention is not None:
        trainee.requires_attention = req.requires_attention
    if req.is_tech_linked is not None:
        trainee.is_tech_linked = req.is_tech_linked
        
    db.commit()
    return {"message": "학생 상태가 업데이트 되었습니다."}