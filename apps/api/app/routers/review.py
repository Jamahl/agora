from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Company, Employee, Insight, Interview
from app.security import get_current_company

router = APIRouter(prefix="/review", tags=["review"])


@router.get("")
def list_pending(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    q = (
        select(Insight, Employee, Interview)
        .join(Employee, Employee.id == Insight.employee_id)
        .join(Interview, Interview.id == Insight.interview_id)
        .where(Insight.company_id == company.id, Insight.review_state == "needs_review")
        .order_by(Insight.created_at.desc())
    )
    rows = list(db.execute(q).all())
    return [
        {
            "id": i.id,
            "content": i.content,
            "type": i.type,
            "severity": i.severity,
            "created_at": i.created_at,
            "employee": {"id": e.id, "name": e.name},
            "interview": {"id": iv.id, "scheduled_at": iv.scheduled_at},
        }
        for i, e, iv in rows
    ]


@router.post("/{insight_id}/approve")
def approve(
    insight_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    ins = db.get(Insight, insight_id)
    if not ins or ins.company_id != company.id:
        raise HTTPException(404)
    ins.review_state = "live"
    if ins.embedding is None:
        from app.clients.openai_client import embed

        ins.embedding = embed(ins.content)
    db.commit()
    return {"ok": True}


@router.post("/{insight_id}/suppress")
def suppress(
    insight_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    ins = db.get(Insight, insight_id)
    if not ins or ins.company_id != company.id:
        raise HTTPException(404)
    ins.review_state = "suppressed"
    db.commit()
    return {"ok": True}
