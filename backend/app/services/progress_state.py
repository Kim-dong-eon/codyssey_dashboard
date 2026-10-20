from collections import defaultdict
from datetime import date, datetime, time

from sqlalchemy.orm import Session

from app import models


DEFAULT_PERSONAL_TARGETS = {1: 3, 2: 3, 3: 2}
DEFAULT_LEVELS = (1, 2, 3)
DONE_STATUSES = {"미션완료", "완료", "completed", "complete"}


def _cutoff(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    if isinstance(value, date):
        return datetime.combine(value, time.max)
    return None


def load_progress_logs(db: Session, cohort_id: int, trainee_ids=None):
    query = (
        db.query(models.ProgressLog)
        .join(models.Trainee, models.Trainee.trainee_id == models.ProgressLog.trainee_id)
        .filter(models.Trainee.cohort_id == cohort_id)
    )
    if trainee_ids is not None:
        ids = list(trainee_ids)
        if not ids:
            return []
        query = query.filter(models.ProgressLog.trainee_id.in_(ids))
    return query.order_by(
        models.ProgressLog.trainee_id,
        models.ProgressLog.level,
        models.ProgressLog.last_updated,
    ).all()


def load_mission_targets(db: Session, cohort_id: int):
    """Load only distinct mission labels needed to calculate a cohort's targets."""
    rows = (
        db.query(
            models.ProgressLog.level,
            models.ProgressLog.mission_type,
            models.ProgressLog.mission_label,
        )
        .join(models.Trainee, models.Trainee.trainee_id == models.ProgressLog.trainee_id)
        .filter(
            models.Trainee.cohort_id == cohort_id,
            models.ProgressLog.mission_type.in_(("personal", "team")),
            models.ProgressLog.mission_label.isnot(None),
        )
        .distinct()
        .all()
    )
    targets = {"personal": defaultdict(set), "team": defaultdict(set)}
    for level, mission_type, label in rows:
        targets[mission_type][level].add(label)
    return targets


def _is_done_on(row, cutoff):
    status = (row.status or "").strip().replace(" ", "").lower()
    if status not in DONE_STATUSES:
        return False
    if cutoff is None:
        return True
    completed_at = _cutoff(row.completed_at)
    return completed_at is not None and completed_at <= cutoff


def build_progress_state_map(logs, as_of=None, mission_targets=None):
    """Derive current and historical progress from mission completion dates."""
    cutoff = _cutoff(as_of)
    grouped = defaultdict(list)
    personal_labels = defaultdict(set, {
        level: set(labels)
        for level, labels in (mission_targets or {}).get("personal", {}).items()
    })
    team_labels = defaultdict(set, {
        level: set(labels)
        for level, labels in (mission_targets or {}).get("team", {}).items()
    })

    for row in logs:
        grouped[row.trainee_id].append(row)
        if row.mission_label and row.mission_type == "personal":
            personal_labels[row.level].add(row.mission_label)
        elif row.mission_label and row.mission_type == "team":
            team_labels[row.level].add(row.mission_label)

    result = {}
    for trainee_id, trainee_logs in grouped.items():
        detail_logs = [
            row for row in trainee_logs
            if row.mission_label and row.mission_type in {"personal", "team"}
        ]
        if detail_logs:
            done_personal = defaultdict(int)
            done_team = defaultdict(bool)
            for row in detail_logs:
                if not _is_done_on(row, cutoff):
                    continue
                if row.mission_type == "personal":
                    done_personal[row.level] += 1
                else:
                    done_team[row.level] = True

            levels = sorted(set(DEFAULT_LEVELS) | {row.level for row in detail_logs})
            current_level = levels[-1]
            is_completed = True
            for level in levels:
                target = len(personal_labels[level]) or DEFAULT_PERSONAL_TARGETS.get(level, 0)
                personal_complete = target > 0 and done_personal[level] >= target
                team_required = bool(team_labels[level]) or level in DEFAULT_LEVELS
                if not personal_complete or (team_required and not done_team[level]):
                    current_level = level
                    is_completed = False
                    break

            target = len(personal_labels[current_level]) or DEFAULT_PERSONAL_TARGETS.get(current_level, 0)
            result[trainee_id] = {
                "current_level": current_level,
                "personal_tasks_done": done_personal[current_level],
                "target": target,
                "is_team_project_done": done_team[current_level],
                "is_completed": is_completed,
                "source": "crawl_missions",
            }
            continue

        # Keep old aggregate rows as a fallback until each trainee has details.
        summary_by_level = {
            row.level: row for row in trainee_logs
            if row.mission_type == "summary" or row.mission_label is None
        }
        levels = sorted(set(DEFAULT_LEVELS) | set(summary_by_level))
        current_level = levels[-1]
        is_completed = True
        for level in levels:
            row = summary_by_level.get(level)
            if row is None:
                current_level = level
                is_completed = False
                break
            passed_date = _cutoff(row.passed_date)
            if cutoff is not None:
                level_done = passed_date is not None and passed_date <= cutoff
            else:
                level_done = bool(passed_date) or (
                    (row.personal_tasks_done or 0) >= DEFAULT_PERSONAL_TARGETS.get(level, 0)
                    and bool(row.is_team_project_done)
                )
            if not level_done:
                current_level = level
                is_completed = False
                break

        current = summary_by_level.get(current_level)
        has_current_data = current is not None and (
            cutoff is None
            or current.last_updated is None
            or _cutoff(current.last_updated) <= cutoff
        )
        result[trainee_id] = {
            "current_level": current_level,
            "personal_tasks_done": (current.personal_tasks_done or 0) if has_current_data else 0,
            "target": DEFAULT_PERSONAL_TARGETS.get(current_level, 0),
            "is_team_project_done": bool(current.is_team_project_done) if has_current_data else False,
            "is_completed": is_completed,
            "source": "legacy_summary",
        }

    return result
