from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.clients.composio_client import send_gmail
from app.clients.loops_client import send_transactional
from app.config import get_settings
from app.logging_conf import log
from app.models import Company, Employee, Interview
from app.services.email_templates import get_template, render
from app.services.ics_gen import build_ics
from app.services.slot_picker import next_free_slot


def _composio_user_id(company: Company) -> str:
    return f"company_{company.id}"


def _send_email(
    company: Company,
    to: str,
    subject: str,
    body_html: str,
    loops_fallback_id: str,
    loops_vars: dict,
    ics_b64: str | None = None,
) -> dict:
    if company.gmail_connection_id:
        attachments = None
        if ics_b64:
            attachments = [
                {
                    "filename": "agora-interview.ics",
                    "mime_type": "text/calendar",
                    "data_base64": ics_b64,
                }
            ]
        result = send_gmail(
            user_id=_composio_user_id(company),
            recipient=to,
            subject=subject,
            body_html=body_html,
            attachments_b64=attachments,
        )
        if not result.get("error"):
            return {"channel": "gmail", **result}
        log.warning("gmail_send_failed", error=result.get("error"))
    return {
        "channel": "loops",
        **send_transactional(
            email=to,
            transactional_id=loops_fallback_id,
            data_variables=loops_vars,
            attachments=(
                [{"filename": "agora-interview.ics", "contentType": "text/calendar", "data": ics_b64}]
                if ics_b64
                else None
            ),
        ),
    }


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


def _base_vars(company: Company, emp: Employee, iv: Interview, link: str) -> dict:
    return {
        "employee_first_name": (emp.name or "").split(" ")[0] or "there",
        "employee_name": emp.name or "",
        "company_name": company.name,
        "interview_link": link,
        "scheduled_at_short": iv.scheduled_at.strftime("%a %b %d, %H:%M"),
        "scheduled_at_long": iv.scheduled_at.strftime("%A %b %d, %Y at %H:%M %Z"),
    }


def send_invite(db: Session, company: Company, emp: Employee, iv: Interview) -> dict:
    link = _interview_link(iv.link_token)
    _ics_text, ics_b64 = build_ics(company, emp, iv, link)
    tpl = get_template(company.email_templates, "invite")
    vars_ = _base_vars(company, emp, iv, link)
    subject = render(tpl["subject"], vars_)
    body_html = render(tpl["body_html"], vars_)
    result = _send_email(
        company=company,
        to=emp.email,
        subject=subject,
        body_html=body_html,
        loops_fallback_id="agora_interview_invite",
        loops_vars=vars_,
        ics_b64=ics_b64,
    )
    from datetime import datetime, timezone

    iv.invite_sent_at = datetime.now(timezone.utc)
    db.commit()
    log.info("invite_sent", interview_id=iv.id, result=result)
    return result


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
            tpl = get_template(company.email_templates, "reminder")
            vars_ = _base_vars(company, emp, iv, link)
            _send_email(
                company=company,
                to=emp.email,
                subject=render(tpl["subject"], vars_),
                body_html=render(tpl["body_html"], vars_),
                loops_fallback_id="agora_interview_reminder",
                loops_vars=vars_,
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
                tpl = get_template(company.email_templates, "noshow_admin")
                nvars = {"employee_name": emp.name or "", "company_name": company.name}
                _send_email(
                    company=company,
                    to=company.admin_email,
                    subject=render(tpl["subject"], nvars),
                    body_html=render(tpl["body_html"], nvars),
                    loops_fallback_id="agora_admin_noshow",
                    loops_vars=nvars,
                )
        db.commit()
