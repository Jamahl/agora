from datetime import datetime
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AdminSession, Company
from app.security import generate_token, set_session_cookie, get_optional_company

router = APIRouter(prefix="/admin/session", tags=["session"])


class SessionState(BaseModel):
    has_session: bool
    onboarding_complete: bool
    company_id: int | None = None
    company_name: str | None = None


@router.get("/me", response_model=SessionState)
def me(company: Company | None = Depends(get_optional_company)) -> SessionState:
    if not company:
        return SessionState(has_session=False, onboarding_complete=False)
    return SessionState(
        has_session=True,
        onboarding_complete=company.onboarding_completed_at is not None,
        company_id=company.id,
        company_name=company.name,
    )


@router.post("/bootstrap", response_model=SessionState)
def bootstrap(
    response: Response,
    db: Session = Depends(get_db),
    company: Company | None = Depends(get_optional_company),
) -> SessionState:
    if company:
        return SessionState(
            has_session=True,
            onboarding_complete=company.onboarding_completed_at is not None,
            company_id=company.id,
            company_name=company.name,
        )
    new_company = Company(name="My Company")
    db.add(new_company)
    db.flush()
    token = generate_token()
    db.add(AdminSession(company_id=new_company.id, cookie_token=token))
    db.commit()
    set_session_cookie(response, token)
    return SessionState(
        has_session=True,
        onboarding_complete=False,
        company_id=new_company.id,
        company_name=new_company.name,
    )
