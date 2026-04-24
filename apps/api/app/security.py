import secrets
from datetime import datetime
from typing import Optional
from itsdangerous import BadSignature, URLSafeSerializer
from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import AdminSession, Company

COOKIE_NAME = "agora_admin"


def _serializer() -> URLSafeSerializer:
    return URLSafeSerializer(get_settings().admin_cookie_secret, salt="admin-cookie")


def issue_cookie(token: str) -> str:
    return _serializer().dumps({"t": token})


def read_cookie(raw: str) -> Optional[str]:
    try:
        return _serializer().loads(raw).get("t")
    except BadSignature:
        return None


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=issue_cookie(token),
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 365,
        path="/",
    )


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def get_current_company(
    agora_admin: Optional[str] = Cookie(None),
    db: Session = Depends(get_db),
) -> Company:
    if not agora_admin:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No session")
    token = read_cookie(agora_admin)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad cookie")
    row = db.execute(
        select(AdminSession).where(AdminSession.cookie_token == token)
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown session")
    row.last_seen_at = datetime.utcnow()
    db.flush()
    company = db.get(Company, row.company_id)
    if not company:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing company")
    return company


def get_optional_company(
    agora_admin: Optional[str] = Cookie(None),
    db: Session = Depends(get_db),
) -> Optional[Company]:
    if not agora_admin:
        return None
    token = read_cookie(agora_admin)
    if not token:
        return None
    row = db.execute(
        select(AdminSession).where(AdminSession.cookie_token == token)
    ).scalar_one_or_none()
    if not row:
        return None
    return db.get(Company, row.company_id)
