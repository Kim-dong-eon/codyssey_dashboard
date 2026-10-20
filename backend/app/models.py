from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, ForeignKey, Index, Text
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

class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (Index("ix_teams_cohort_name", "cohort_id", "team_name"),)
    
    team_id = Column(Integer, primary_key=True, index=True)
    cohort_id = Column(Integer, ForeignKey("cohorts.cohort_id", ondelete="CASCADE"), nullable=False)
    team_name = Column(String(255), nullable=False)
    
    cohort = relationship("Cohort", back_populates="teams")
    trainees = relationship("Trainee", back_populates="team")

class Trainee(Base):
    __tablename__ = "trainees"
    __table_args__ = (Index("ix_trainees_cohort_team", "cohort_id", "team_id"),)
    
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
    
    is_dropped = Column(Boolean, nullable=False, default=False)
    drop_date = Column(Date)
    drop_reason = Column(Text)

    cohort = relationship("Cohort", back_populates="trainees")
    team = relationship("Team", back_populates="trainees")
    progress_logs = relationship("ProgressLog", back_populates="trainee", cascade="all, delete-orphan")
    contact_logs = relationship("ContactLog", back_populates="trainee", cascade="all, delete-orphan")
    memos = relationship("FacilitatorMemo", back_populates="trainee", cascade="all, delete-orphan")
    flags = relationship("TraineeFlag", back_populates="trainee", uselist=False, cascade="all, delete-orphan")


class TraineeFlag(Base):
    """Small, joinable table for facilitator-managed trainee flags."""
    __tablename__ = "trainee_flags"

    trainee_id = Column(Integer, ForeignKey("trainees.trainee_id", ondelete="CASCADE"), primary_key=True)
    requires_attention = Column(Boolean, nullable=False, default=False)
    is_tech_linked = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    trainee = relationship("Trainee", back_populates="flags")

class ProgressLog(Base):
    __tablename__ = "progress_logs"

    log_id = Column(Integer, primary_key=True, index=True)
    trainee_id = Column(Integer, ForeignKey("trainees.trainee_id"))
    
    # Level comes from the crawl configuration and can vary by cohort.
    level = Column(Integer, nullable=False)

    # Mission-level crawl data. Legacy aggregate rows keep these nullable.
    cohort_id = Column(Integer, nullable=True, index=True)
    mission_type = Column(String(20), nullable=True)
    mission_label = Column(String(100), nullable=True)
    status = Column(String(50), nullable=True)
    completed_at = Column(DateTime, nullable=True, index=True)
    
    personal_tasks_done = Column(Integer, default=0)
    is_team_project_done = Column(Boolean, default=False)
    passed_date = Column(DateTime, nullable=True)
    last_updated = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    trainee = relationship("Trainee", back_populates="progress_logs")


class FacilitatorMemo(Base):
    """Team-level or trainee-level working notes for facilitator handoffs."""
    __tablename__ = "facilitator_memos"

    memo_id = Column(Integer, primary_key=True, index=True)
    cohort_id = Column(Integer, ForeignKey("cohorts.cohort_id", ondelete="CASCADE"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.team_id", ondelete="SET NULL"), nullable=True, index=True)
    trainee_id = Column(Integer, ForeignKey("trainees.trainee_id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String(255), nullable=True)
    content = Column(Text, nullable=False)
    author = Column(String(100), nullable=False, default="퍼실리테이터")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    trainee = relationship("Trainee", back_populates="memos")
    team = relationship("Team")

class TeamProject(Base):
    __tablename__ = "team_projects"
    __table_args__ = (Index("ix_team_projects_cohort_team_level", "cohort_id", "team_id", "level"),)
    cohort_id = Column(Integer, index=True, default=1)
    project_id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer)
    member_names = Column(String(500), nullable=True)
    level = Column(String(50))
    status = Column(String(50), default="팀 셋팅 중")
    status_changed_date = Column(DateTime, nullable=True, default=func.now(), onupdate=func.now())
    approved_by = Column(String(50), nullable=True)



class TeamBoardMemo(Base):
    """Cohort-scoped notes for the team project board, not a specific team."""
    __tablename__ = "team_board_memos"

    memo_id = Column(Integer, primary_key=True, index=True)
    cohort_id = Column(Integer, ForeignKey("cohorts.cohort_id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    author = Column(String(100), nullable=False, default="퍼실리테이터")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)


class TeamCallCampaign(Base):
    """One team-wide call reason with an outcome and optional note per trainee."""
    __tablename__ = "team_call_campaigns"

    campaign_id = Column(Integer, primary_key=True, index=True)
    cohort_id = Column(Integer, ForeignKey("cohorts.cohort_id", ondelete="CASCADE"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.team_id", ondelete="SET NULL"), nullable=True, index=True)
    reason = Column(String(255), nullable=False)
    manager_name = Column(String(100), nullable=False, default="퍼실리테이터")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    recipients = relationship("TeamCallRecipient", back_populates="campaign", cascade="all, delete-orphan")


class TeamCallRecipient(Base):
    """A trainee selected for a team call campaign."""
    __tablename__ = "team_call_recipients"

    recipient_id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("team_call_campaigns.campaign_id", ondelete="CASCADE"), nullable=False, index=True)
    trainee_id = Column(Integer, ForeignKey("trainees.trainee_id", ondelete="CASCADE"), nullable=False, index=True)
    received = Column(Boolean, nullable=False, default=True, server_default="1")
    note = Column(Text, nullable=True)

    campaign = relationship("TeamCallCampaign", back_populates="recipients")
    trainee = relationship("Trainee")
    

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
    title = Column(String(255))        # 행사명
    description = Column(Text, nullable=True) # 간단한 설명
    event_date = Column(Date)          # 행사 날짜
    event_type = Column(String(50), default="행사") # 행사, 특강, 교육 등
    start_datetime = Column(DateTime, nullable=True)
    end_datetime = Column(DateTime, nullable=True)

class EventRegistration(Base):
    __tablename__ = "event_registrations"

    reg_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    event_id = Column(Integer, nullable=False, index=True)
    trainee_id = Column(Integer, nullable=False, index=True)
    trainee_name = Column(String(50), nullable=False)
    reg_date = Column(DateTime, nullable=False, default=datetime.now)
    status = Column(String(20), nullable=False, default="신청완료")
