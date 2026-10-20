from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app import models, schemas
from app.database import get_db

router = APIRouter()

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


@router.patch("/{cohort_id}", response_model=schemas.CohortOut)
def update_cohort_deadline(
    cohort_id: int,
    update: schemas.CohortDeadlineUpdate,
    db: Session = Depends(get_db),
):
    cohort = db.get(models.Cohort, cohort_id)
    if cohort is None:
        raise HTTPException(status_code=404, detail="기수를 찾을 수 없습니다.")
    if cohort.start_date and update.end_date < cohort.start_date:
        raise HTTPException(status_code=422, detail="기한은 시작일보다 빠를 수 없습니다.")
    cohort.end_date = update.end_date
    db.commit()
    db.refresh(cohort)
    return cohort
