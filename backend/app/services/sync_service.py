import os
import glob
import csv
import json
import sys
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy.orm import Session
from app import models
from app.database import SessionLocal

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "..", "temp_data")
os.makedirs(TEMP_DIR, exist_ok=True)

LEVEL_REQUIREMENTS = {
    1: {"personal": 3, "team": 1},
    2: {"personal": 3, "team": 1},
    3: {"personal": 1, "team": 1}
}

def parse_tasks(row):
    """띄어쓰기나 오타를 무시하고 필수/선택 문제 개수 추출"""
    personal, team = 0, 0
    for key, value in row.items():
        if not key: continue
        k_clean = str(key).replace(" ", "").strip()
        if "필수" in k_clean and ("문제" in k_clean or "과제" in k_clean):
            try: personal = int(value)
            except ValueError: pass
        elif "선택" in k_clean and ("문제" in k_clean or "과제" in k_clean):
            try: team = int(value)
            except ValueError: pass
    return personal, team


def sync_team_json_to_db(db: Session):
    json_files = glob.glob(os.path.join(TEMP_DIR, "team_native_*.json"))
    if not json_files:
        return "처리할 JSON 파일 없음"

    updated_teams = 0
    for file_path in json_files:
        try:
            with open(file_path, mode="r", encoding="utf-8") as f:
                data = json.load(f)

            for mission in data.get("missions", []):
                if not mission.get("success"):
                    continue

                level_str = str(mission.get("label", "")).strip().lower()
                if not level_str:
                    continue

                for team_data in mission.get("teams", []):
                    team_sn = team_data.get("team_sn")
                    if not team_sn: continue
                    
                    try: team_id = int(team_sn)
                    except ValueError: continue

                    status = team_data.get("status") or "팀 셋팅 중"

                    members_list = team_data.get("members", [])
                    extracted_names = [m.get("name") for m in members_list if m.get("name")]
                    member_names_str = ", ".join(extracted_names) if extracted_names else None

                    # 🚨 수정 완료: models.TeamProject.level 로 복구!
                    project = db.query(models.TeamProject).filter(
                        models.TeamProject.cohort_id == 1,
                        models.TeamProject.team_id == team_id,
                        models.TeamProject.level == level_str 
                    ).first()

                    if not project:
                        new_project = models.TeamProject(
                            cohort_id=1,
                            team_id=team_id, 
                            level=level_str,  # 🚨 수정 완료: level=level_str 로 복구!
                            status=status, 
                            member_names=member_names_str 
                        )
                        db.add(new_project)
                        db.flush()
                        updated_teams += 1
                        print(f"[INSERT] cohort=1, team_id={team_id}, level={level_str}, status={status}, members={member_names_str}")
                    else:
                        if project.status != status or project.member_names != member_names_str:
                            project.status = status
                            project.member_names = member_names_str
                            updated_teams += 1
                            print(f"[UPDATE] cohort=1, team_id={team_id}, level={level_str}, status={status}, members={member_names_str}")

        except Exception as e:
            db.rollback()
            print(f"[ERROR] JSON 처리 실패: {file_path} / {str(e)}")
            continue

        try: os.remove(file_path)
        except OSError: pass

    db.commit()
    return f"{updated_teams}개 퍼실팀 프로젝트 현황 업데이트 완료 (기수 1 고정)"


def sync_progress_csv_to_db(db: Session):
    csv_files = glob.glob(os.path.join(TEMP_DIR, "*.csv"))
    if not csv_files:
        return "처리할 CSV 파일 없음"

    processed_count = 0
    level_up_count = 0
    
    # 상위 레벨(3단계)부터 읽도록 역순 정렬
    csv_files.sort(key=lambda x: int(os.path.basename(x).split("progress_level")[1].split("_")[0]), reverse=True)
    
    processed_emails = set()

    for file_path in csv_files:
        try: csv_level = int(os.path.basename(file_path).split("progress_level")[1].split("_")[0])
        except Exception: continue

        req = LEVEL_REQUIREMENTS.get(csv_level)
        if not req: continue

        with open(file_path, mode="r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                email = row.get("이메일", "").strip().lower()
                if not email or email in processed_emails: 
                    continue
                
                trainee = db.query(models.Trainee).filter(models.Trainee.email == email).first()
                if not trainee or trainee.is_dropped: 
                    continue 

                processed_emails.add(email)

                personal_done, team_done = parse_tasks(row)
                is_team_done = True if team_done >= 1 else False

                prog_log = db.query(models.ProgressLog).filter(
                    models.ProgressLog.trainee_id == trainee.trainee_id,
                    models.ProgressLog.level == csv_level
                ).first()

                if not prog_log:
                    prog_log = models.ProgressLog(trainee_id=trainee.trainee_id, level=csv_level)
                    db.add(prog_log)
                    db.flush()

                prog_log.personal_tasks_done = personal_done
                prog_log.is_team_project_done = is_team_done

                if trainee.current_level < csv_level:
                    trainee.current_level = csv_level
                    trainee.personal_tasks_done = 0
                    trainee.is_team_project_done = False

                if trainee.current_level == csv_level:
                    trainee.personal_tasks_done = personal_done 
                    trainee.is_team_project_done = is_team_done 

                    if personal_done >= req["personal"] and team_done >= req["team"]:
                        if not prog_log.passed_date:
                            prog_log.passed_date = datetime.now()
                            
                        next_level = csv_level + 1
                        
                        if next_level <= 3:
                            trainee.current_level = next_level
                            trainee.personal_tasks_done = 0 
                            trainee.is_team_project_done = False 
                            level_up_count += 1
                        else:
                            trainee.is_completed = True
                
                processed_count += 1
                
        try: os.remove(file_path)
        except OSError: pass

    db.commit()
    return f"{processed_count}건 상세 진도 갱신, {level_up_count}명 레벨업 완료"

if __name__ == "__main__":
    print("⏳ 데이터 전처리 및 DB 등록을 시작합니다...")
    db = SessionLocal()
    try:
        team_result = sync_team_json_to_db(db)
        print(f"✅ [JSON -> 팀플 DB] {team_result}")
        
        prog_result = sync_progress_csv_to_db(db)
        print(f"✅ [CSV -> 개인진도 DB] {prog_result}")
        
        print("🚀 모든 데이터베이스 등록 절차가 성공적으로 끝났습니다!")
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
    finally:
        db.close()