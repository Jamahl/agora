from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AdminAlert, Company
from app.security import get_current_company

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
def list_alerts(
    status: str | None = "unread",
    interview_id: int | None = None,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    q = select(AdminAlert).where(AdminAlert.company_id == company.id)
    if status:
        q = q.where(AdminAlert.status == status)
    if interview_id:
        q = q.where(AdminAlert.interview_id == interview_id)
    q = q.order_by(AdminAlert.created_at.desc())
    return [
        {
            "id": a.id,
            "category": a.category,
            "summary": a.summary,
            "interview_id": a.interview_id,
            "status": a.status,
            "created_at": a.created_at,
            "acknowledged_at": a.acknowledged_at,
        }
        for a in db.execute(q).scalars()
    ]


@router.post("/{alert_id}/acknowledge")
def acknowledge(
    alert_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    a = db.get(AdminAlert, alert_id)
    if not a or a.company_id != company.id:
        raise HTTPException(404)
    a.status = "acknowledged"
    a.acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}
