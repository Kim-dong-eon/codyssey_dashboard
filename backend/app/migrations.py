"""Legacy schema upgrades kept separate from HTTP application setup."""

import logging
from datetime import date, datetime

from sqlalchemy import MetaData, Table, inspect, select, text

from app import models
from app.database import Base, SessionLocal, engine

logger = logging.getLogger(__name__)


def migrate_legacy_team_moves():
    """Move old handoff notes into facilitator memos, then retire the old table."""
    inspector = inspect(engine)
    if not inspector.has_table("team_move_logs"):
        return

    legacy_table = Table("team_move_logs", MetaData(), autoload_with=engine)
    memo_table = Table("facilitator_memos", MetaData(), autoload_with=engine)
    memo_columns = set(memo_table.c.keys())
    can_retire_table = True
    try:
        with engine.begin() as connection:
            legacy_rows = connection.execute(select(legacy_table)).mappings().all()
            for row in legacy_rows:
                move_id = row.get("move_id")
                trainee_id = row.get("trainee_id")
                trainee = connection.execute(
                    select(models.Trainee.trainee_id, models.Trainee.cohort_id)
                    .where(models.Trainee.trainee_id == trainee_id)
                ).first()
                if not trainee:
                    can_retire_table = False
                    logger.warning("Legacy movement %s has no trainee; keeping team_move_logs for recovery", move_id)
                    continue

                from_team = connection.execute(
                    select(models.Team.team_id, models.Team.team_name)
                    .where(models.Team.team_id == row.get("from_team_id"))
                ).first() if row.get("from_team_id") else None
                to_team = connection.execute(
                    select(models.Team.team_id, models.Team.team_name)
                    .where(models.Team.team_id == row.get("to_team_id"))
                ).first() if row.get("to_team_id") else None
                team = to_team or from_team
                from_name = from_team.team_name if from_team else "미배정"
                to_name = to_team.team_name if to_team else "미배정"
                note = (row.get("note") or "기록된 특이사항 없음").strip()
                content = f"조 변경: {from_name} → {to_name}\n\n{note}"

                # Older versions used legacy_move_id as an idempotency key. If
                # that column has already been removed, match the preserved
                # note fields so startup can safely retry this migration.
                already_migrated = False
                if "legacy_move_id" in memo_columns:
                    already_migrated = connection.execute(
                        select(memo_table.c.memo_id).where(memo_table.c.legacy_move_id == move_id).limit(1)
                    ).first() is not None
                else:
                    criteria = [
                        memo_table.c.trainee_id == trainee_id,
                        memo_table.c.title == "기존 조 이동 메모",
                        memo_table.c.content == content,
                    ]
                    if row.get("move_date") is not None:
                        criteria.append(memo_table.c.created_at == row.get("move_date"))
                    already_migrated = connection.execute(
                        select(memo_table.c.memo_id).where(*criteria).limit(1)
                    ).first() is not None
                if already_migrated:
                    continue

                memo_values = {
                    "cohort_id": trainee.cohort_id,
                    "team_id": team.team_id if team else None,
                    "trainee_id": trainee_id,
                    "title": "기존 조 이동 메모",
                    "content": content,
                    "author": "퍼실리테이터",
                }
                if "created_at" in memo_columns and row.get("move_date") is not None:
                    memo_values["created_at"] = row.get("move_date")
                if "legacy_move_id" in memo_columns:
                    memo_values["legacy_move_id"] = move_id
                connection.execute(memo_table.insert().values(**memo_values))

        if can_retire_table:
            legacy_table.drop(bind=engine, checkfirst=True)
            logger.info("Migrated old team movement notes and retired team_move_logs")
    except Exception:
        logger.exception("Could not migrate team_move_logs; leaving the source table intact")


def drop_facilitator_memo_obsolete_columns():
    """Remove memo metadata that is no longer part of the product model."""
    inspector = inspect(engine)
    if not inspector.has_table("facilitator_memos"):
        return

    obsolete = {"legacy_move_id"}
    columns = {column["name"] for column in inspector.get_columns("facilitator_memos")}
    if not (columns & obsolete):
        return

    for index in inspect(engine).get_indexes("facilitator_memos"):
        if index.get("unique") and set(index.get("column_names") or []) & obsolete:
            index_name = engine.dialect.identifier_preparer.quote(index["name"])
            if engine.dialect.name in {"mysql", "mariadb"}:
                statement = f"DROP INDEX {index_name} ON facilitator_memos"
            else:
                statement = f"DROP INDEX {index_name}"
            with engine.begin() as connection:
                connection.execute(text(statement))

    for column_name in sorted(columns & obsolete):
        quoted_column = engine.dialect.identifier_preparer.quote(column_name)
        with engine.begin() as connection:
            connection.execute(text(f"ALTER TABLE facilitator_memos DROP COLUMN {quoted_column}"))
    logger.info("Removed obsolete facilitator_memos columns: %s", ", ".join(sorted(columns & obsolete)))


def migrate_project_memos_to_board_memos():
    """Preserve any project notes as page notes before retiring project links."""
    inspector = inspect(engine)
    if not inspector.has_table("team_project_memos") or not inspector.has_table("team_board_memos"):
        return

    source = Table("team_project_memos", MetaData(), autoload_with=engine)
    target = Table("team_board_memos", MetaData(), autoload_with=engine)
    source_columns = set(source.c.keys())
    target_columns = set(target.c.keys())
    can_retire_source = True

    with engine.begin() as connection:
        for row in connection.execute(select(source)).mappings():
            project = connection.execute(
                select(models.TeamProject.project_id, models.TeamProject.cohort_id)
                .where(models.TeamProject.project_id == row.get("project_id"))
            ).first()
            if not project:
                can_retire_source = False
                logger.warning("Project memo %s has no project; keeping its source table", row.get("memo_id"))
                continue

            criteria = [
                target.c.cohort_id == project.cohort_id,
                target.c.content == row.get("content"),
            ]
            if "created_at" in source_columns and "created_at" in target_columns:
                criteria.append(target.c.created_at == row.get("created_at"))
            if "author" in source_columns and "author" in target_columns:
                criteria.append(target.c.author == row.get("author"))
            exists = connection.execute(select(target.c.memo_id).where(*criteria).limit(1)).first()
            if exists:
                continue

            values = {"cohort_id": project.cohort_id, "content": row.get("content") or ""}
            if "created_at" in target_columns and row.get("created_at") is not None:
                values["created_at"] = row.get("created_at")
            if "author" in target_columns and row.get("author"):
                values["author"] = row.get("author")
            connection.execute(target.insert().values(**values))

    if can_retire_source:
        source.drop(bind=engine, checkfirst=True)
        logger.info("Moved project-linked notes to cohort-level board notes and retired team_project_memos")


def ensure_team_project_status_timestamp():
    """Add the status timestamp used by the board to older team project tables."""
    inspector = inspect(engine)
    if not inspector.has_table("team_projects"):
        return
    columns = {column["name"] for column in inspector.get_columns("team_projects")}
    if "status_changed_date" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE team_projects ADD COLUMN status_changed_date DATETIME NULL"))


def ensure_schedule_event_compatibility():
    """Add fields needed to retain legacy schedule times in the calendar event table."""
    inspector = inspect(engine)
    if not inspector.has_table("schedule_events"):
        return
    columns = {column["name"] for column in inspector.get_columns("schedule_events")}
    for column_name in ("start_datetime", "end_datetime"):
        if column_name not in columns:
            with engine.begin() as connection:
                connection.execute(text(
                    f"ALTER TABLE schedule_events ADD COLUMN {column_name} DATETIME NULL"
                ))
    if engine.dialect.name in {"mysql", "mariadb"}:
        title_column = next((column for column in inspector.get_columns("schedule_events") if column["name"] == "title"), None)
        if title_column and getattr(title_column["type"], "length", None) != 255:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE schedule_events MODIFY COLUMN title VARCHAR(255) NULL"))


def _legacy_schedule_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def _drop_schedule_migration_marker():
    if not inspect(engine).has_table("schedule_events"):
        return
    columns = {column["name"] for column in inspect(engine).get_columns("schedule_events")}
    if "legacy_schedule_id" not in columns:
        return
    quoted_column = engine.dialect.identifier_preparer.quote("legacy_schedule_id")
    try:
        with engine.begin() as connection:
            connection.execute(text(f"ALTER TABLE schedule_events DROP COLUMN {quoted_column}"))
    except Exception:
        # The migration is already complete; keep the harmless marker if the
        # current database engine cannot drop columns in place.
        logger.warning("Could not remove the temporary legacy_schedule_id column")


def migrate_legacy_schedules():
    """Merge the old schedules table into schedule_events, then retire the duplicate table."""
    inspector = inspect(engine)
    if not inspector.has_table("schedule_events"):
        return
    if not inspector.has_table("schedules"):
        _drop_schedule_migration_marker()
        return

    target_columns = {column["name"] for column in inspector.get_columns("schedule_events")}
    if "legacy_schedule_id" not in target_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE schedule_events ADD COLUMN legacy_schedule_id INTEGER NULL"))

    legacy_table = Table("schedules", MetaData(), autoload_with=engine)
    event_table = Table("schedule_events", MetaData(), autoload_with=engine)
    copied_ids = set()
    failed_ids = []
    try:
        with engine.begin() as connection:
            rows = connection.execute(select(legacy_table)).mappings().all()
            for row in rows:
                legacy_id = row.get("schedule_id")
                existing = connection.execute(
                    select(event_table.c.event_id)
                    .where(event_table.c.legacy_schedule_id == legacy_id)
                    .limit(1)
                ).first()
                if existing:
                    copied_ids.add(legacy_id)
                    continue

                start_datetime = _legacy_schedule_datetime(row.get("start_datetime"))
                if start_datetime is None:
                    failed_ids.append(legacy_id)
                    continue
                connection.execute(event_table.insert().values(
                    cohort_id=row.get("cohort_id"),
                    title=row.get("title") or "일정",
                    description=row.get("description"),
                    event_date=start_datetime.date(),
                    event_type="행사",
                    start_datetime=start_datetime,
                    end_datetime=_legacy_schedule_datetime(row.get("end_datetime")),
                    legacy_schedule_id=legacy_id,
                ))
                copied_ids.add(legacy_id)

        if failed_ids:
            logger.error("Keeping schedules table because some rows have invalid start_datetime: %s", failed_ids)
            return
        legacy_table.drop(bind=engine, checkfirst=True)
        _drop_schedule_migration_marker()
        logger.info("Migrated %s legacy schedules into schedule_events and removed schedules", len(copied_ids))
    except Exception:
        logger.exception("Could not migrate the legacy schedules table; keeping it for recovery")


def ensure_record_updated_timestamps():
    """Preserve creation dates and add editable update timestamps to notes and call records."""
    for table_name in ("facilitator_memos", "team_call_campaigns"):
        inspector = inspect(engine)
        if not inspector.has_table(table_name):
            continue
        columns = {column["name"] for column in inspector.get_columns(table_name)}
        if "updated_at" not in columns:
            default_clause = " DEFAULT CURRENT_TIMESTAMP" if engine.dialect.name in {"mysql", "mariadb"} else ""
            with engine.begin() as connection:
                connection.execute(text(
                    f"ALTER TABLE {table_name} ADD COLUMN updated_at DATETIME NULL{default_clause}"
                ))
        created_column = "created_at"
        with engine.begin() as connection:
            connection.execute(text(
                f"UPDATE {table_name} SET updated_at = {created_column} WHERE updated_at IS NULL"
            ))


def migrate_crawl_progress_schema():
    """Move progress state to crawl mission rows and normalize facilitator flags."""
    inspector = inspect(engine)
    if not inspector.has_table("progress_logs"):
        return

    progress_columns = {column["name"] for column in inspector.get_columns("progress_logs")}
    additions = {
        "cohort_id": "INTEGER NULL",
        "mission_type": "VARCHAR(20) NULL",
        "mission_label": "VARCHAR(100) NULL",
        "status": "VARCHAR(50) NULL",
        "completed_at": "DATETIME NULL",
    }
    for column_name, definition in additions.items():
        if column_name not in progress_columns:
            with engine.begin() as connection:
                connection.execute(text(
                    f"ALTER TABLE progress_logs ADD COLUMN {column_name} {definition}"
                ))

    # Reflect legacy columns because the active ORM model intentionally no
    # longer exposes these duplicated state fields.
    inspector = inspect(engine)
    trainee_columns = {column["name"] for column in inspect(engine).get_columns("trainees")}
    if {"requires_attention", "is_tech_linked"}.issubset(trainee_columns):
        legacy_trainees = Table("trainees", MetaData(), autoload_with=engine)
        with engine.connect() as connection:
            flag_rows = connection.execute(select(
                legacy_trainees.c.trainee_id,
                legacy_trainees.c.requires_attention,
                legacy_trainees.c.is_tech_linked,
            )).mappings().all()
        db = SessionLocal()
        try:
            for row in flag_rows:
                flag = db.get(models.TraineeFlag, row["trainee_id"])
                if flag is None:
                    db.add(models.TraineeFlag(
                        trainee_id=row["trainee_id"],
                        requires_attention=bool(row["requires_attention"]),
                        is_tech_linked=bool(row["is_tech_linked"]),
                    ))
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    with engine.begin() as connection:
        connection.execute(text(
            "UPDATE progress_logs SET cohort_id = "
            "(SELECT cohort_id FROM trainees WHERE trainees.trainee_id = progress_logs.trainee_id) "
            "WHERE cohort_id IS NULL AND EXISTS "
            "(SELECT 1 FROM trainees WHERE trainees.trainee_id = progress_logs.trainee_id)"
        ))
        connection.execute(text(
            "UPDATE progress_logs SET mission_type = 'summary' "
            "WHERE mission_type IS NULL"
        ))
        connection.execute(text(
            "UPDATE progress_logs SET completed_at = passed_date "
            "WHERE completed_at IS NULL AND passed_date IS NOT NULL"
        ))

    # Include level in the mission key: mission labels may repeat across
    # levels, while each trainee can still have exactly one row per mission.
    expected_mission_key = ["trainee_id", "level", "mission_type", "mission_label"]
    indexes = {index.get("name"): index for index in inspect(engine).get_indexes("progress_logs")}
    mission_index_name = "uq_progress_logs_mission_by_level"
    mission_index = indexes.get(mission_index_name)
    if not mission_index:
        # Create the replacement first. Its leading trainee_id also supports
        # fk_progress_trainee, so MySQL can then release the old index.
        with engine.begin() as connection:
            connection.execute(text(
                f"CREATE UNIQUE INDEX {mission_index_name} "
                "ON progress_logs (trainee_id, level, mission_type, mission_label)"
            ))
    elif mission_index.get("column_names") != expected_mission_key:
        raise RuntimeError(
            f"Unexpected columns on {mission_index_name}: {mission_index.get('column_names')}"
        )

    for obsolete_index_name in ("uq_progress_logs_mission", "uq_progress_logs_mission_key"):
        if obsolete_index_name not in indexes:
            continue
        with engine.begin() as connection:
            if engine.dialect.name in {"mysql", "mariadb"}:
                connection.execute(text(
                    f"DROP INDEX {obsolete_index_name} ON progress_logs"
                ))
            else:
                connection.execute(text(f"DROP INDEX {obsolete_index_name}"))
    index_names = set(indexes)
    if "ix_progress_logs_cohort_id" not in index_names:
        with engine.begin() as connection:
            connection.execute(text(
                "CREATE INDEX ix_progress_logs_cohort_id ON progress_logs (cohort_id)"
            ))

    trainee_columns = {column["name"] for column in inspect(engine).get_columns("trainees")}
    state_columns = {
        "current_level",
        "personal_tasks_done",
        "is_completed",
        "is_team_project_done",
    }
    if state_columns.issubset(trainee_columns):
        legacy_trainees = Table("trainees", MetaData(), autoload_with=engine)
        with engine.connect() as connection:
            state_rows = connection.execute(select(
                legacy_trainees.c.trainee_id,
                legacy_trainees.c.cohort_id,
                legacy_trainees.c.current_level,
                legacy_trainees.c.personal_tasks_done,
                legacy_trainees.c.is_team_project_done,
                legacy_trainees.c.is_completed,
            )).mappings().all()
        db = SessionLocal()
        try:
            for row in state_rows:
                level = row["current_level"] or 1
                summary = db.query(models.ProgressLog).filter(
                    models.ProgressLog.trainee_id == row["trainee_id"],
                    models.ProgressLog.level == level,
                    models.ProgressLog.mission_type == "summary",
                    models.ProgressLog.mission_label.is_(None),
                ).first()
                if summary is None:
                    summary = models.ProgressLog(
                        trainee_id=row["trainee_id"],
                        level=level,
                        mission_type="summary",
                        mission_label=None,
                    )
                    db.add(summary)
                summary.cohort_id = row["cohort_id"]
                summary.personal_tasks_done = row["personal_tasks_done"] or 0
                summary.is_team_project_done = bool(row["is_team_project_done"])
                if row["is_completed"] and summary.passed_date is None:
                    summary.passed_date = datetime.now()
                if summary.passed_date is not None:
                    summary.completed_at = summary.passed_date
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    if engine.dialect.name in {"mysql", "mariadb"}:
        # Remove level-settings foreign keys before dropping their table and
        # its duplicated current-level column.
        for table_name, column_name in (("trainees", "current_level"), ("progress_logs", "level")):
            current_inspector = inspect(engine)
            if not current_inspector.has_table(table_name):
                continue
            for foreign_key in current_inspector.get_foreign_keys(table_name):
                if column_name not in foreign_key.get("constrained_columns", []):
                    continue
                constraint_name = foreign_key.get("name")
                if not constraint_name:
                    continue
                quoted_name = engine.dialect.identifier_preparer.quote(constraint_name)
                with engine.begin() as connection:
                    connection.execute(text(
                        f"ALTER TABLE {table_name} DROP FOREIGN KEY {quoted_name}"
                    ))

        for column_name in (
            "current_level",
            "personal_tasks_done",
            "is_completed",
            "is_team_project_done",
            "requires_attention",
            "is_tech_linked",
        ):
            if column_name in trainee_columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE trainees DROP COLUMN {column_name}"))
    else:
        # SQLite cannot remove individual foreign keys in-place. Keep the
        # legacy level FK/table there; the app no longer reads those columns.
        for column_name in (
            "personal_tasks_done",
            "is_completed",
            "is_team_project_done",
            "requires_attention",
            "is_tech_linked",
        ):
            if column_name in trainee_columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE trainees DROP COLUMN {column_name}"))

    tables_to_drop = ["progress_snapshots"]
    if engine.dialect.name in {"mysql", "mariadb"}:
        tables_to_drop.append("level_settings")
    for table_name in tables_to_drop:
        if inspect(engine).has_table(table_name):
            Table(table_name, MetaData(), autoload_with=engine).drop(bind=engine, checkfirst=True)

    if engine.dialect.name == "sqlite" and inspect(engine).has_table("level_settings"):
        logger.info("SQLite keeps the legacy level_settings FK table; MySQL migration removes it")


def run_schema_migrations():
    """Apply compatibility upgrades in the established dependency order."""
    ensure_team_project_status_timestamp()
    ensure_schedule_event_compatibility()
    migrate_legacy_schedules()
    migrate_project_memos_to_board_memos()
    migrate_legacy_team_moves()
    ensure_record_updated_timestamps()
    drop_facilitator_memo_obsolete_columns()
    migrate_crawl_progress_schema()
    for model, index_name in (
        (models.Team, "ix_teams_cohort_name"),
        (models.Trainee, "ix_trainees_cohort_team"),
        (models.TeamProject, "ix_team_projects_cohort_team_level"),
    ):
        next(index for index in model.__table__.indexes if index.name == index_name).create(
            bind=engine, checkfirst=True
        )


def initialize_schema():
    """Create missing tables and apply upgrades before serving API traffic."""
    Base.metadata.create_all(bind=engine)
    run_schema_migrations()


if __name__ == "__main__":
    initialize_schema()
