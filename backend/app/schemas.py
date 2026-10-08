from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional, List
from datetime import date, datetime

# 공통 설정: ORM 모델(SQLAlchemy)을 Pydantic 모델로 자동 변환 허용 (Pydantic V2 방식)
class ORMBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

# ==========================================
# 1. 기수 (Cohort)
# ==========================================
class CohortBase(BaseModel):
    cohort_name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None

class CohortCreate(CohortBase):
    pass

class CohortOut(CohortBase, ORMBaseModel):
    cohort_id: int

# ==========================================
# 2. 편성조 (Team)
# ==========================================
class TeamBase(BaseModel):
    team_name: str

class TeamCreate(TeamBase):
    cohort_id: int

class TeamOut(TeamBase, ORMBaseModel):
    team_id: int
    cohort_id: int

# ==========================================
# 3. 교육생 (Trainee)
# ==========================================
class TraineeBase(BaseModel):
    name: str
    email: EmailStr
    gender: Optional[str] = None
    age: Optional[int] = None
    phone: Optional[str] = None
    major: Optional[str] = None
    is_major_related: Optional[bool] = None
    education_level: Optional[str] = None
    employment_status: Optional[str] = None

class TraineeCreate(TraineeBase):
    cohort_id: int
    team_id: Optional[int] = None

class TraineeUpdate(BaseModel):
    # 수료, 드랍, 조 변경 시 사용하는 부분 업데이트 모델
    team_id: Optional[int] = None
    is_completed: Optional[bool] = None
    is_dropped: Optional[bool] = None
    drop_date: Optional[date] = None
    drop_reason: Optional[str] = None

class TraineeOut(TraineeBase, ORMBaseModel):
    trainee_id: int
    cohort_id: int
    team_id: Optional[int]
    current_level: int
    personal_tasks_done: int
    is_completed: bool
    is_dropped: bool
    drop_date: Optional[date]
    drop_reason: Optional[str]

# ==========================================
# 4. 팀플 현황 (TeamProject)
# ==========================================
class TeamProjectBase(BaseModel):
    status: str

class TeamProjectUpdate(TeamProjectBase):
    approved_by: str

class TeamProjectOut(TeamProjectBase, ORMBaseModel):
    project_id: int
    team_id: int
    level: int
    status_changed_date: datetime
    approved_by: Optional[str]

# ==========================================
# 5. 연락 내역 (ContactLog)
# ==========================================
class ContactLogBase(BaseModel):
    contact_method: Optional[str] = None
    topic: Optional[str] = None
    content: Optional[str] = None
    manager_name: Optional[str] = None

class ContactLogCreate(ContactLogBase):
    pass

class ContactLogOut(ContactLogBase, ORMBaseModel):
    contact_id: int
    trainee_id: int
    contact_date: datetime

# ==========================================
# 6. 일정 (Schedule)
# ==========================================
class ScheduleBase(BaseModel):
    title: str
    start_datetime: datetime
    end_datetime: Optional[datetime] = None
    description: Optional[str] = None

class ScheduleCreate(ScheduleBase):
    cohort_id: int

class ScheduleOut(ScheduleBase, ORMBaseModel):
    schedule_id: int
    cohort_id: int