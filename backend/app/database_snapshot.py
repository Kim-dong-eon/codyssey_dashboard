"""Export every table from the configured local database to a private JSON file.

This is a data snapshot for migration review, not an automatic cross-dialect
restore program. Use app.trainee_transfer for the initial roster import.
"""

import argparse
import base64
import json
import os
from datetime import date, datetime, time, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import MetaData, create_engine, inspect, select
from sqlalchemy.exc import SQLAlchemyError

from app.database import SQLALCHEMY_DATABASE_URL, normalize_database_url


def _json_value(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (date, datetime, time)):
        return {"type": type(value).__name__, "value": value.isoformat()}
    if isinstance(value, Decimal):
        return {"type": "Decimal", "value": str(value)}
    if isinstance(value, bytes):
        return {"type": "bytes/base64", "value": base64.b64encode(value).decode("ascii")}
    raise TypeError(f"Unsupported database value type: {type(value).__name__}")


def export_database(engine, output_path):
    """Read all tables using reflection; never mutate the source database."""
    metadata = MetaData()
    metadata.reflect(bind=engine)
    tables = {}
    with engine.connect() as connection:
        for table in metadata.sorted_tables:
            rows = connection.execute(select(table)).mappings()
            tables[table.name] = {
                "columns": [
                    {"name": column.name, "type": str(column.type), "primary_key": column.primary_key}
                    for column in table.columns
                ],
                "rows": [
                    {key: _json_value(value) for key, value in row.items()}
                    for row in rows
                ],
            }
    payload = {
        "format_version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source_dialect": engine.dialect.name,
        "tables": tables,
    }
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("x", encoding="utf-8") as output:
        json.dump(payload, output, ensure_ascii=False, indent=2)
        output.write("\n")
    return {name: len(data["rows"]) for name, data in tables.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--local", action="store_true", help="Use backend/.env (or DATABASE_URL)")
    args = parser.parse_args()
    url = SQLALCHEMY_DATABASE_URL if args.local else os.getenv("SOURCE_DATABASE_URL")
    if not url:
        parser.error("Set SOURCE_DATABASE_URL or use --local")
    engine = create_engine(normalize_database_url(url), pool_pre_ping=True)
    try:
        try:
            counts = export_database(engine, args.output)
        except SQLAlchemyError as error:
            parser.exit(2, f"Database operation failed ({type(error).__name__})\n")
    finally:
        engine.dispose()
    print(f"exported {len(counts)} tables, {sum(counts.values())} rows")
    for name, count in counts.items():
        print(f"  {name}: {count}")


if __name__ == "__main__":
    main()
