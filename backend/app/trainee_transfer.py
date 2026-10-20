"""Export and seed trainees with their required cohorts and teams.

Use separate SOURCE_DATABASE_URL and TARGET_DATABASE_URL environment variables.
The export contains personal information; keep it outside the repository.
"""

import argparse
import json
import os
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import models
from app.database import SQLALCHEMY_DATABASE_URL, normalize_database_url


FORMAT_VERSION = 2
TRAINEE_FIELDS = (
    "trainee_id", "cohort_id", "team_id", "name", "gender", "age", "phone",
    "email", "major", "is_major_related", "education_level", "employment_status",
    "is_dropped", "drop_date", "drop_reason",
)


def _row(model, fields):
    result = {}
    for field in fields:
        value = getattr(model, field)
        result[field] = value.isoformat() if isinstance(value, (date, datetime)) else value
    return result


def export_roster(engine, output_path):
    """Write a private, versioned JSON snapshot without altering the source DB."""
    with Session(engine) as db:
        payload = {
            "format_version": FORMAT_VERSION,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "cohorts": [
                _row(row, ("cohort_id", "cohort_name", "start_date", "end_date"))
                for row in db.query(models.Cohort).order_by(models.Cohort.cohort_id)
            ],
            "teams": [
                _row(row, ("team_id", "cohort_id", "team_name"))
                for row in db.query(models.Team).order_by(models.Team.team_id)
            ],
            "trainees": [
                _row(row, TRAINEE_FIELDS)
                for row in db.query(models.Trainee).order_by(models.Trainee.trainee_id)
            ],
        }
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation avoids silently replacing a previous migration snapshot.
    with output_path.open("x", encoding="utf-8") as output:
        json.dump(payload, output, ensure_ascii=False, indent=2)
        output.write("\n")
    return {key: len(payload[key]) for key in ("cohorts", "teams", "trainees")}


def _unique_ids(rows, key):
    ids = [row[key] for row in rows]
    if any(not isinstance(value, int) or isinstance(value, bool) or value < 1 for value in ids):
        raise ValueError(f"Invalid {key}")
    if len(ids) != len(set(ids)):
        raise ValueError(f"Duplicate {key}")
    return set(ids)


def _validated_payload(input_path):
    with Path(input_path).open(encoding="utf-8") as source:
        payload = json.load(source)
    if payload.get("format_version") not in (1, FORMAT_VERSION):
        raise ValueError("Unsupported roster export format")
    if any(not isinstance(payload.get(key), list) for key in ("cohorts", "teams", "trainees")):
        raise ValueError("Missing roster sections")
    # Version 1 exports also contained flags. Read those snapshots for
    # compatibility, but intentionally do not migrate their optional flags.
    if payload["format_version"] == 1 and not isinstance(payload.get("flags"), list):
        raise ValueError("Missing legacy roster flags")

    cohort_ids = _unique_ids(payload["cohorts"], "cohort_id")
    team_ids = _unique_ids(payload["teams"], "team_id")
    _unique_ids(payload["trainees"], "trainee_id")
    emails = []
    for team in payload["teams"]:
        if team["cohort_id"] not in cohort_ids:
            raise ValueError("Team references a missing cohort")
    teams_by_id = {team["team_id"]: team for team in payload["teams"]}
    for trainee in payload["trainees"]:
        if trainee["cohort_id"] not in cohort_ids:
            raise ValueError("Trainee references a missing cohort")
        team_id = trainee.get("team_id")
        if team_id is not None and (
            team_id not in team_ids or teams_by_id[team_id]["cohort_id"] != trainee["cohort_id"]
        ):
            raise ValueError("Trainee references a team in another cohort")
        email = (trainee.get("email") or "").strip().lower()
        if email:
            emails.append(email)
        if not (trainee.get("name") or "").strip():
            raise ValueError("Trainee name is missing")
    if len(emails) != len(set(emails)):
        raise ValueError("Duplicate trainee email")
    return payload


def _advance_postgres_sequences(db, counts):
    """Keep generated IDs above explicit IDs imported into PostgreSQL."""
    for section, table_name, primary_key in (
        ("cohorts", "cohorts", "cohort_id"),
        ("teams", "teams", "team_id"),
        ("trainees", "trainees", "trainee_id"),
    ):
        if not counts[section]:
            continue
        # These identifiers are constants above, never values from the export.
        # nextval keeps an already-advanced sequence ahead without needing
        # SELECT access to pg_sequences. Run the seed before live writes.
        db.execute(text(f"""
            SELECT setval(
                pg_get_serial_sequence(:table_name, :column_name),
                GREATEST(
                    (SELECT MAX({primary_key}) FROM {table_name}),
                    nextval(pg_get_serial_sequence(:table_name, :column_name))
                ),
                true
            )
        """), {"table_name": table_name, "column_name": primary_key})


def import_roster(engine, input_path, *, apply=False):
    """Preview or add missing rows; never overwrite an existing trainee."""
    payload = _validated_payload(input_path)
    required_tables = {"cohorts", "teams", "trainees"}
    missing = required_tables - set(inspect(engine).get_table_names())
    if missing:
        raise RuntimeError(f"Target schema is missing: {', '.join(sorted(missing))}")

    with Session(engine) as db:
        existing_cohorts = {row.cohort_id: row for row in db.query(models.Cohort)}
        existing_teams = {row.team_id: row for row in db.query(models.Team)}
        existing_trainees = {row.trainee_id: row for row in db.query(models.Trainee)}
        existing_emails = {
            (row.email or "").strip().lower(): row.trainee_id
            for row in existing_trainees.values() if row.email
        }

        for row in payload["cohorts"]:
            old = existing_cohorts.get(row["cohort_id"])
            if old and old.cohort_name != row["cohort_name"]:
                raise ValueError("Cohort ID conflict")
        for row in payload["teams"]:
            old = existing_teams.get(row["team_id"])
            if old and (old.cohort_id, old.team_name) != (row["cohort_id"], row["team_name"]):
                raise ValueError("Team ID conflict")
        for row in payload["trainees"]:
            old = existing_trainees.get(row["trainee_id"])
            email = (row.get("email") or "").strip().lower()
            if old and (old.cohort_id, (old.email or "").strip().lower()) != (row["cohort_id"], email):
                raise ValueError("Trainee ID conflict")
            if email and existing_emails.get(email, row["trainee_id"]) != row["trainee_id"]:
                raise ValueError("Trainee email conflict")

        counts = {
            "cohorts": sum(row["cohort_id"] not in existing_cohorts for row in payload["cohorts"]),
            "teams": sum(row["team_id"] not in existing_teams for row in payload["teams"]),
            "trainees": sum(row["trainee_id"] not in existing_trainees for row in payload["trainees"]),
        }
        if apply:
            for row in payload["cohorts"]:
                if row["cohort_id"] not in existing_cohorts:
                    db.add(models.Cohort(**{
                        **row,
                        "start_date": date.fromisoformat(row["start_date"]) if row.get("start_date") else None,
                        "end_date": date.fromisoformat(row["end_date"]) if row.get("end_date") else None,
                    }))
            db.flush()
            for row in payload["teams"]:
                if row["team_id"] not in existing_teams:
                    db.add(models.Team(**row))
            db.flush()
            for row in payload["trainees"]:
                if row["trainee_id"] not in existing_trainees:
                    values = {field: row.get(field) for field in TRAINEE_FIELDS}
                    values["drop_date"] = date.fromisoformat(values["drop_date"]) if values["drop_date"] else None
                    db.add(models.Trainee(**values))
            db.flush()
            if engine.dialect.name == "postgresql":
                _advance_postgres_sequences(db, counts)
            db.commit()
        return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("export")
    export.add_argument("--output", required=True, type=Path)
    export.add_argument(
        "--local", action="store_true",
        help="Read the database configured in backend/.env (or DATABASE_URL)",
    )
    seed = commands.add_parser("import")
    seed.add_argument("--input", required=True, type=Path)
    seed.add_argument("--apply", action="store_true", help="Commit after the default dry-run preview")
    args = parser.parse_args()
    env_name = "SOURCE_DATABASE_URL" if args.command == "export" else "TARGET_DATABASE_URL"
    url = SQLALCHEMY_DATABASE_URL if args.command == "export" and args.local else os.getenv(env_name)
    if not url:
        parser.error(f"Set {env_name} before running this command, or use export --local")
    engine = create_engine(normalize_database_url(url), pool_pre_ping=True)
    try:
        try:
            counts = export_roster(engine, args.output) if args.command == "export" else import_roster(
                engine, args.input, apply=args.apply
            )
        except SQLAlchemyError as error:
            parser.exit(2, f"Database operation failed ({type(error).__name__})\n")
    finally:
        engine.dispose()
    mode = "exported" if args.command == "export" else ("imported" if args.apply else "would import")
    print(f"{mode}: " + ", ".join(f"{key}={value}" for key, value in counts.items()))


if __name__ == "__main__":
    main()
