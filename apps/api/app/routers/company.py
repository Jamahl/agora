from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Company
from app.schemas import CompanyIn, CompanyOut, CompanyCadenceIn
from app.security import get_current_company

router = APIRouter(prefix="/admin/company", tags=["company"])


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
