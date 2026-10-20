from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app import models
from app.database import get_db
from app.services.progress_state import build_progress_state_map, load_progress_logs

router = APIRouter()


class TeamMemoRequest(BaseModel):
    title: Optional[str] = None
    content: str
    author: str = "퍼실리테이터"


class TeamMemoUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class TeamBoardMemoRequest(BaseModel):
    content: str
    author: str = "퍼실리테이터"


class TeamCallRecipientRequest(BaseModel):
    trainee_id: int
    received: bool = True
    note: Optional[str] = None


class TeamCallCampaignRequest(BaseModel):
    team_id: int
    reason: str
    recipients: List[TeamCallRecipientRequest]
    manager_name: str = "퍼실리테이터"


class TeamCallCampaignUpdateRequest(BaseModel):
    reason: Optional[str] = None
    recipients: Optional[List[TeamCallRecipientRequest]] = None

@router.get("/cohort/{cohort_id}")
def get_team_management_data(cohort_id: int, db: Session = Depends(get_db)):
    # Load teams and roster from both sides of the relationship. Starting with
    # teams alone can silently hide trainees whose old team_id no longer joins.
    teams = (
        db.query(models.Team)
        .filter(models.Team.cohort_id == cohort_id)
        .order_by(models.Team.team_name.asc())
        .all()
    )
    teams_by_id = {team.team_id: {"team": team, "members": []} for team in teams}
    unassigned_members = []
    roster_rows = (
        db.query(models.Trainee, models.Team.team_name, models.Team.cohort_id)
        .outerjoin(models.Team, models.Team.team_id == models.Trainee.team_id)
        .filter(models.Trainee.cohort_id == cohort_id, models.Trainee.is_dropped.is_(False))
        .order_by(models.Trainee.name.asc())
        .all()
    )
    progress_states = build_progress_state_map(load_progress_logs(db, cohort_id))
    for trainee, _team_name, team_cohort_id in roster_rows:
        progress = progress_states.get(trainee.trainee_id, {})
        member = {
            "id": trainee.trainee_id,
            "name": trainee.name,
            "is_completed": progress.get("is_completed", False),
            "level": progress.get("current_level", 1),
        }
        # Keep unjoined or cross-cohort assignments visible and movable back
        # into a valid team instead of dropping those rows from the UI.
        if trainee.team_id in teams_by_id and team_cohort_id == cohort_id:
            teams_by_id[trainee.team_id]["members"].append(member)
        else:
            unassigned_members.append(member)
    project_rows = (
        db.query(models.TeamProject, models.Team.team_name)
        .outerjoin(models.Team, models.Team.team_id == models.TeamProject.team_id)
        .filter(models.TeamProject.cohort_id == cohort_id)
        .all()
    )
    projects_by_team = {}
    for project, _team_name in project_rows:
        projects_by_team.setdefault(project.team_id, []).append(project)

    result = []
    result.append({
        "team_id": None,
        "team_name": "미배정",
        "members": unassigned_members,
        "projects": []
    })

    target_levels = ["1-1", "2-1", "final"]
    
    for team_id, item in teams_by_id.items():
        team = item["team"]
        members = item["members"]
        team_projs = projects_by_team.get(team_id, [])
        proj_list = [{"level": p.level, "status": p.status} for p in team_projs]

        existing_levels = {p["level"] for p in proj_list}
        
        # 빈칸 채워주기
        for lv in target_levels:
            if lv not in existing_levels:
                proj_list.append({"level": lv, "status": "팀 셋팅 중"})
                
        # 1-1, 2-1, final 순으로 정렬
        proj_list.sort(key=lambda x: target_levels.index(x["level"]) if x["level"] in target_levels else 99)

        result.append({
            "team_id": team.team_id,
            "team_name": team.team_name,
            "members": members,
            "projects": proj_list
        })
        
    return result

# 조 추가를 위한 Pydantic 스키마
class TeamCreateRequest(BaseModel):
    cohort_id: int
    team_name: str

@router.post("/")
def create_team(req: TeamCreateRequest, db: Session = Depends(get_db)):
    new_team = models.Team(cohort_id=req.cohort_id, team_name=req.team_name)
    db.add(new_team)
    db.commit()
    return {"message": f"{req.team_name}이(가) 생성되었습니다."}

# ==========================================
# [수정] 기수(cohort_id)별 팀플 진행 현황판 전용 API 
# ==========================================
@router.get("/cohort/{cohort_id}/projects")
def get_team_projects_only(cohort_id: int, db: Session = Depends(get_db)):
    results = (
        db.query(models.TeamProject, models.Team.team_name)
        .outerjoin(models.Team, models.Team.team_id == models.TeamProject.team_id)
        .filter(models.TeamProject.cohort_id == cohort_id)
        .all()
    )

    # Older project rows may not yet have the new timestamp. Fall back to the
    # latest joined team-mission crawl time for that team and mission label.
    mission_updates = {
        (team_id, (mission_label or "").strip().lower()): last_updated
        for team_id, mission_label, last_updated in (
            db.query(
                models.Trainee.team_id,
                models.ProgressLog.mission_label,
                func.max(models.ProgressLog.last_updated),
            )
            .join(models.ProgressLog, models.ProgressLog.trainee_id == models.Trainee.trainee_id)
            .filter(
                models.Trainee.cohort_id == cohort_id,
                models.ProgressLog.mission_type == "team",
            )
            .group_by(models.Trainee.team_id, models.ProgressLog.mission_label)
            .all()
        )
        if team_id is not None and mission_label
    }
    
    grouped = {}
    for proj, team_name in results:
        # team_projects의 team_id(예: 7, 13, 16...)를 그대로 독립적인 조 이름으로 사용
        if proj.team_id not in grouped:
            grouped[proj.team_id] = {
                "team_id": proj.team_id,
                "team_name": team_name or (f"{proj.team_id}조" if proj.team_id is not None else "미배정 팀"),
                "projects": {}
            }
        
        grouped[proj.team_id]["projects"][proj.level] = {
            "project_id": proj.project_id,
            "status": proj.status,
            "member_names": proj.member_names,
            "status_changed_date": proj.status_changed_date or mission_updates.get(
                (proj.team_id, (proj.level or "").strip().lower())
            ),
        }
        
    # team_id(7, 13, 16...) 숫자를 기준으로 오름차순 정렬해서 프론트엔드로 전달
    sorted_results = sorted(
        grouped.values(),
        key=lambda item: (item["team_id"] is None, item["team_id"] or 0),
    )
    return sorted_results


@router.get("/{team_id}/memos")
def get_team_memos(team_id: int, db: Session = Depends(get_db)):
    team = db.query(models.Team).filter(models.Team.team_id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="조를 찾을 수 없습니다.")
    rows = (
        db.query(models.FacilitatorMemo, models.Trainee.name)
        .join(models.Team, models.Team.team_id == models.FacilitatorMemo.team_id)
        .outerjoin(models.Trainee, models.Trainee.trainee_id == models.FacilitatorMemo.trainee_id)
        .filter(models.FacilitatorMemo.team_id == team_id)
        .order_by(models.FacilitatorMemo.created_at.desc())
        .all()
    )
    return [
        {
            "memo_id": memo.memo_id,
            "title": memo.title,
            "content": memo.content,
            "author": memo.author,
            "trainee_id": memo.trainee_id,
            "trainee_name": trainee_name,
            "created_at": memo.created_at,
            "updated_at": memo.updated_at,
        }
        for memo, trainee_name in rows
    ]


@router.get("/cohort/{cohort_id}/memos")
def get_cohort_memos(cohort_id: int, db: Session = Depends(get_db)):
    """Return team and trainee notes in one team-groupable feed."""
    rows = (
        db.query(models.FacilitatorMemo, models.Team.team_name, models.Trainee.name)
        .outerjoin(models.Team, models.Team.team_id == models.FacilitatorMemo.team_id)
        .outerjoin(models.Trainee, models.Trainee.trainee_id == models.FacilitatorMemo.trainee_id)
        .filter(models.FacilitatorMemo.cohort_id == cohort_id)
        .order_by(models.FacilitatorMemo.created_at.desc(), models.FacilitatorMemo.memo_id.desc())
        .all()
    )
    return [
        {
            "memo_id": memo.memo_id,
            "memo_type": "trainee" if memo.trainee_id is not None else "team",
            "team_id": memo.team_id,
            "team_name": team_name or "미배정",
            "trainee_id": memo.trainee_id,
            "trainee_name": trainee_name,
            "title": memo.title,
            "content": memo.content,
            "author": memo.author,
            "created_at": memo.created_at,
            "updated_at": memo.updated_at,
        }
        for memo, team_name, trainee_name in rows
    ]


@router.get("/cohort/{cohort_id}/call-campaigns")
def get_team_call_campaigns(cohort_id: int, db: Session = Depends(get_db)):
    campaigns = (
        db.query(models.TeamCallCampaign, models.Team.team_name)
        .outerjoin(models.Team, models.Team.team_id == models.TeamCallCampaign.team_id)
        .filter(models.TeamCallCampaign.cohort_id == cohort_id)
        .order_by(models.TeamCallCampaign.created_at.desc(), models.TeamCallCampaign.campaign_id.desc())
        .all()
    )
    campaign_ids = [campaign.campaign_id for campaign, _team_name in campaigns]
    recipient_rows = []
    if campaign_ids:
        recipient_rows = (
            db.query(models.TeamCallRecipient, models.Trainee.name)
            .join(models.Trainee, models.Trainee.trainee_id == models.TeamCallRecipient.trainee_id)
            .filter(models.TeamCallRecipient.campaign_id.in_(campaign_ids))
            .order_by(models.Trainee.name.asc())
            .all()
        )
    recipients_by_campaign = {}
    for recipient, trainee_name in recipient_rows:
        recipients_by_campaign.setdefault(recipient.campaign_id, []).append({
            "recipient_id": recipient.recipient_id,
            "trainee_id": recipient.trainee_id,
            "trainee_name": trainee_name,
            "received": recipient.received,
            "note": recipient.note,
        })
    return [
        {
            "campaign_id": campaign.campaign_id,
            "cohort_id": campaign.cohort_id,
            "team_id": campaign.team_id,
            "team_name": team_name or "미배정",
            "reason": campaign.reason,
            "manager_name": campaign.manager_name,
            "created_at": campaign.created_at,
            "updated_at": campaign.updated_at,
            "recipients": recipients_by_campaign.get(campaign.campaign_id, []),
        }
        for campaign, team_name in campaigns
    ]


@router.post("/cohort/{cohort_id}/call-campaigns")
def create_team_call_campaign(cohort_id: int, req: TeamCallCampaignRequest, db: Session = Depends(get_db)):
    reason = req.reason.strip()
    if not reason:
        raise HTTPException(status_code=422, detail="전화 사유를 입력해주세요.")
    if not req.recipients:
        raise HTTPException(status_code=422, detail="연락할 교육생을 한 명 이상 선택해주세요.")
    trainee_ids = [recipient.trainee_id for recipient in req.recipients]
    if len(set(trainee_ids)) != len(trainee_ids):
        raise HTTPException(status_code=422, detail="같은 교육생을 중복 선택할 수 없습니다.")
    team = db.query(models.Team).filter(
        models.Team.team_id == req.team_id,
        models.Team.cohort_id == cohort_id,
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="전담팀을 찾을 수 없습니다.")
    trainees = db.query(models.Trainee).filter(
        models.Trainee.cohort_id == cohort_id,
        models.Trainee.team_id == req.team_id,
        models.Trainee.is_dropped.is_(False),
        models.Trainee.trainee_id.in_(trainee_ids),
    ).all()
    if {trainee.trainee_id for trainee in trainees} != set(trainee_ids):
        raise HTTPException(status_code=422, detail="선택한 교육생 명단을 다시 확인해주세요.")

    campaign = models.TeamCallCampaign(
        cohort_id=cohort_id,
        team_id=team.team_id,
        reason=reason,
        manager_name=req.manager_name.strip() or "퍼실리테이터",
        updated_at=datetime.now(),
    )
    campaign.recipients = [
        models.TeamCallRecipient(
            trainee_id=recipient.trainee_id,
            received=recipient.received,
            note=recipient.note.strip() if recipient.note and recipient.note.strip() else None,
        )
        for recipient in req.recipients
    ]
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return {"campaign_id": campaign.campaign_id, "created_at": campaign.created_at, "message": "팀 전화 기록을 저장했습니다."}


@router.patch("/cohort/{cohort_id}/call-campaigns/{campaign_id}")
def update_team_call_campaign(cohort_id: int, campaign_id: int, req: TeamCallCampaignUpdateRequest, db: Session = Depends(get_db)):
    campaign = db.query(models.TeamCallCampaign).filter(
        models.TeamCallCampaign.cohort_id == cohort_id,
        models.TeamCallCampaign.campaign_id == campaign_id,
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="팀 전화 기록을 찾을 수 없습니다.")

    changes = req.model_dump(exclude_unset=True)
    if "reason" in changes:
        reason = (changes["reason"] or "").strip()
        if not reason:
            raise HTTPException(status_code=422, detail="전화 사유를 입력해주세요.")
        campaign.reason = reason

    if "recipients" in changes:
        recipients = req.recipients or []
        if not recipients:
            raise HTTPException(status_code=422, detail="연락 기록을 한 명 이상 남겨주세요.")
        trainee_ids = [recipient.trainee_id for recipient in recipients]
        if len(set(trainee_ids)) != len(trainee_ids):
            raise HTTPException(status_code=422, detail="같은 교육생을 중복 선택할 수 없습니다.")
        valid_ids = {
            row[0] for row in db.query(models.Trainee.trainee_id).filter(
                models.Trainee.cohort_id == cohort_id,
                models.Trainee.team_id == campaign.team_id,
                models.Trainee.is_dropped.is_(False),
                models.Trainee.trainee_id.in_(trainee_ids),
            ).all()
        }
        if valid_ids != set(trainee_ids):
            raise HTTPException(status_code=422, detail="선택한 교육생 명단을 다시 확인해주세요.")
        campaign.recipients = [
            models.TeamCallRecipient(
                trainee_id=recipient.trainee_id,
                received=recipient.received,
                note=recipient.note.strip() if recipient.note and recipient.note.strip() else None,
            )
            for recipient in recipients
        ]

    campaign.updated_at = datetime.now()
    db.commit()
    db.refresh(campaign)
    return {"campaign_id": campaign.campaign_id, "updated_at": campaign.updated_at, "message": "팀 전화 기록을 수정했습니다."}


@router.delete("/cohort/{cohort_id}/call-campaigns/{campaign_id}")
def delete_team_call_campaign(cohort_id: int, campaign_id: int, db: Session = Depends(get_db)):
    campaign = db.query(models.TeamCallCampaign).filter(
        models.TeamCallCampaign.cohort_id == cohort_id,
        models.TeamCallCampaign.campaign_id == campaign_id,
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="팀 전화 기록을 찾을 수 없습니다.")
    db.delete(campaign)
    db.commit()
    return {"message": "팀 전화 기록을 삭제했습니다."}


@router.get("/cohort/{cohort_id}/board-memos")
def get_team_board_memos(cohort_id: int, db: Session = Depends(get_db)):
    return db.query(models.TeamBoardMemo).filter(
        models.TeamBoardMemo.cohort_id == cohort_id
    ).order_by(models.TeamBoardMemo.created_at.desc(), models.TeamBoardMemo.memo_id.desc()).all()


@router.post("/cohort/{cohort_id}/board-memos")
def create_team_board_memo(cohort_id: int, req: TeamBoardMemoRequest, db: Session = Depends(get_db)):
    cohort = db.query(models.Cohort).filter(models.Cohort.cohort_id == cohort_id).first()
    if not cohort:
        raise HTTPException(status_code=404, detail="기수를 찾을 수 없습니다.")
    if not req.content.strip():
        raise HTTPException(status_code=422, detail="메모 내용을 입력해주세요.")
    memo = models.TeamBoardMemo(cohort_id=cohort_id, content=req.content.strip(), author=req.author)
    db.add(memo)
    db.commit()
    db.refresh(memo)
    return {"memo_id": memo.memo_id, "created_at": memo.created_at, "message": "현황판 메모를 저장했습니다."}


@router.delete("/cohort/{cohort_id}/board-memos/{memo_id}")
def delete_team_board_memo(cohort_id: int, memo_id: int, db: Session = Depends(get_db)):
    memo = db.query(models.TeamBoardMemo).filter(
        models.TeamBoardMemo.cohort_id == cohort_id,
        models.TeamBoardMemo.memo_id == memo_id,
    ).first()
    if not memo:
        raise HTTPException(status_code=404, detail="현황판 메모를 찾을 수 없습니다.")
    db.delete(memo)
    db.commit()
    return {"message": "현황판 메모를 삭제했습니다."}


@router.post("/{team_id}/memos")
def create_team_memo(team_id: int, req: TeamMemoRequest, db: Session = Depends(get_db)):
    team = db.query(models.Team).filter(models.Team.team_id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="조를 찾을 수 없습니다.")
    if not req.content.strip():
        raise HTTPException(status_code=422, detail="메모 내용을 입력해주세요.")
    memo = models.FacilitatorMemo(
        cohort_id=team.cohort_id,
        team_id=team.team_id,
        title=req.title.strip() if req.title else None,
        content=req.content.strip(),
        author=req.author,
        updated_at=datetime.now(),
    )
    db.add(memo)
    db.commit()
    db.refresh(memo)
    return {"memo_id": memo.memo_id, "message": "조 메모를 저장했습니다."}


@router.delete("/{team_id}/memos/{memo_id}")
def delete_team_memo(team_id: int, memo_id: int, db: Session = Depends(get_db)):
    memo = db.query(models.FacilitatorMemo).filter(
        models.FacilitatorMemo.memo_id == memo_id,
        models.FacilitatorMemo.team_id == team_id,
    ).first()
    if not memo:
        raise HTTPException(status_code=404, detail="해당 조의 메모를 찾을 수 없습니다.")
    db.delete(memo)
    db.commit()
    return {"message": "조 메모를 삭제했습니다."}


@router.patch("/{team_id}/memos/{memo_id}")
def update_team_memo(team_id: int, memo_id: int, req: TeamMemoUpdateRequest, db: Session = Depends(get_db)):
    memo = db.query(models.FacilitatorMemo).filter(
        models.FacilitatorMemo.memo_id == memo_id,
        models.FacilitatorMemo.team_id == team_id,
    ).first()
    if not memo:
        raise HTTPException(status_code=404, detail="해당 조의 메모를 찾을 수 없습니다.")
    changes = req.model_dump(exclude_unset=True)
    if "content" in changes:
        if not changes["content"] or not changes["content"].strip():
            raise HTTPException(status_code=422, detail="메모 내용을 입력해주세요.")
        memo.content = changes["content"].strip()
    if "title" in changes:
        memo.title = changes["title"].strip() if changes["title"] else None
    memo.updated_at = datetime.now()
    db.commit()
    return {"updated_at": memo.updated_at, "message": "조 메모를 수정했습니다."}

@router.delete("/{team_id}")
def delete_team(team_id: int, db: Session = Depends(get_db)):
    team = db.query(models.Team).filter(models.Team.team_id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="팀을 찾을 수 없습니다.")
    
    # 1. 삭제할 팀에 속해 있던 학생들을 모두 '미배정(null)' 상태로 돌려놓습니다.
    trainees = db.query(models.Trainee).filter(models.Trainee.team_id == team_id).all()
    for t in trainees:
        t.team_id = None
        
    # 2. 팀 삭제
    db.delete(team)
    db.commit()
    
    return {"message": "팀이 성공적으로 삭제되었으며, 소속 학생들은 미배정 처리되었습니다."}
