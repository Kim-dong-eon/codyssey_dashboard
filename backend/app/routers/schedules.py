from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_  
from pydantic import BaseModel
from typing import Optional
from datetime import date
from app import models
from app.database import get_db

router = APIRouter(
    prefix="/api/schedules",
    tags=["Schedules"]
)

class EventCreateRequest(BaseModel):
    cohort_id: int
    title: str
    description: Optional[str] = ""
    event_date: date
    event_type: str

class RegisterRequest(BaseModel):
    trainee_id: int
    trainee_name: str

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

@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db)):
    # 🚨 QA 2번 해결: 행사를 지우기 전에 이 행사에 딸린 신청 명단부터 먼저 싹 지워줍니다! (고아 데이터 방지)
    db.query(models.EventRegistration).filter(models.EventRegistration.event_id == event_id).delete()
    
    event = db.query(models.ScheduleEvent).filter(models.ScheduleEvent.event_id == event_id).first()
    if not event: raise HTTPException(status_code=404)
    db.delete(event)
    db.commit()
    return {"message": "일정이 삭제되었습니다."}

@router.get("/{event_id}/roster")
def get_event_roster(event_id: int, db: Session = Depends(get_db)):
    roster = db.query(models.EventRegistration).filter(models.EventRegistration.event_id == event_id).order_by(models.EventRegistration.reg_date.desc()).all()
    return roster

@router.post("/{event_id}/register")
def register_for_event(event_id: int, req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(models.EventRegistration).filter(
        models.EventRegistration.event_id == event_id,
        models.EventRegistration.trainee_id == req.trainee_id,
        models.EventRegistration.status == "신청완료"
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 신청된 인원입니다.")
        
    new_reg = models.EventRegistration(
        event_id=event_id,
        trainee_id=req.trainee_id,
        trainee_name=req.trainee_name,
        status="신청완료"
    )
    db.add(new_reg)
    db.commit()
    return {"message": "명단에 추가되었습니다."}

@router.put("/cancel/{reg_id}")
def cancel_registration(reg_id: int, db: Session = Depends(get_db)):
    reg = db.query(models.EventRegistration).filter(models.EventRegistration.reg_id == reg_id).first()
    if not reg: raise HTTPException(status_code=404)
    reg.status = "취소됨"
    db.commit()
    return {"message": "신청이 취소되었습니다."}