from __future__ import annotations

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings
from app.logging_conf import log

_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        s = get_settings()
        jobstore = SQLAlchemyJobStore(url=s.database_url)
        _scheduler = BackgroundScheduler(jobstores={"default": jobstore}, timezone="UTC")
    return _scheduler


def start_scheduler() -> None:
    sch = get_scheduler()
    if sch.running:
        return
    sch.add_job(
        "app.services.scheduler_service:daily_cadence_job",
        trigger=CronTrigger(hour=3, minute=0),
        id="daily_cadence",
        replace_existing=True,
    )
    sch.add_job(
        "app.services.scheduler_service:reminder_and_noshow_job",
        trigger=CronTrigger(minute="*/5"),
        id="reminder_noshow",
        replace_existing=True,
    )
    sch.add_job(
        "app.services.themes:cluster_themes_job",
        trigger=CronTrigger(hour=2, minute=0),
        id="theme_cluster",
        replace_existing=True,
    )
    try:
        sch.start()
        log.info("scheduler_started")
    except Exception as e:
        log.warning("scheduler_start_failed", error=str(e))
