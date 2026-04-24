from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ChatMessage, Company
from app.schemas import ChatIn, ChatOut
from app.security import get_current_company
from app.services.rag import rag_answer

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/history", response_model=list[dict])
def history(
    scope_type: str | None = None,
    scope_id: str | None = None,
    limit: int = 50,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    q = select(ChatMessage).where(ChatMessage.company_id == company.id)
    if scope_type:
        q = q.where(ChatMessage.scope_type == scope_type)
    if scope_id:
        q = q.where(ChatMessage.scope_id == scope_id)
    q = q.order_by(ChatMessage.created_at.desc()).limit(limit)
    rows = list(reversed(list(db.execute(q).scalars())))
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "citations": m.citations_json,
            "created_at": m.created_at,
        }
        for m in rows
    ]


@router.post("", response_model=ChatOut)
def send(
    body: ChatIn,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> ChatOut:
    db.add(
        ChatMessage(
            company_id=company.id,
            scope_type=body.scope_type,
            scope_id=body.scope_id,
            role="user",
            content=body.message,
        )
    )
    db.commit()

    result = rag_answer(db, company.id, body.message, body.scope_type, body.scope_id)
    proposed_id: int | None = None
    if result["needs_research"]:
        from app.services.research_agent import draft_plan
        from app.models import ResearchRequest

        plan = draft_plan(db, company.id, body.message)
        rr = ResearchRequest(
            company_id=company.id,
            question=body.message,
            status="draft",
            plan_json=plan.model_dump(),
        )
        db.add(rr)
        db.flush()
        proposed_id = rr.id

    db.add(
        ChatMessage(
            company_id=company.id,
            scope_type=body.scope_type,
            scope_id=body.scope_id,
            role="assistant",
            content=result["reply"],
            citations_json=result["citations"],
        )
    )
    db.commit()

    return ChatOut(
        reply=result["reply"],
        citations=result["citations"],
        needs_research=result["needs_research"],
        proposed_research_request_id=proposed_id,
    )
