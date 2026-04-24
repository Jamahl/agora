from __future__ import annotations

from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from app.clients.composio_client import fetch_notion_page_content, list_notion_pages
from app.clients.openai_client import embed
from app.logging_conf import log
from app.models import Company, NotionPage


def _chunks(text: str, size: int = 3500) -> list[str]:
    text = text or ""
    if len(text) <= size:
        return [text] if text else []
    out: list[str] = []
    for i in range(0, len(text), size):
        out.append(text[i : i + size])
    return out


def list_available_pages(user_id: str) -> list[dict]:
    return list_notion_pages(user_id)


def sync_selected(db: Session, company: Company, user_id: str, page_ids: list[str]) -> int:
    db.execute(delete(NotionPage).where(NotionPage.company_id == company.id))
    db.commit()
    total = 0
    for pid in page_ids:
        content = fetch_notion_page_content(user_id, pid)
        if not content:
            continue
        for idx, chunk in enumerate(_chunks(content)):
            page = NotionPage(
                company_id=company.id,
                notion_page_id=pid,
                chunk_index=idx,
                title=pid,
                content=chunk,
            )
            try:
                page.embedding = embed(chunk)
            except Exception as e:
                log.warning("notion_embed_fail", err=str(e))
            db.add(page)
            total += 1
    db.commit()
    return total
