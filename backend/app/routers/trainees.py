from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from zoneinfo import ZoneInfo
from app import models
from app.database import get_db
from app.services.progress_state import build_progress_state_map, load_mission_targets, load_progress_logs

router = APIRouter()
KST = ZoneInfo("Asia/Seoul")

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
    drop_date: Optional[date] = None
    drop_reason: Optional[str] = None

class MemoCreateRequest(BaseModel):
    title: Optional[str] = None
    content: str
    author: str = "퍼실리테이터"

class MemoUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None

class TraineeCreateRequest(BaseModel):
    cohort_id: int
    name: str
    email: str
    phone: Optional[str] = None

# --- API 엔드포인트 ---
@router.get("/cohort/{cohort_id}")
def get_trainee_list(cohort_id: int, db: Session = Depends(get_db)):
    # Progress comes from crawl rows; facilitator flags and team names are joined.
    result = []
    rows = (
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
    progress_states = build_progress_state_map(load_progress_logs(db, cohort_id))

    for t, team_name, requires_attention, is_tech_linked in rows:
        progress = progress_states.get(t.trainee_id, {})
        result.append({
            "id": t.trainee_id,
            "name": t.name,
            "team_name": team_name,
            "level": progress.get("current_level", 1),
            "done": progress.get("personal_tasks_done", 0),
            "target": progress.get("target", 3),
            "is_completed": progress.get("is_completed", False),
            "is_dropped": t.is_dropped,
            "phone": t.phone or "미입력",
            "email": t.email,
            "is_tech_linked": bool(is_tech_linked),
            "requires_attention": bool(requires_attention)
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
        # A handoff note belongs with the facilitator's working notes and the
        # trainee profile, rather than a separate movement-history screen.
        if req.note and req.note.strip():
            db.add(models.FacilitatorMemo(
                cohort_id=trainee.cohort_id,
                team_id=req.to_team_id or from_team_id,
                trainee_id=trainee.trainee_id,
                title="조 변경 메모",
                content=req.note.strip(),
            ))
        db.commit()
    return {"message": "조 변경 및 메모 저장 완료"}

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


@router.get("/cohort/{cohort_id}/contacts")
def get_cohort_contact_logs(cohort_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(models.ContactLog, models.Trainee, models.Team.team_name)
        .join(models.Trainee, models.Trainee.trainee_id == models.ContactLog.trainee_id)
        .outerjoin(models.Team, models.Team.team_id == models.Trainee.team_id)
        .filter(models.Trainee.cohort_id == cohort_id)
        .order_by(models.ContactLog.contact_date.desc(), models.ContactLog.contact_id.desc())
        .all()
    )
    return [
        {
            "contact_id": log.contact_id,
            "trainee_id": trainee.trainee_id,
            "trainee_name": trainee.name,
            "team_id": trainee.team_id,
            "team_name": team_name or "미배정",
            "contact_date": log.contact_date,
            "contact_method": log.contact_method,
            "topic": log.topic,
            "content": log.content,
            "manager_name": log.manager_name,
        }
        for log, trainee, team_name in rows
    ]

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
        is_dropped=False
    )
    db.add(new_trainee)
    db.commit()
    return {"message": f"{req.name} 교육생 등록 완료"}

@router.get("/{trainee_id}/detail")
def get_trainee_detail(trainee_id: int, db: Session = Depends(get_db)):
    row = (
        db.query(
            models.Trainee,
            models.Team.team_name,
            models.TraineeFlag.requires_attention,
            models.TraineeFlag.is_tech_linked,
        )
        .outerjoin(models.Team, models.Team.team_id == models.Trainee.team_id)
        .outerjoin(models.TraineeFlag, models.TraineeFlag.trainee_id == models.Trainee.trainee_id)
        .filter(models.Trainee.trainee_id == trainee_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    trainee, team_name, requires_attention, is_tech_linked = row
    
    logs = db.query(models.ContactLog).filter(
        models.ContactLog.trainee_id == trainee_id
    ).order_by(models.ContactLog.contact_date.desc()).all()

    memos = (
        db.query(models.FacilitatorMemo, models.Team.team_name)
        .outerjoin(models.Team, models.Team.team_id == models.FacilitatorMemo.team_id)
        .join(models.Trainee, models.Trainee.trainee_id == models.FacilitatorMemo.trainee_id)
        .filter(models.FacilitatorMemo.trainee_id == trainee_id)
        .order_by(models.FacilitatorMemo.created_at.desc())
        .all()
    )

    mission_targets = load_mission_targets(db, trainee.cohort_id)
    trainee_progress = load_progress_logs(db, trainee.cohort_id, [trainee_id])
    current_progress = build_progress_state_map(
        trainee_progress, mission_targets=mission_targets
    ).get(trainee_id, {})
    actual_level = current_progress.get("current_level", 1)
    actual_done = current_progress.get("personal_tasks_done", 0)
    chart_points = []
    date_values = sorted({
        date_val
        for row in trainee_progress
        for date_val in (row.completed_at, row.passed_date, row.last_updated)
        if date_val is not None
    })
    for date_val in date_values:
        state = build_progress_state_map(
            trainee_progress, as_of=date_val, mission_targets=mission_targets
        ).get(trainee_id, {})
        chart_points.append((date_val, {
            "date": date_val.strftime("%m/%d"),
            "fullDate": date_val.strftime("%Y-%m-%d %H:%M"),
            "level": state.get("current_level", 1),
            "tasks": state.get("personal_tasks_done", 0),
            "team_project": int(bool(state.get("is_team_project_done"))),
        }))
    chart_data = [point for _, point in sorted(chart_points, key=lambda item: item[0])]
    if not chart_data:
        today = datetime.now(KST)
        chart_data = [{
            "date": "현재",
            "fullDate": today.strftime("%Y-%m-%d %H:%M"),
            "level": actual_level,
            "tasks": actual_done,
            "team_project": int(bool(current_progress.get("is_team_project_done"))),
        }]

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
        "personal_tasks_done": actual_done,
        "is_completed": bool(current_progress.get("is_completed")),
        "requires_attention": bool(requires_attention),
        "is_tech_linked": bool(is_tech_linked),
    }

    return {
        "trainee": trainee_data, 
        "logs": logs, 
        "progress": chart_data,
        "memos": [
            {
                "memo_id": memo.memo_id,
                "title": memo.title,
                "content": memo.content,
                "author": memo.author,
                "team_name": team_name,
                "created_at": memo.created_at,
            }
            for memo, team_name in memos
        ],
    }


@router.post("/{trainee_id}/memos")
def create_trainee_memo(trainee_id: int, req: MemoCreateRequest, db: Session = Depends(get_db)):
    trainee = db.query(models.Trainee).filter(models.Trainee.trainee_id == trainee_id).first()
    if not trainee:
        raise HTTPException(status_code=404, detail="교육생을 찾을 수 없습니다.")
    if not req.content.strip():
        raise HTTPException(status_code=422, detail="메모 내용을 입력해주세요.")
    memo = models.FacilitatorMemo(
        cohort_id=trainee.cohort_id,
        team_id=trainee.team_id,
        trainee_id=trainee.trainee_id,
        title=req.title.strip() if req.title else None,
        content=req.content.strip(),
        author=req.author,
        updated_at=datetime.now(),
    )
    db.add(memo)
    db.commit()
    db.refresh(memo)
    return {"memo_id": memo.memo_id, "message": "교육생 메모를 저장했습니다."}


@router.delete("/memos/{memo_id}")
def delete_trainee_memo(memo_id: int, db: Session = Depends(get_db)):
    memo = db.query(models.FacilitatorMemo).filter(
        models.FacilitatorMemo.memo_id == memo_id,
        models.FacilitatorMemo.trainee_id.isnot(None),
    ).first()
    if not memo:
        raise HTTPException(status_code=404, detail="교육생 메모를 찾을 수 없습니다.")
    db.delete(memo)
    db.commit()
    return {"message": "메모를 삭제했습니다."}


@router.patch("/memos/{memo_id}")
def update_trainee_memo(memo_id: int, req: MemoUpdateRequest, db: Session = Depends(get_db)):
    memo = db.query(models.FacilitatorMemo).filter(
        models.FacilitatorMemo.memo_id == memo_id,
        models.FacilitatorMemo.trainee_id.isnot(None),
    ).first()
    if not memo:
        raise HTTPException(status_code=404, detail="교육생 메모를 찾을 수 없습니다.")
    changes = req.model_dump(exclude_unset=True)
    if "content" in changes:
        if not changes["content"] or not changes["content"].strip():
            raise HTTPException(status_code=422, detail="메모 내용을 입력해주세요.")
        memo.content = changes["content"].strip()
    if "title" in changes:
        memo.title = changes["title"].strip() if changes["title"] else None
    memo.updated_at = datetime.now()
    db.commit()
    return {"updated_at": memo.updated_at, "message": "교육생 메모를 수정했습니다."}

class BulkAddTrainee(BaseModel):
    name: str
    email: str

class BulkCreateRequest(BaseModel):
    cohort_id: int
    team_id: Optional[int] = None
    trainees: List[BulkAddTrainee]

@router.post("/bulk")
def create_trainees_bulk(req: BulkCreateRequest, db: Session = Depends(get_db)):
    if not db.get(models.Cohort, req.cohort_id):
        raise HTTPException(status_code=404, detail="기수를 찾을 수 없습니다.")
    if req.team_id is not None:
        team = db.get(models.Team, req.team_id)
        if team is None or team.cohort_id != req.cohort_id:
            raise HTTPException(status_code=422, detail="선택한 기수에 속한 팀이 아닙니다.")

    normalized = [
        (trainee.name.strip(), trainee.email.strip().lower())
        for trainee in req.trainees
    ]
    emails = [email for _, email in normalized]
    if any(not name or not email for name, email in normalized):
        raise HTTPException(status_code=422, detail="교육생 이름과 이메일을 입력해주세요.")
    if len(emails) != len(set(emails)):
        raise HTTPException(status_code=422, detail="같은 이메일을 중복 입력할 수 없습니다.")
    if not emails:
        return {"message": "0명의 교육생이 성공적으로 반영되었습니다."}

    existing_by_email = {
        trainee.email.strip().lower(): trainee
        for trainee in db.query(models.Trainee)
        .filter(func.lower(models.Trainee.email).in_(emails))
        .all()
    }
    if any(
        existing_by_email[email].cohort_id != req.cohort_id
        for email in emails if email in existing_by_email
    ):
        raise HTTPException(status_code=409, detail="다른 기수에 등록된 이메일이 포함되어 있습니다.")

    try:
        for name, email in normalized:
            existing = existing_by_email.get(email)
            if existing:
                existing.team_id = req.team_id
            else:
                db.add(models.Trainee(
                    cohort_id=req.cohort_id,
                    team_id=req.team_id,
                    name=name,
                    email=email,
                    phone=None,
                    is_dropped=False,
                ))
        db.commit()
        return {"message": f"{len(normalized)}명의 교육생이 성공적으로 반영되었습니다."}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 등록된 교육생 이메일이 있습니다.")
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="교육생 저장 중 오류가 발생했습니다.")

class TraineeStatusUpdate(BaseModel):
    requires_attention: Optional[bool] = None
    is_tech_linked: Optional[bool] = None

@router.put("/{trainee_id}/status")
def update_trainee_status(trainee_id: int, req: TraineeStatusUpdate, db: Session = Depends(get_db)):
    trainee = db.query(models.Trainee).filter(models.Trainee.trainee_id == trainee_id).first()
    if not trainee:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    
    flags = db.query(models.TraineeFlag).filter(models.TraineeFlag.trainee_id == trainee_id).first()
    if flags is None:
        flags = models.TraineeFlag(trainee_id=trainee_id)
        db.add(flags)
    if req.requires_attention is not None:
        flags.requires_attention = req.requires_attention
    if req.is_tech_linked is not None:
        flags.is_tech_linked = req.is_tech_linked
        
    db.commit()
    return {"message": "학생 상태가 업데이트 되었습니다."}
