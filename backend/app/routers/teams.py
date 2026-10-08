from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel 
from app import models
from app.database import get_db

router = APIRouter(
    prefix="/api/teams",
    tags=["Teams"]
)

@router.get("/cohort/{cohort_id}")
def get_team_management_data(cohort_id: int, db: Session = Depends(get_db)):
    trainees = db.query(models.Trainee).filter(
        models.Trainee.cohort_id == cohort_id, 
        models.Trainee.is_dropped == False
    ).all()
    
    teams = db.query(models.Team).filter(models.Team.cohort_id == cohort_id).all()
    team_ids = [team.team_id for team in teams]
    
    all_projects = []
    if team_ids:
        all_projects = db.query(models.TeamProject).filter(
            models.TeamProject.team_id.in_(team_ids)
        ).all()
    
    result = []
    
    # 미배정 인원 
    unassigned_members = [{
        "id": t.trainee_id, "name": t.name, "is_completed": t.is_completed, "level": t.current_level
    } for t in trainees if not t.team_id]
    
    result.append({
        "team_id": None,
        "team_name": "미배정",
        "members": unassigned_members,
        "projects": []
    })

    target_levels = ["1-1", "2-1", "final"]
    
    for team in teams:
        members = [{
            "id": t.trainee_id, "name": t.name, "is_completed": t.is_completed, "level": t.current_level
        } for t in trainees if t.team_id == team.team_id]
        
        team_projs = [p for p in all_projects if p.team_id == team.team_id]
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
    # 🚨 신규: team_projects 테이블의 cohort_id로 직접 필터링
    results = db.query(models.TeamProject).filter(
        models.TeamProject.cohort_id == cohort_id
    ).all()
    
    grouped = {}
    for proj in results:
        # team_projects의 team_id(예: 7, 13, 16...)를 그대로 독립적인 조 이름으로 사용
        if proj.team_id not in grouped:
            grouped[proj.team_id] = {
                "team_id": proj.team_id,
                "team_name": f"{proj.team_id}조", 
                "projects": {}
            }
        
        grouped[proj.team_id]["projects"][proj.level] = {
            "status": proj.status,
            "member_names": proj.member_names
        }
        
    # team_id(7, 13, 16...) 숫자를 기준으로 오름차순 정렬해서 프론트엔드로 전달
    sorted_results = sorted(list(grouped.values()), key=lambda x: x["team_id"])
    return sorted_results

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