"""Offline checks for the Vercel cron and first-time roster seed."""

import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["ENABLE_SCHEDULER"] = "false"

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base, normalize_database_url
from app.main import app, lifespan
from app import models
from app.routers.cron import crawl_missions
from app.services import crawl
from app.services.crawl_config import COHORT_CONFIGS
from app.services.crawl_parser import parse_personal_mission, parse_team_mission
from app.services.crawl_persistence import CrawlPersistence
from app.trainee_transfer import _advance_postgres_sequences, export_roster, import_roster


class TransferTests(unittest.TestCase):
    def setUp(self):
        self.source = create_engine("sqlite:///:memory:")
        self.target = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.source)
        Base.metadata.create_all(self.target)
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.snapshot = Path(self.temp.name) / "roster.json"
        with Session(self.source) as db:
            db.add(models.Cohort(cohort_id=1, cohort_name="1기"))
            db.add(models.Team(team_id=42, cohort_id=1, team_name="A팀"))
            db.add(models.Trainee(
                trainee_id=99, cohort_id=1, team_id=42, name="교육생",
                email="student@example.com", phone="010-1234-5678", is_dropped=False,
            ))
            db.add(models.TraineeFlag(trainee_id=99, requires_attention=True))
            db.commit()

    def tearDown(self):
        self.source.dispose()
        self.target.dispose()
        self.temp.cleanup()

    def test_dry_run_apply_and_repeat(self):
        self.assertEqual(export_roster(self.source, self.snapshot),
                         {"cohorts": 1, "teams": 1, "trainees": 1})
        exported = json.loads(self.snapshot.read_text(encoding="utf-8"))
        self.assertEqual(exported["format_version"], 2)
        self.assertNotIn("flags", exported)
        self.assertEqual(import_roster(self.target, self.snapshot),
                         {"cohorts": 1, "teams": 1, "trainees": 1})
        with Session(self.target) as db:
            self.assertEqual(db.query(models.Trainee).count(), 0)
        self.assertEqual(import_roster(self.target, self.snapshot, apply=True)["trainees"], 1)
        self.assertEqual(import_roster(self.target, self.snapshot, apply=True)["trainees"], 0)
        with Session(self.target) as db:
            trainee = db.get(models.Trainee, 99)
            self.assertEqual((trainee.team_id, trainee.email), (42, "student@example.com"))
            self.assertIsNone(db.get(models.TraineeFlag, 99))
            db.add(models.Trainee(cohort_id=1, name="다음 교육생"))
            db.commit()
            self.assertGreater(db.query(models.Trainee).order_by(models.Trainee.trainee_id.desc()).first().trainee_id, 99)

    def test_postgres_sequence_alignment_targets_only_imported_tables(self):
        db = Mock()
        _advance_postgres_sequences(db, {"cohorts": 1, "teams": 0, "trainees": 2})
        self.assertEqual(db.execute.call_count, 2)
        self.assertEqual(
            [call.args[1] for call in db.execute.call_args_list],
            [
                {"table_name": "cohorts", "column_name": "cohort_id"},
                {"table_name": "trainees", "column_name": "trainee_id"},
            ],
        )
        self.assertTrue(all("setval" in str(call.args[0]) for call in db.execute.call_args_list))

    def test_legacy_snapshot_imports_roster_without_flags(self):
        export_roster(self.source, self.snapshot)
        payload = json.loads(self.snapshot.read_text(encoding="utf-8"))
        payload["format_version"] = 1
        payload["flags"] = [{"trainee_id": 99, "requires_attention": True, "is_tech_linked": True}]
        self.snapshot.write_text(json.dumps(payload), encoding="utf-8")
        self.assertEqual(import_roster(self.target, self.snapshot, apply=True),
                         {"cohorts": 1, "teams": 1, "trainees": 1})
        with Session(self.target) as db:
            self.assertIsNone(db.get(models.TraineeFlag, 99))

    def test_rejects_wrong_cohort_team(self):
        export_roster(self.source, self.snapshot)
        payload = json.loads(self.snapshot.read_text(encoding="utf-8"))
        payload["teams"][0]["cohort_id"] = 2
        self.snapshot.write_text(json.dumps(payload), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "missing cohort"):
            import_roster(self.target, self.snapshot, apply=True)

    def test_email_conflict_does_not_reveal_address(self):
        export_roster(self.source, self.snapshot)
        with Session(self.target) as db:
            db.add(models.Cohort(cohort_id=1, cohort_name="1기"))
            db.add(models.Trainee(
                trainee_id=5, cohort_id=1, name="대상 DB 교육생", email="student@example.com"
            ))
            db.commit()
        with self.assertRaises(ValueError) as conflict:
            import_roster(self.target, self.snapshot, apply=True)
        self.assertEqual(str(conflict.exception), "Trainee email conflict")


class CronTests(unittest.TestCase):
    def test_authorization_and_dispatch(self):
        with patch.dict(os.environ, {"VERCEL": "1", "CRON_SECRET": "test-secret"}), \
             patch("app.routers.cron.run_all_crawling_and_sync", return_value={"cohorts": []}) as run:
            self.assertIn("/api/cron/crawl", {route.path for route in app.routes})
            with self.assertRaises(HTTPException) as unauthorized:
                crawl_missions(authorization=None, cohort_id=1)
            self.assertEqual(unauthorized.exception.status_code, 401)
            self.assertEqual(crawl_missions(authorization="Bearer test-secret", cohort_id=1),
                             {"cohorts": []})
            run.assert_called_once_with(cohort_id=1)

    def test_collection_failure_does_not_write(self):
        class FakeSession:
            def close(self):
                pass

        config = {"active": True, "team_missions": [{"label": "1-1"}], "personal_missions": []}
        with patch.dict(crawl.COHORT_CONFIGS, {1: config}, clear=True), \
             patch.object(crawl, "make_session", return_value=FakeSession()), \
             patch.object(crawl, "fetch_with_retry", side_effect=RuntimeError("page failed")), \
             patch.object(crawl, "persist_cohort") as persist:
            with self.assertRaises(RuntimeError):
                crawl.run_all_crawling_and_sync(cohort_id=1)
            persist.assert_not_called()

    def test_empty_pages_skip_cohort_persistence(self):
        class FakeSession:
            def close(self):
                pass

        html = '<div class="card uqstn"><ul id="misTeamList_1"></ul></div>'
        with patch.object(crawl, "make_session", return_value=FakeSession()), \
             patch.object(crawl, "fetch_with_retry", side_effect=lambda session, mission, parser: parser(html, mission)), \
             patch.object(crawl.time, "sleep"), \
             patch.object(crawl, "log"), \
             patch.object(crawl, "persist_cohort") as persist:
            with self.assertRaisesRegex(RuntimeError, "15개 미션 수집 실패"):
                crawl.run_all_crawling_and_sync(cohort_id=1)
            persist.assert_not_called()

    def test_postgres_url_normalization(self):
        self.assertEqual(normalize_database_url("postgres://host/db"),
                         "postgresql+psycopg://host/db")

    def test_missing_secret_and_crawl_failure(self):
        with patch.dict(os.environ, {"CRON_SECRET": ""}):
            with self.assertRaises(HTTPException) as missing_secret:
                crawl_missions(authorization="Bearer anything", cohort_id=1)
        self.assertEqual(missing_secret.exception.status_code, 503)
        with patch.dict(os.environ, {"CRON_SECRET": "test-secret"}), \
             patch("app.routers.cron.run_all_crawling_and_sync", side_effect=RuntimeError("crawl failed")):
            with self.assertRaises(HTTPException) as failed_crawl:
                crawl_missions(authorization="Bearer test-secret", cohort_id=1)
        self.assertEqual(failed_crawl.exception.status_code, 500)


class VercelStartupTests(unittest.TestCase):
    def test_vercel_skips_schema_and_background_scheduler(self):
        # The lifespan has no awaits; drive its two coroutine steps without
        # creating an event loop in this offline test.
        def complete(coroutine):
            with self.assertRaises(StopIteration):
                coroutine.send(None)

        with patch.dict(os.environ, {"VERCEL": "1"}), \
             patch("app.main.initialize_schema") as initialize, \
             patch("app.main.start_scheduler") as start, \
             patch("app.main.scheduler") as scheduler:
            scheduler.running = False
            context = lifespan(app)
            complete(context.__aenter__())
            complete(context.__aexit__(None, None, None))
            initialize.assert_not_called()
            start.assert_not_called()


class CrawlDataTests(unittest.TestCase):
    def test_empty_mission_pages_are_not_successful_snapshots(self):
        html = '<div class="card uqstn"><ul id="misTeamList_1"></ul></div>'
        mission = {"level": 1, "label": "1-1"}
        with self.assertRaisesRegex(RuntimeError, "팀 목록이 비어"):
            parse_team_mission(html, mission)
        with self.assertRaisesRegex(RuntimeError, "교육생 목록이 비어"):
            parse_personal_mission(html, mission)
        self.assertEqual(parse_team_mission(html, {**mission, "allow_empty": True})["teams"], [])

    def test_all_configured_missions_reject_an_empty_page(self):
        html = '<div class="card uqstn"><ul id="misTeamList_1"></ul></div>'
        missions = COHORT_CONFIGS[1]["team_missions"] + COHORT_CONFIGS[1]["personal_missions"]
        self.assertEqual(len(missions), 15)
        for mission in missions:
            parser = parse_team_mission if mission in COHORT_CONFIGS[1]["team_missions"] else parse_personal_mission
            with self.subTest(label=mission["label"], parser=parser.__name__):
                with self.assertRaises(RuntimeError):
                    parser(html, mission)

    def test_team_status_date_changes_only_with_project_data(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        try:
            with Session(engine) as db:
                db.add(models.Cohort(cohort_id=1, cohort_name="1기"))
                db.commit()
                mission = {"level": 1, "label": "1-1", "teams": [{
                    "team_sn": "42", "team_name": "A팀", "status": "미션 시작", "members": [],
                }]}
                first = datetime(2026, 10, 18, 9, 0)
                persistence = CrawlPersistence(db, 1)
                persistence.checked_at = first
                self.assertEqual(persistence.save_team_results([mission]), 1)
                db.commit()
                project = db.query(models.TeamProject).one()
                self.assertEqual(project.status_changed_date, first)

                persistence = CrawlPersistence(db, 1)
                persistence.checked_at = datetime(2026, 10, 19, 9, 0)
                self.assertEqual(persistence.save_team_results([mission]), 0)
                db.commit()
                db.refresh(project)
                self.assertEqual(project.status_changed_date, first)

                mission["teams"][0]["status"] = "미션 완료"
                changed = datetime(2026, 10, 20, 9, 0)
                persistence = CrawlPersistence(db, 1)
                persistence.checked_at = changed
                self.assertEqual(persistence.save_team_results([mission]), 1)
                db.commit()
                db.refresh(project)
                self.assertEqual(project.status_changed_date, changed)
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
