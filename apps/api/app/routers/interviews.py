from __future__ import annotations

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Company, Employee, Insight, Interview, InterviewSentiment
from app.schemas import InterviewOut, InsightOut
from app.security import get_current_company
from app.services.retell_service import build_web_call

router = APIRouter(tags=["interviews"])


class PublicInterview(BaseModel):
    employee_first_name: str
    company_name: str
    scheduled_at: datetime
    link_token: str
    is_first_interview: bool


class StartCallOut(BaseModel):
    access_token: str
    call_id: str


@router.get("/interviews/by-token/{token}", response_model=PublicInterview)
def by_token(token: str, db: Session = Depends(get_db)) -> PublicInterview:
    iv = db.execute(select(Interview).where(Interview.link_token == token)).scalar_one_or_none()
    if not iv:
        raise HTTPException(404, "Unknown token")
    now = datetime.now(timezone.utc)
    if now > iv.scheduled_at + timedelta(hours=24):
        raise HTTPException(410, "Link expired")
    if now < iv.scheduled_at - timedelta(hours=1):
        raise HTTPException(425, "Too early")
    emp = db.get(Employee, iv.employee_id)
    company = db.get(Company, iv.company_id)
    prior = db.execute(
        select(Interview)
        .where(
            Interview.employee_id == emp.id,
            Interview.status == "completed",
            Interview.id != iv.id,
        )
        .limit(1)
    ).scalar_one_or_none()
    return PublicInterview(
        employee_first_name=(emp.name or "").split(" ")[0],
        company_name=company.name,
        scheduled_at=iv.scheduled_at,
        link_token=iv.link_token,
        is_first_interview=prior is None,
    )


@router.post("/interviews/by-token/{token}/start", response_model=StartCallOut)
def start_call(token: str, db: Session = Depends(get_db)) -> StartCallOut:
    iv = db.execute(select(Interview).where(Interview.link_token == token)).scalar_one_or_none()
    if not iv:
        raise HTTPException(404)
    if iv.status == "completed":
        raise HTTPException(409, "Already completed")
    emp = db.get(Employee, iv.employee_id)
    company = db.get(Company, iv.company_id)
    access_token, call_id = build_web_call(db, company, emp, iv)
    iv.started_at = datetime.now(timezone.utc)
    iv.retell_call_id = call_id
    iv.status = "in_progress"
    db.commit()
    return StartCallOut(access_token=access_token, call_id=call_id)


@router.get("/interviews", response_model=list[InterviewOut])
def list_interviews(
    employee_id: int | None = None,
    status: str | None = None,
    limit: int = 100,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[Interview]:
    q = select(Interview).where(Interview.company_id == company.id)
    if employee_id:
        q = q.where(Interview.employee_id == employee_id)
    if status:
        q = q.where(Interview.status == status)
    q = q.order_by(desc(Interview.scheduled_at)).limit(limit)
    return list(db.execute(q).scalars())


@router.get("/interviews/{interview_id}", response_model=dict)
def interview_detail(
    interview_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    iv = db.get(Interview, interview_id)
    if not iv or iv.company_id != company.id:
        raise HTTPException(404)
    insights = list(
        db.execute(
            select(Insight)
            .where(Insight.interview_id == iv.id, Insight.review_state != "omitted")
            .order_by(desc(Insight.severity))
        ).scalars()
    )
    sent = db.get(InterviewSentiment, iv.id)
    return {
        "id": iv.id,
        "employee_id": iv.employee_id,
        "scheduled_at": iv.scheduled_at,
        "started_at": iv.started_at,
        "ended_at": iv.ended_at,
        "status": iv.status,
        "cleaned_transcript": iv.cleaned_transcript_json,
        "corrected_summary": iv.corrected_summary,
        "insights": [InsightOut.model_validate(i).model_dump() for i in insights],
        "sentiment": (
            {
                "morale": sent.morale,
                "energy": sent.energy,
                "candor": sent.candor,
                "urgency": sent.urgency,
                "notes": sent.notes,
            }
            if sent
            else None
        ),
    }
