from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.loops_client import send_transactional
from app.clients.openai_client import structured
from app.models import Company, Employee, Insight, Interview, ResearchRequest
from pydantic import BaseModel


class _Report(BaseModel):
    exec_summary: str
    findings: list[str]
    recommendations: list[str]
    supporting_quotes: list[str]


SYSTEM = (
    "You are writing a research report for leadership based on employee interviews. "
    "Be factual, concrete, cite specifics. No hype. "
    "exec_summary: 2-4 sentences. findings: 3-6 bullets. recommendations: 2-5 bullets. supporting_quotes: up to 8 short direct quotes."
)


def rebuild_report(db: Session, research_request_id: int) -> None:
    rr = db.get(ResearchRequest, research_request_id)
    if not rr:
        return
    completed_ivs = list(
        db.execute(
            select(Interview).where(
                Interview.research_request_id == rr.id,
                Interview.status == "completed",
            )
        ).scalars()
    )
    total_ivs = db.execute(
        select(Interview).where(Interview.research_request_id == rr.id)
    ).scalars().all()
    if not completed_ivs:
        return
    lines: list[str] = []
    interview_ids = []
    for iv in completed_ivs:
        emp = db.get(Employee, iv.employee_id)
        interview_ids.append(iv.id)
        insights = list(
            db.execute(
                select(Insight).where(
                    Insight.interview_id == iv.id, Insight.review_state == "live"
                )
            ).scalars()
        )
        for i in insights:
            quote = f" (quote: \"{i.direct_quote}\")" if i.direct_quote else ""
            lines.append(f"- [{emp.name} / {emp.department or '?'}] [{i.type}] {i.content}{quote}")

    material = "\n".join(lines) or "(no material)"
    parsed = structured(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Research question: {rr.question}\n\nMaterial:\n{material}"},
        ],
        _Report,
        temperature=0.3,
    )
    rr.report_json = {
        "exec_summary": parsed.exec_summary,
        "findings": parsed.findings,
        "recommendations": parsed.recommendations,
        "supporting_quotes": parsed.supporting_quotes,
        "interview_ids": interview_ids,
        "progress": f"{len(completed_ivs)}/{len(total_ivs)}",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    # status transitions
    if len(total_ivs) and len(completed_ivs) >= len(total_ivs):
        rr.status = "complete"
    # threshold notification
    if (
        not rr.notified_at
        and len(total_ivs)
        and len(completed_ivs) / len(total_ivs) >= (rr.notify_threshold or 0.75)
    ):
        company = db.get(Company, rr.company_id)
        if company and company.admin_email:
            send_transactional(
                email=company.admin_email,
                transactional_id="agora_research_ready",
                data_variables={
                    "question": rr.question,
                    "research_id": str(rr.id),
                    "progress": rr.report_json["progress"],
                },
            )
        rr.notified_at = datetime.now(timezone.utc)

    db.commit()
