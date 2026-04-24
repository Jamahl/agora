from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.clients.openai_client import structured
from app.logging_conf import log
from app.models import Company, Employee, Insight, Interview
from app.services.email_templates import get_template, render
from app.services.scheduler_service import _send_email


class _Summary(BaseModel):
    bullets: list[str]
    next_steps: list[str]


SYSTEM = (
    "You are writing a short, warm email recap for an employee about the voice check-in "
    "they just finished with Agora. Ground everything in what they actually said. "
    "bullets: 3-5 short sentences in THEIR voice of what they raised (wins, frustrations, asks). "
    "next_steps: 1-3 concrete next steps for them or the company, e.g. "
    "'The comment you raised about the pretty remark has been forwarded to HR for follow-up', "
    "'Leadership will review your feedback on the 9am meeting', 'Your next check-in is in 14 days'. "
    "If any insight is flagged for admin review (review_state=needs_review), mention that it's been "
    "sent to leadership for review with care. "
    "Never attribute feelings you can't verify. Keep bullets under 25 words each."
)


def _bullets_html(items: list[str]) -> str:
    if not items:
        return "<p style='color:#44505C'>(none recorded)</p>"
    lis = "".join(f"<li>{b}</li>" for b in items)
    return f"<ul>{lis}</ul>"


def _next_checkin_label(company: Company) -> str:
    days = company.cadence_days or 14
    return f"about {days} days from now"


def send_post_call_summary(db: Session, interview_id: int) -> dict:
    iv = db.get(Interview, interview_id)
    if not iv:
        return {"skipped": "no interview"}
    if iv.summary_sent_at:
        return {"skipped": "already sent"}
    emp = db.get(Employee, iv.employee_id)
    company = db.get(Company, iv.company_id)
    if not emp or not company:
        return {"skipped": "missing emp/company"}

    insights = list(
        db.execute(
            select(Insight).where(Insight.interview_id == iv.id)
        ).scalars()
    )
    if not insights:
        return {"skipped": "no insights"}

    sensitive_flagged = any(i.review_state == "needs_review" for i in insights)
    material_lines = []
    for i in insights:
        flag = " (flagged for admin review)" if i.review_state == "needs_review" else ""
        material_lines.append(f"- [{i.type}] sev={i.severity}{flag}: {i.content}")
    material = "\n".join(material_lines)

    parsed = structured(
        [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": f"Employee first name: {(emp.name or '').split(' ')[0]}\n\nInsights from this interview:\n{material}\n\nSensitive-flagged present: {sensitive_flagged}",
            },
        ],
        _Summary,
        temperature=0.3,
    )

    tpl = get_template(company.email_templates, "summary")
    link = f""  # no specific link; next-checkin date is dynamic
    vars_ = {
        "employee_first_name": (emp.name or "").split(" ")[0] or "there",
        "employee_name": emp.name or "",
        "company_name": company.name,
        "interview_link": "",
        "scheduled_at_short": iv.scheduled_at.strftime("%a %b %d") if iv.scheduled_at else "",
        "scheduled_at_long": iv.scheduled_at.strftime("%A %b %d, %Y") if iv.scheduled_at else "",
        "summary_bullets_html": _bullets_html(parsed.bullets),
        "next_steps_html": _bullets_html(parsed.next_steps),
        "next_checkin_label": _next_checkin_label(company),
    }
    subject = render(tpl["subject"], vars_)
    body_html = render(tpl["body_html"], vars_)
    result = _send_email(
        company=company,
        to=emp.email,
        subject=subject,
        body_html=body_html,
        loops_fallback_id="agora_post_call_summary",
        loops_vars={**vars_, "bullets": parsed.bullets, "next_steps": parsed.next_steps},
    )
    iv.summary_sent_at = datetime.now(timezone.utc)
    db.commit()
    log.info("summary_sent", interview_id=iv.id, result=result)
    return result
