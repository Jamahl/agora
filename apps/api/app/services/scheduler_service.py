from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.clients.loops_client import send_transactional
from app.config import get_settings
from app.logging_conf import log
from app.models import Company, Employee, Interview
from app.services.ics_gen import build_ics
from app.services.slot_picker import next_free_slot


def _interview_link(token: str) -> str:
    return f"{get_settings().web_base_url.rstrip('/')}/interview/{token}"


def _taken(db: Session, employee_id: int) -> list[datetime]:
    rows = list(
        db.execute(
            select(Interview.scheduled_at).where(
                Interview.employee_id == employee_id,
                Interview.status.in_(("scheduled", "in_progress")),
            )
        ).scalars()
    )
    return [r for r in rows if r]


def _needs_schedule(db: Session, company: Company, emp: Employee) -> bool:
    latest = db.execute(
        select(Interview)
        .where(Interview.employee_id == emp.id)
        .order_by(desc(Interview.scheduled_at))
        .limit(1)
    ).scalar_one_or_none()
    if not latest:
        return True
    if latest.status in ("scheduled", "in_progress"):
        return False
    if latest.ended_at and (
        datetime.now(timezone.utc) - latest.ended_at > timedelta(days=company.cadence_days)
    ):
        return True
    if latest.status == "completed" and not latest.ended_at:
        return False
    if latest.status == "no_show":
        return True
    return False


def schedule_for_employee(
    db: Session, company: Company, emp: Employee, research_request_id: int | None = None
) -> Interview:
    now = datetime.now(timezone.utc)
    slot = next_free_slot(
        now,
        company.timezone,
        list(company.weekdays or [0, 1, 2, 3, 4]),
        company.window_start_hour,
        company.window_end_hour,
        _taken(db, emp.id),
    )
    token = secrets.token_urlsafe(32)
    iv = Interview(
        employee_id=emp.id,
        company_id=company.id,
        scheduled_at=slot,
        status="scheduled",
        link_token=token,
        research_request_id=research_request_id,
    )
    db.add(iv)
    db.commit()
    db.refresh(iv)
    send_invite(db, company, emp, iv)
    return iv


def send_invite(db: Session, company: Company, emp: Employee, iv: Interview) -> None:
    link = _interview_link(iv.link_token)
    ics_text, ics_b64 = build_ics(company, emp, iv, link)
    result = send_transactional(
        email=emp.email,
        transactional_id="agora_interview_invite",
        data_variables={
            "employee_first_name": (emp.name or "").split(" ")[0],
            "company_name": company.name,
            "scheduled_at": iv.scheduled_at.isoformat(),
            "interview_link": link,
        },
        attachments=[
            {
                "filename": "agora-interview.ics",
                "contentType": "text/calendar",
                "data": ics_b64,
            }
        ],
    )
    log.info("invite_sent", interview_id=iv.id, result=result)


def run_cadence_now(db: Session, company: Company) -> int:
    count = 0
    for emp in db.execute(
        select(Employee).where(Employee.company_id == company.id, Employee.status == "active")
    ).scalars():
        if _needs_schedule(db, company, emp):
            schedule_for_employee(db, company, emp)
            count += 1
    return count


def daily_cadence_job() -> None:
    from app.db import SessionLocal

    with SessionLocal() as db:
        for company in db.execute(select(Company)).scalars():
            if not company.onboarding_completed_at:
                continue
            run_cadence_now(db, company)


def reminder_and_noshow_job() -> None:
    from app.db import SessionLocal

    with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        upcoming = list(
            db.execute(
                select(Interview).where(
                    Interview.status == "scheduled",
                    Interview.reminder_sent_at.is_(None),
                    Interview.scheduled_at <= now + timedelta(minutes=15),
                    Interview.scheduled_at > now - timedelta(minutes=30),
                )
            ).scalars()
        )
        for iv in upcoming:
            emp = db.get(Employee, iv.employee_id)
            company = db.get(Company, iv.company_id)
            link = _interview_link(iv.link_token)
            send_transactional(
                email=emp.email,
                transactional_id="agora_interview_reminder",
                data_variables={
                    "employee_first_name": (emp.name or "").split(" ")[0],
                    "interview_link": link,
                    "scheduled_at": iv.scheduled_at.isoformat(),
                },
            )
            iv.reminder_sent_at = now
        db.commit()

        missed = list(
            db.execute(
                select(Interview).where(
                    Interview.status == "scheduled",
                    Interview.scheduled_at < now - timedelta(minutes=30),
                )
            ).scalars()
        )
        for iv in missed:
            iv.status = "no_show"
            emp = db.get(Employee, iv.employee_id)
            company = db.get(Company, iv.company_id)
            # reschedule immediately
            schedule_for_employee(db, company, emp)
            # after two consecutive no-shows, alert admin
            recent = list(
                db.execute(
                    select(Interview)
                    .where(Interview.employee_id == emp.id)
                    .order_by(desc(Interview.scheduled_at))
                    .limit(3)
                ).scalars()
            )
            if len([r for r in recent if r.status == "no_show"]) >= 2 and company.admin_email:
                send_transactional(
                    email=company.admin_email,
                    transactional_id="agora_admin_noshow",
                    data_variables={
                        "employee_name": emp.name,
                        "company_name": company.name,
                    },
                )
        db.commit()
