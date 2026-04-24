from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Company, Employee, ResearchRequest
from app.schemas import ResearchIn, ResearchOut, ResearchPlan, ResearchPlanEmployee
from app.security import get_current_company
from app.services.research_agent import draft_plan
from app.services.scheduler_service import schedule_for_employee

router = APIRouter(prefix="/research", tags=["research"])


class PlanEditIn(BaseModel):
    employees: list[ResearchPlanEmployee]
    eta_days: int | None = None


def _to_out(rr: ResearchRequest) -> dict:
    return {
        "id": rr.id,
        "question": rr.question,
        "status": rr.status,
        "plan": rr.plan_json,
        "report": rr.report_json,
        "created_at": rr.created_at,
        "approved_at": rr.approved_at,
    }


@router.get("")
def list_research(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = list(
        db.execute(
            select(ResearchRequest)
            .where(ResearchRequest.company_id == company.id)
            .order_by(ResearchRequest.created_at.desc())
        ).scalars()
    )
    return [_to_out(r) for r in rows]


@router.post("")
def create(
    body: ResearchIn,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    plan = draft_plan(db, company.id, body.question)
    rr = ResearchRequest(
        company_id=company.id,
        question=body.question,
        status="draft",
        plan_json=plan.model_dump(),
    )
    db.add(rr)
    db.commit()
    db.refresh(rr)
    return _to_out(rr)


@router.get("/{research_id}")
def get_research(
    research_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    rr = db.get(ResearchRequest, research_id)
    if not rr or rr.company_id != company.id:
        raise HTTPException(404)
    return _to_out(rr)


@router.patch("/{research_id}/plan")
def edit_plan(
    research_id: int,
    body: PlanEditIn,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    rr = db.get(ResearchRequest, research_id)
    if not rr or rr.company_id != company.id:
        raise HTTPException(404)
    if rr.status not in ("draft",):
        raise HTTPException(409, "Plan is no longer editable")
    valid_ids = set(
        db.execute(
            select(Employee.id).where(
                Employee.company_id == company.id, Employee.status == "active"
            )
        ).scalars()
    )
    emps = [e for e in body.employees if e.employee_id in valid_ids]
    existing = rr.plan_json or {}
    existing["employees"] = [e.model_dump() for e in emps]
    if body.eta_days is not None:
        existing["eta_days"] = body.eta_days
    rr.plan_json = existing
    db.commit()
    return _to_out(rr)


@router.post("/{research_id}/approve")
def approve(
    research_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    rr = db.get(ResearchRequest, research_id)
    if not rr or rr.company_id != company.id:
        raise HTTPException(404)
    if rr.status != "draft":
        raise HTTPException(409, f"Cannot approve from status {rr.status}")
    plan = rr.plan_json or {}
    for entry in plan.get("employees", []):
        emp = db.get(Employee, entry.get("employee_id"))
        if not emp or emp.company_id != company.id or emp.status != "active":
            continue
        schedule_for_employee(db, company, emp, research_request_id=rr.id)
    rr.status = "approved"
    rr.approved_at = datetime.now(timezone.utc)
    db.commit()
    return _to_out(rr)


@router.post("/{research_id}/reject")
def reject(
    research_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    rr = db.get(ResearchRequest, research_id)
    if not rr or rr.company_id != company.id:
        raise HTTPException(404)
    rr.status = "rejected"
    db.commit()
    return _to_out(rr)
