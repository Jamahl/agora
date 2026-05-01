from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ChatMessage, ChatSession, Company
from app.schemas import ChatIn, ChatOut
from app.security import get_current_company
from app.services.rag import rag_answer

router = APIRouter(prefix="/chat", tags=["chat"])


def _session_title(context_mode: str, scope_type: str | None, message: str) -> str:
    cleaned = " ".join(message.split())
    if cleaned:
        return cleaned[:57] + "…" if len(cleaned) > 60 else cleaned
    if context_mode == "page" and scope_type:
        return f"{scope_type.title()} questions"
    if context_mode == "custom" and scope_type:
        return f"Custom {scope_type}"
    return "Company health"


def _get_or_create_session(db: Session, company_id: int, body: ChatIn) -> ChatSession:
    if body.session_id:
        existing = db.get(ChatSession, body.session_id)
        if existing and existing.company_id == company_id:
            return existing
    session = ChatSession(
        company_id=company_id,
        title=_session_title(body.context_mode, body.scope_type, body.message),
        context_mode=body.context_mode,
        scope_type=body.scope_type if body.context_mode != "all" else None,
        scope_id=body.scope_id if body.context_mode != "all" else None,
    )
    db.add(session)
    db.flush()
    return session


@router.get("/sessions")
def sessions(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = list(
        db.execute(
            select(ChatSession)
            .where(ChatSession.company_id == company.id)
            .order_by(ChatSession.last_message_at.desc())
        ).scalars()
    )
    return [
        {
            "id": s.id,
            "title": s.title,
            "context_mode": s.context_mode,
            "scope_type": s.scope_type,
            "scope_id": s.scope_id,
            "created_at": s.created_at,
            "last_message_at": s.last_message_at,
        }
        for s in rows
    ]


@router.get("/history", response_model=list[dict])
def history(
    session_id: int | None = None,
    scope_type: str | None = None,
    scope_id: str | None = None,
    limit: int = 50,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    q = select(ChatMessage).where(ChatMessage.company_id == company.id)
    if session_id == -1:
        q = q.where(ChatMessage.session_id.is_(None))
    elif session_id:
        q = q.where(ChatMessage.session_id == session_id)
    elif scope_type:
        q = q.where(ChatMessage.scope_type == scope_type)
    if scope_id and not session_id:
        q = q.where(ChatMessage.scope_id == scope_id)
    q = q.order_by(ChatMessage.created_at.desc()).limit(limit)
    rows = list(reversed(list(db.execute(q).scalars())))
    return [
        {
            "id": m.id,
            "session_id": m.session_id,
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
    session = _get_or_create_session(db, company.id, body)
    scoped_type = body.scope_type if body.context_mode != "all" else None
    scoped_id = body.scope_id if body.context_mode != "all" else None
    db.add(
        ChatMessage(
            company_id=company.id,
            session_id=session.id,
            scope_type=scoped_type,
            scope_id=scoped_id,
            role="user",
            content=body.message,
        )
    )
    db.commit()

    result = rag_answer(db, company.id, body.message, body.context_mode, scoped_type, scoped_id)
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
            session_id=session.id,
            scope_type=scoped_type,
            scope_id=scoped_id,
            role="assistant",
            content=result["reply"],
            citations_json=result["citations"],
        )
    )
    session.context_mode = body.context_mode
    session.scope_type = scoped_type
    session.scope_id = scoped_id
    session.last_message_at = datetime.now(timezone.utc)
    db.commit()

    return ChatOut(
        reply=result["reply"],
        citations=result["citations"],
        session_id=session.id,
        needs_research=result["needs_research"],
        proposed_research_request_id=proposed_id,
    )
