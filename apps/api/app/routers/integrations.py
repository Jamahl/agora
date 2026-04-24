from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.composio_client import initiate_notion_connection
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
    count = db.execute(
        select(NotionPage).where(NotionPage.company_id == company.id)
    ).scalars().all()
    return {
        "connected": bool(company.composio_connection_id),
        "page_count": len({p.notion_page_id for p in count}),
    }


@router.post("/notion/connect")
def notion_connect(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    result = initiate_notion_connection(_composio_user_id(company))
    if result.get("connection_id"):
        company.composio_connection_id = result["connection_id"]
        db.commit()
    return result


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
