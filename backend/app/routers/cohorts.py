from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import models, schemas
from app.database import get_db

# 라우터 설정 (URL 접두사 및 Swagger 태그)
router = APIRouter(prefix="/api/cohorts", tags=["Cohorts"])

# 1. 전체 기수 목록 조회 [GET]
@router.get("/", response_model=List[schemas.CohortOut])
def get_cohorts(db: Session = Depends(get_db)):
    return db.query(models.Cohort).all()

# 2. 새 기수 생성 [POST]
@router.post("/", response_model=schemas.CohortOut)
def create_cohort(cohort: schemas.CohortCreate, db: Session = Depends(get_db)):
    new_cohort = models.Cohort(**cohort.model_dump())
    db.add(new_cohort)
    db.commit()
    db.refresh(new_cohort)
    return new_cohort

# 3. 특정 기수의 전체 일정 조회 [GET]
@router.get("/{cohort_id}/schedules", response_model=List[schemas.ScheduleOut])
def get_schedules_by_cohort(cohort_id: int, db: Session = Depends(get_db)):
    schedules = db.query(models.Schedule).filter(models.Schedule.cohort_id == cohort_id).all()
    return schedules

# 4. 특정 기수에 새 일정 등록 [POST]
@router.post("/{cohort_id}/schedules", response_model=schemas.ScheduleOut)
def create_schedule(cohort_id: int, schedule: schemas.ScheduleCreate, db: Session = Depends(get_db)):
    # 기수 존재 여부 확인
    if not db.query(models.Cohort).filter(models.Cohort.cohort_id == cohort_id).first():
        raise HTTPException(status_code=404, detail="해당 기수를 찾을 수 없습니다.")
    
    new_schedule = models.Schedule(**schedule.model_dump())
    db.add(new_schedule)
    db.commit()
    db.refresh(new_schedule)
    return new_schedule