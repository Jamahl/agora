from __future__ import annotations

from sqlalchemy.orm import Session

from app.clients.openai_client import embed
from app.models import OKR, KeyResult, Insight, NotionPage


def embed_okr(db: Session, okr_id: int) -> None:
    okr = db.get(OKR, okr_id)
    if not okr:
        return
    kr_text = "\n".join(kr.description for kr in okr.key_results)
    okr.embedding = embed(f"{okr.objective}\n{kr_text}")
    for kr in okr.key_results:
        kr.embedding = embed(kr.description)
    db.commit()


def embed_insight(db: Session, insight_id: int) -> None:
    ins = db.get(Insight, insight_id)
    if not ins:
        return
    ins.embedding = embed(ins.content)
    db.commit()


def embed_notion_page(db: Session, page_id: int) -> None:
    page = db.get(NotionPage, page_id)
    if not page:
        return
    page.embedding = embed(page.content)
    db.commit()
