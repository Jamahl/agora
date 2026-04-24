from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.composio_client import (
    check_connection,
    initiate_gmail_connection,
    initiate_notion_connection,
)
from app.db import get_db
from app.models import Company, NotionPage
from app.security import get_current_company
from app.services.notion_sync import list_available_pages, sync_selected

router = APIRouter(prefix="/integrations", tags=["integrations"])


def _composio_user_id(company: Company) -> str:
    return f"company_{company.id}"


@router.get("/notion/status")
def notion_status(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    pages = db.execute(
        select(NotionPage).where(NotionPage.company_id == company.id)
    ).scalars().all()
    is_active = False
    if company.notion_connection_id:
        is_active = check_connection(_composio_user_id(company), "notion")
    return {
        "connected": bool(company.notion_connection_id),
        "active": is_active,
        "page_count": len({p.notion_page_id for p in pages}),
    }


@router.post("/notion/connect")
def notion_connect(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    result = initiate_notion_connection(_composio_user_id(company))
    if result.get("connection_id"):
        company.notion_connection_id = result["connection_id"]
        db.commit()
    return result


@router.post("/notion/disconnect")
def notion_disconnect(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    company.notion_connection_id = None
    db.commit()
    return {"ok": True}


@router.get("/gmail/status")
def gmail_status(
    company: Company = Depends(get_current_company),
) -> dict:
    is_active = False
    if company.gmail_connection_id:
        is_active = check_connection(_composio_user_id(company), "gmail")
    return {
        "connected": bool(company.gmail_connection_id),
        "active": is_active,
        "admin_email": company.admin_email,
    }


@router.post("/gmail/connect")
def gmail_connect(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    result = initiate_gmail_connection(_composio_user_id(company))
    if result.get("connection_id"):
        company.gmail_connection_id = result["connection_id"]
        db.commit()
    return result


@router.post("/gmail/disconnect")
def gmail_disconnect(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    company.gmail_connection_id = None
    db.commit()
    return {"ok": True}


@router.get("/notion/pages")
def notion_pages(
    company: Company = Depends(get_current_company),
) -> list[dict]:
    return list_available_pages(_composio_user_id(company))


class NotionSyncIn(BaseModel):
    page_ids: list[str]


@router.post("/notion/sync")
def notion_sync(
    body: NotionSyncIn,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    count = sync_selected(db, company, _composio_user_id(company), body.page_ids)
    return {"chunks_indexed": count}
