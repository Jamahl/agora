from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.db import get_db
from app.models import Company, CompanyContext
from app.schemas import CompanyIn, CompanyOut, CompanyCadenceIn
from app.security import get_current_company
from app.services.email_templates import DEFAULTS, all_kinds, get_template, known_variables

router = APIRouter(prefix="/admin/company", tags=["company"])


class EmailTemplate(BaseModel):
    subject: str
    body_html: str


class EmailTemplateBundle(BaseModel):
    templates: dict[str, EmailTemplate]


class EmailTemplatesOut(BaseModel):
    templates: dict[str, dict[str, str]]
    defaults: dict[str, dict[str, str]]
    variables: dict[str, list[str]]


class CompanyContextIn(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    scope_type: str = "company"
    scope_id: str | None = None
    is_active: bool = True


def _context_out(row: CompanyContext) -> dict:
    return {
        "id": row.id,
        "label": row.label,
        "content": row.content,
        "scope_type": row.scope_type,
        "scope_id": row.scope_id,
        "is_active": row.is_active,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


@router.get("", response_model=CompanyOut)
def get(company: Company = Depends(get_current_company)) -> Company:
    return company


@router.patch("", response_model=CompanyOut)
def update(
    body: CompanyIn,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> Company:
    company.name = body.name
    company.industry = body.industry
    company.description = body.description
    company.admin_email = body.admin_email
    company.hr_contact = body.hr_contact
    db.commit()
    db.refresh(company)
    return company


@router.patch("/cadence", response_model=CompanyOut)
def update_cadence(
    body: CompanyCadenceIn,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> Company:
    company.cadence_days = body.cadence_days
    company.timezone = body.timezone
    company.window_start_hour = body.window_start_hour
    company.window_end_hour = body.window_end_hour
    company.weekdays = body.weekdays
    db.commit()
    db.refresh(company)
    return company


@router.post("/complete-onboarding", response_model=CompanyOut)
def complete_onboarding(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> Company:
    from app.services.scheduler_service import run_cadence_now

    company.onboarding_completed_at = datetime.utcnow()
    db.commit()
    db.refresh(company)
    run_cadence_now(db, company)
    return company


@router.get("/context")
def list_context(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = list(
        db.execute(
            select(CompanyContext)
            .where(CompanyContext.company_id == company.id)
            .order_by(CompanyContext.created_at.desc())
        ).scalars()
    )
    return [_context_out(row) for row in rows]


@router.post("/context", status_code=201)
def create_context(
    body: CompanyContextIn,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    if body.scope_type not in {"company", "department"}:
        raise HTTPException(400, "scope_type must be company or department")
    row = CompanyContext(
        company_id=company.id,
        label=body.label,
        content=body.content,
        scope_type=body.scope_type,
        scope_id=body.scope_id if body.scope_type == "department" else None,
        is_active=body.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _context_out(row)


@router.patch("/context/{context_id}")
def update_context(
    context_id: int,
    body: CompanyContextIn,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    row = db.get(CompanyContext, context_id)
    if not row or row.company_id != company.id:
        raise HTTPException(404)
    if body.scope_type not in {"company", "department"}:
        raise HTTPException(400, "scope_type must be company or department")
    row.label = body.label
    row.content = body.content
    row.scope_type = body.scope_type
    row.scope_id = body.scope_id if body.scope_type == "department" else None
    row.is_active = body.is_active
    db.commit()
    db.refresh(row)
    return _context_out(row)


@router.delete("/context/{context_id}")
def delete_context(
    context_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    row = db.get(CompanyContext, context_id)
    if not row or row.company_id != company.id:
        raise HTTPException(404)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/email-templates", response_model=EmailTemplatesOut)
def get_email_templates(company: Company = Depends(get_current_company)) -> EmailTemplatesOut:
    merged: dict[str, dict[str, str]] = {k: get_template(company.email_templates, k) for k in all_kinds()}
    return EmailTemplatesOut(
        templates=merged,
        defaults=DEFAULTS,
        variables={k: known_variables(k) for k in all_kinds()},
    )


@router.patch("/email-templates", response_model=EmailTemplatesOut)
def update_email_templates(
    body: EmailTemplateBundle,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> EmailTemplatesOut:
    current: dict[str, Any] = dict(company.email_templates or {})
    for k, v in body.templates.items():
        if k not in DEFAULTS:
            raise HTTPException(400, f"Unknown template: {k}")
        current[k] = {"subject": v.subject, "body_html": v.body_html}
    company.email_templates = current
    flag_modified(company, "email_templates")
    db.commit()
    db.refresh(company)
    merged = {k: get_template(company.email_templates, k) for k in all_kinds()}
    return EmailTemplatesOut(
        templates=merged,
        defaults=DEFAULTS,
        variables={k: known_variables(k) for k in all_kinds()},
    )


@router.post("/email-templates/{kind}/reset", response_model=EmailTemplatesOut)
def reset_email_template(
    kind: str,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> EmailTemplatesOut:
    if kind not in DEFAULTS:
        raise HTTPException(400, f"Unknown template: {kind}")
    current: dict[str, Any] = dict(company.email_templates or {})
    current.pop(kind, None)
    company.email_templates = current
    flag_modified(company, "email_templates")
    db.commit()
    db.refresh(company)
    merged = {k: get_template(company.email_templates, k) for k in all_kinds()}
    return EmailTemplatesOut(
        templates=merged,
        defaults=DEFAULTS,
        variables={k: known_variables(k) for k in all_kinds()},
    )
