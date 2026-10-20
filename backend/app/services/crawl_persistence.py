"""Batch persistence for one cohort's crawled mission results.

The crawler only collects data. This module owns matching and database writes,
so a scheduled or manual trigger can reuse the same transaction boundary.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app import models


KST = ZoneInfo("Asia/Seoul")


def _completion_datetime(raw_value):
    if not raw_value:
        return None
    if isinstance(raw_value, datetime):
        return raw_value.astimezone(KST).replace(tzinfo=None) if raw_value.tzinfo else raw_value
    try:
        return datetime.fromisoformat(str(raw_value).strip()).replace(tzinfo=None)
    except ValueError:
        return None


class CrawlPersistence:
    """Prefetch existing rows once, then upsert in memory and commit per cohort."""

    def __init__(self, db: Session, cohort_id: int):
        self.db = db
        self.cohort_id = cohort_id
        self.checked_at = datetime.now(KST).replace(tzinfo=None)
        self.trainees_by_email = {
            (trainee.email or "").strip().lower(): trainee
            for trainee in db.query(models.Trainee)
            .filter(models.Trainee.cohort_id == cohort_id)
            .all()
            if trainee.email
        }
        self.progress_by_key = {}
        progress_rows = (
            db.query(models.ProgressLog)
            .join(models.Trainee, models.Trainee.trainee_id == models.ProgressLog.trainee_id)
            .filter(
                models.Trainee.cohort_id == cohort_id,
                models.ProgressLog.mission_type.in_(("personal", "team")),
                models.ProgressLog.mission_label.isnot(None),
            )
            .order_by(models.ProgressLog.log_id)
            .all()
        )
        for row in progress_rows:
            self.progress_by_key.setdefault(
                (row.trainee_id, row.level, row.mission_type, row.mission_label), row
            )
        self.projects_by_key = {}
        for project in (
            db.query(models.TeamProject)
            .filter(models.TeamProject.cohort_id == cohort_id)
            .order_by(models.TeamProject.project_id)
            .all()
        ):
            self.projects_by_key.setdefault((project.team_id, project.level), project)

    def upsert_progress(self, trainee, level, mission_type, mission_label, status, completed_at):
        key = (trainee.trainee_id, level, mission_type, mission_label)
        row = self.progress_by_key.get(key)
        if row is None:
            row = models.ProgressLog(
                trainee_id=trainee.trainee_id,
                cohort_id=trainee.cohort_id,
                level=level,
                mission_type=mission_type,
                mission_label=mission_label,
            )
            self.db.add(row)
            self.progress_by_key[key] = row
        row.cohort_id = trainee.cohort_id
        row.level = level
        row.status = status
        row.completed_at = _completion_datetime(completed_at)
        row.last_updated = self.checked_at

    def save_team_results(self, team_results):
        updated_projects = 0
        for mission_data in team_results:
            level = mission_data["level"]
            mission_label = str(mission_data["label"]).strip()
            project_level = mission_label.lower()
            for team_data in mission_data["teams"]:
                try:
                    team_id = int(team_data.get("team_sn"))
                except (TypeError, ValueError):
                    continue
                if not team_id:
                    continue

                status = team_data.get("status") or "팀 셋팅 중"
                members = team_data.get("members", [])
                names = [member.get("name") for member in members if member.get("name")]
                member_names = ", ".join(names) if names else None
                for member in members:
                    email = (member.get("email") or "").strip().lower()
                    trainee = self.trainees_by_email.get(email)
                    if trainee:
                        self.upsert_progress(
                            trainee, level, "team", mission_label,
                            status, team_data.get("completion_date"),
                        )

                key = (team_id, project_level)
                project = self.projects_by_key.get(key)
                if project is None:
                    project = models.TeamProject(
                        cohort_id=self.cohort_id,
                        team_id=team_id,
                        level=project_level,
                        status=status,
                        member_names=member_names,
                        status_changed_date=self.checked_at,
                    )
                    self.db.add(project)
                    self.projects_by_key[key] = project
                    updated_projects += 1
                elif project.status != status or project.member_names != member_names:
                    project.status = status
                    project.member_names = member_names
                    project.status_changed_date = self.checked_at
                    updated_projects += 1
        return updated_projects

    def save_personal_results(self, personal_results):
        processed = 0
        for mission_data in personal_results:
            level = mission_data["level"]
            mission_label = str(mission_data["label"]).strip()
            for record in mission_data["records"]:
                email = (record.get("email") or "").strip().lower()
                trainee = self.trainees_by_email.get(email)
                if not trainee or trainee.is_dropped:
                    continue
                self.upsert_progress(
                    trainee, level, "personal", mission_label,
                    record.get("status") or "알 수 없음",
                    record.get("completion_date"),
                )
                processed += 1
        return processed
