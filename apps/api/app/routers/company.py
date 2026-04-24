from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.db import get_db
from app.models import Company
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
