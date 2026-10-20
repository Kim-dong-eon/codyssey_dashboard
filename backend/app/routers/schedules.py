from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import Optional
from datetime import date
from app import models
from app.database import get_db

router = APIRouter()

class EventCreateRequest(BaseModel):
    cohort_id: int
    title: str
    description: Optional[str] = ""
    event_date: date
    event_type: str

class EventUpdateRequest(EventCreateRequest):
    pass

class RegisterRequest(BaseModel):
    trainee_id: int

@router.get("/cohort/{cohort_id}")
def get_events(cohort_id: str, db: Session = Depends(get_db)):
    if cohort_id == "all":
        events = db.query(models.ScheduleEvent).order_by(models.ScheduleEvent.event_date.asc()).all()
    else:
        try:
            c_id = int(cohort_id)
        except ValueError:
            c_id = 1
            
        events = db.query(models.ScheduleEvent).filter(
            or_(models.ScheduleEvent.cohort_id == c_id, models.ScheduleEvent.cohort_id == 0)
        ).order_by(models.ScheduleEvent.event_date.asc()).all()
        
    return events

@router.post("/")
def create_event(req: EventCreateRequest, db: Session = Depends(get_db)):
    new_event = models.ScheduleEvent(
        cohort_id=req.cohort_id, 
        title=req.title,
        description=req.description,
        event_date=req.event_date,
        event_type=req.event_type
    )
    db.add(new_event)
    db.commit()
    return {"message": "일정이 등록되었습니다."}

@router.put("/{event_id}")
def update_event(event_id: int, req: EventUpdateRequest, db: Session = Depends(get_db)):
    event = db.query(models.ScheduleEvent).filter(models.ScheduleEvent.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    event.cohort_id = req.cohort_id
    event.title = req.title
    event.description = req.description
    event.event_date = req.event_date
    event.event_type = req.event_type
    db.commit()
    db.refresh(event)
    return event

@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(models.ScheduleEvent).filter(models.ScheduleEvent.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    db.query(models.EventRegistration).filter(models.EventRegistration.event_id == event_id).delete(synchronize_session=False)
    db.delete(event)
    db.commit()
    return {"message": "일정이 삭제되었습니다."}

@router.get("/{event_id}/roster")
def get_event_roster(event_id: int, db: Session = Depends(get_db)):
    event = db.query(models.ScheduleEvent).filter(models.ScheduleEvent.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    rows = (
        db.query(models.EventRegistration, models.Trainee.name, models.Team.team_name)
        .outerjoin(models.Trainee, models.Trainee.trainee_id == models.EventRegistration.trainee_id)
        .outerjoin(models.Team, models.Team.team_id == models.Trainee.team_id)
        .filter(models.EventRegistration.event_id == event_id)
        .order_by(models.EventRegistration.reg_date.desc())
        .all()
    )
    return [
        {
            "reg_id": registration.reg_id,
            "event_id": registration.event_id,
            "trainee_id": registration.trainee_id,
            "trainee_name": trainee_name or registration.trainee_name,
            "team_name": team_name or "미배정",
            "reg_date": registration.reg_date,
            "status": registration.status,
        }
        for registration, trainee_name, team_name in rows
    ]

@router.post("/{event_id}/register")
def register_for_event(event_id: int, req: RegisterRequest, db: Session = Depends(get_db)):
    event = db.query(models.ScheduleEvent).filter(models.ScheduleEvent.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    trainee = db.query(models.Trainee).filter(models.Trainee.trainee_id == req.trainee_id).first()
    if not trainee:
        raise HTTPException(status_code=404, detail="교육생을 찾을 수 없습니다.")
    if event.cohort_id not in (0, trainee.cohort_id):
        raise HTTPException(status_code=400, detail="일정의 기수와 교육생 기수가 일치하지 않습니다.")
    existing = db.query(models.EventRegistration).filter(
        models.EventRegistration.event_id == event_id,
        models.EventRegistration.trainee_id == trainee.trainee_id,
        models.EventRegistration.status == "신청완료",
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 명단에 등록된 인원입니다.")
    db.add(models.EventRegistration(
        event_id=event_id,
        trainee_id=trainee.trainee_id,
        trainee_name=trainee.name,
        status="신청완료",
    ))
    db.commit()
    return {"message": "참석 명단에 추가했습니다."}

@router.put("/cancel/{registration_id}")
def cancel_registration(registration_id: int, db: Session = Depends(get_db)):
    registration = db.query(models.EventRegistration).filter(
        models.EventRegistration.reg_id == registration_id
    ).first()
    if not registration:
        raise HTTPException(status_code=404, detail="명단 항목을 찾을 수 없습니다.")
    registration.status = "취소됨"
    db.commit()
    return {"message": "참석을 취소했습니다."}
