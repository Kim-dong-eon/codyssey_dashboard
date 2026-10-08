from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from datetime import datetime

class Cohort(Base):
    __tablename__ = "cohorts"
    
    cohort_id = Column(Integer, primary_key=True, index=True)
    cohort_name = Column(String(255), nullable=False)
    start_date = Column(Date)
    end_date = Column(Date)
    
    # 관계 설정 (1:N)
    teams = relationship("Team", back_populates="cohort", cascade="all, delete-orphan")
    trainees = relationship("Trainee", back_populates="cohort", cascade="all, delete-orphan")
    schedules = relationship("Schedule", back_populates="cohort", cascade="all, delete-orphan")

class Team(Base):
    __tablename__ = "teams"
    
    team_id = Column(Integer, primary_key=True, index=True)
    cohort_id = Column(Integer, ForeignKey("cohorts.cohort_id", ondelete="CASCADE"), nullable=False)
    team_name = Column(String(255), nullable=False)
    
    cohort = relationship("Cohort", back_populates="teams")
    trainees = relationship("Trainee", back_populates="team")

class LevelSetting(Base):
    __tablename__ = "level_settings"
    
    level = Column(Integer, primary_key=True, index=True)
    personal_task_count = Column(Integer, nullable=False)
    team_project_count = Column(Integer, nullable=False, default=1)

class Trainee(Base):
    __tablename__ = "trainees"
    
    trainee_id = Column(Integer, primary_key=True, index=True)
    cohort_id = Column(Integer, ForeignKey("cohorts.cohort_id", ondelete="CASCADE"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.team_id", ondelete="SET NULL"), nullable=True)
    
    name = Column(String(100), nullable=False)
    gender = Column(String(20))
    age = Column(Integer)
    phone = Column(String(50))
    email = Column(String(255), unique=True, index=True) # 크롤링 매칭 기준
    
    major = Column(String(255))
    is_major_related = Column(Boolean)
    education_level = Column(String(100))
    employment_status = Column(String(100))
    
    # 초기값 자동 세팅
    current_level = Column(Integer, ForeignKey("level_settings.level"), nullable=False, default=1)
    personal_tasks_done = Column(Integer, nullable=False, default=0)
    is_team_project_done = Column(Boolean, default=False)
    is_completed = Column(Boolean, nullable=False, default=False)
    is_dropped = Column(Boolean, nullable=False, default=False)
    drop_date = Column(Date)
    drop_reason = Column(Text)

    cohort = relationship("Cohort", back_populates="trainees")
    team = relationship("Team", back_populates="trainees")
    progress_logs = relationship("ProgressLog", back_populates="trainee", cascade="all, delete-orphan")
    contact_logs = relationship("ContactLog", back_populates="trainee", cascade="all, delete-orphan")
    
    requires_attention = Column(Boolean, default=False)
    is_tech_linked = Column(Boolean, default=False)

class ProgressLog(Base):
    __tablename__ = "progress_logs"

    log_id = Column(Integer, primary_key=True, index=True)
    trainee_id = Column(Integer, ForeignKey("trainees.trainee_id"))
    
    # [주의] 이 부분이 level_reached가 아니라 반드시 level 이어야 합니다!
    level = Column(Integer, ForeignKey("level_settings.level"), nullable=False)
    
    personal_tasks_done = Column(Integer, default=0)
    is_team_project_done = Column(Boolean, default=False)
    passed_date = Column(DateTime, nullable=True)
    last_updated = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    trainee = relationship("Trainee", back_populates="progress_logs")

class TeamMoveLog(Base):
    __tablename__ = "team_move_logs"
    
    move_id = Column(Integer, primary_key=True, index=True)
    trainee_id = Column(Integer, ForeignKey("trainees.trainee_id", ondelete="CASCADE"), nullable=False)
    from_team_id = Column(Integer, ForeignKey("teams.team_id", ondelete="SET NULL"), nullable=True)
    to_team_id = Column(Integer, ForeignKey("teams.team_id", ondelete="CASCADE"), nullable=False)
    move_date = Column(DateTime, server_default=func.now())
    note = Column(String(500), nullable=True)

class TeamProject(Base):
    __tablename__ = "team_projects"
    cohort_id = Column(Integer, index=True, default=1)
    project_id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer)
    member_names = Column(String(500), nullable=True)
    level = Column(String(50))
    status = Column(String(50), default="팀 셋팅 중")
    status_changed_date = Column(DateTime, onupdate=func.now())
    approved_by = Column(String(50), nullable=True)
    

class ContactLog(Base):
    __tablename__ = "contact_logs"
    
    contact_id = Column(Integer, primary_key=True, index=True)
    trainee_id = Column(Integer, ForeignKey("trainees.trainee_id", ondelete="CASCADE"), nullable=False)
    contact_date = Column(DateTime, server_default=func.now())
    contact_method = Column(String(50))
    topic = Column(String(255))
    content = Column(Text)
    manager_name = Column(String(100))

    trainee = relationship("Trainee", back_populates="contact_logs")

class Schedule(Base):
    __tablename__ = "schedules"
    
    schedule_id = Column(Integer, primary_key=True, index=True)
    cohort_id = Column(Integer, ForeignKey("cohorts.cohort_id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime)
    description = Column(Text)

    cohort = relationship("Cohort", back_populates="schedules")
    
# ==========================================
# 퍼실팀 공지사항 테이블 (업그레이드)
# ==========================================
class Notice(Base):
    __tablename__ = "notices"

    notice_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cohort_id = Column(Integer, index=True, default=1)
    content = Column(Text, nullable=False)
    author = Column(String(50), default="퍼실리테이터")
    
    # 신규 추가된 컬럼들
    is_pinned = Column(Boolean, default=False)
    status = Column(String(20), default="미완료") # "미완료" 또는 "완료"
    category = Column(String(20), default="일반") # "일반", "긴급"
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# ==========================================
# ✅ 신규 추가: 일정/행사 테이블
# ==========================================
class ScheduleEvent(Base):
    __tablename__ = "schedule_events"

    event_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    cohort_id = Column(Integer, index=True, default=1)
    title = Column(String(100))        # 행사명
    description = Column(Text, nullable=True) # 간단한 설명
    event_date = Column(Date)          # 행사 날짜
    event_type = Column(String(50), default="행사") # 행사, 특강, 교육 등

# ==========================================
# ✅ 신규 추가: 행사 신청 명단 테이블
# ==========================================
class EventRegistration(Base):
    __tablename__ = "event_registrations"

    reg_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, index=True)
    trainee_id = Column(Integer, index=True)
    trainee_name = Column(String(50))
    # 언제 신청했는지 시간 기록
    reg_date = Column(DateTime, server_default=func.now())
    # "신청완료" 또는 "취소됨"
    status = Column(String(20), default="신청완료")