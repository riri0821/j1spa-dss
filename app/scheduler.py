"""In-process job scheduler (APScheduler). Runs the incremental ETL on a fixed
interval, recomputes the rule-based alerts, and takes a nightly backup. The
same incremental job is what the dashboard 'Refresh' button calls on demand."""
from __future__ import annotations
import logging
from apscheduler.schedulers.background import BackgroundScheduler

from config import config

log = logging.getLogger("j1spa.scheduler")
_scheduler: BackgroundScheduler | None = None


def _job_incremental():
    from .etl import incremental
    try:
        res = incremental.run(trigger_source="scheduled")
        log.info("incremental ETL: %s", res.get("message"))
    except Exception:
        log.exception("incremental ETL failed")


def _job_rules():
    from .rules import engine
    try:
        res = engine.evaluate_all(persist=True)
        log.info("rules: %s alerts (%s)", res["count"], res["by_type"])
    except Exception:
        log.exception("rules evaluation failed")


def _job_backup():
    from .backup import run_backup
    try:
        res = run_backup()
        log.info("backup: %s", res["files"])
    except Exception:
        log.exception("backup failed")


def start() -> BackgroundScheduler | None:
    global _scheduler
    if not config.SCHEDULER_ENABLED or _scheduler is not None:
        return _scheduler
    s = BackgroundScheduler(timezone="Asia/Manila")
    s.add_job(_job_incremental, "interval", minutes=config.INCREMENTAL_INTERVAL_MIN,
              id="incremental_etl", max_instances=1, coalesce=True)
    s.add_job(_job_rules, "interval", minutes=config.RULES_INTERVAL_MIN,
              id="rules_eval", max_instances=1, coalesce=True)
    s.add_job(_job_backup, "cron", hour=config.BACKUP_HOUR, minute=config.BACKUP_MINUTE,
              id="nightly_backup")
    s.start()
    _scheduler = s
    log.info("scheduler started (incremental every %s min)", config.INCREMENTAL_INTERVAL_MIN)
    return s
