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


def _invite_html(company: Company, emp: Employee, iv: Interview, link: str) -> tuple[str, str]:
    first = (emp.name or "").split(" ")[0] or "there"
    subject = f"Quick check-in with Agora — {iv.scheduled_at.strftime('%a %b %d, %H:%M')}"
    body = f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#0B0D10;">
      <p>Hi {first},</p>
      <p>This is a 10–15 minute voice chat with Agora, the AI colleague at {company.name}.
      It helps leadership understand what's actually working and what's getting in the way.</p>
      <p><strong>When:</strong> {iv.scheduled_at.strftime('%A %b %d, %Y at %H:%M %Z')}</p>
      <p><a href="{link}" style="display:inline-block;padding:10px 16px;background:#0B0D10;color:#fff;text-decoration:none;border-radius:6px;">Join the interview</a></p>
      <p style="color:#44505C;font-size:13px;">The .ics attachment adds it to your calendar.</p>
    </div>
    """.strip()
    return subject, body


def send_invite(db: Session, company: Company, emp: Employee, iv: Interview) -> None:
    link = _interview_link(iv.link_token)
    _ics_text, ics_b64 = build_ics(company, emp, iv, link)
    subject, body_html = _invite_html(company, emp, iv, link)
    result = _send_email(
        company=company,
        to=emp.email,
        subject=subject,
        body_html=body_html,
        loops_fallback_id="agora_interview_invite",
        loops_vars={
            "employee_first_name": (emp.name or "").split(" ")[0],
            "company_name": company.name,
            "scheduled_at": iv.scheduled_at.isoformat(),
            "interview_link": link,
        },
        ics_b64=ics_b64,
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
            first = (emp.name or "").split(" ")[0] or "there"
            _send_email(
                company=company,
                to=emp.email,
                subject="Reminder — Agora interview in 15 min",
                body_html=f'<p>Hi {first}, your Agora check-in starts in about 15 minutes.</p><p><a href="{link}">Join</a></p>',
                loops_fallback_id="agora_interview_reminder",
                loops_vars={
                    "employee_first_name": first,
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
                _send_email(
                    company=company,
                    to=company.admin_email,
                    subject=f"{emp.name} missed two interviews",
                    body_html=f"<p>{emp.name} has missed two consecutive interviews. Consider reaching out directly.</p>",
                    loops_fallback_id="agora_admin_noshow",
                    loops_vars={
                        "employee_name": emp.name,
                        "company_name": company.name,
                    },
                )
        db.commit()
