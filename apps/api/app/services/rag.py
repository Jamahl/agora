from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.openai_client import chat as llm_chat, embed
from app.models import Employee, Insight, Interview, NotionPage, OKR


def _topk(
    db: Session, company_id: int, query_emb: list[float], scope_type: str | None, scope_id: str | None, k: int = 8
) -> tuple[list[dict], list[dict]]:
    ins_q = (
        select(Insight, Interview, Employee)
        .join(Interview, Interview.id == Insight.interview_id)
        .join(Employee, Employee.id == Insight.employee_id)
        .where(
            Insight.company_id == company_id,
            Insight.review_state == "live",
            Insight.embedding.is_not(None),
        )
        .order_by(Insight.embedding.cosine_distance(query_emb))
        .limit(k * 2)
    )
    if scope_type == "okr" and scope_id:
        from app.models import InsightOkrTag

        ins_q = ins_q.join(InsightOkrTag, InsightOkrTag.insight_id == Insight.id).where(
            InsightOkrTag.okr_id == int(scope_id)
        )
    elif scope_type == "department" and scope_id:
        ins_q = ins_q.where(Employee.department == scope_id)
    elif scope_type == "employee" and scope_id:
        ins_q = ins_q.where(Employee.id == int(scope_id))

    insights = db.execute(ins_q).all()
    ins_items = [
        {
            "type": "insight",
            "id": i.id,
            "content": i.content,
            "insight_type": i.type,
            "severity": i.severity,
            "employee": emp.name,
            "interview_id": iv.id,
            "date": iv.ended_at.isoformat() if iv.ended_at else None,
        }
        for i, iv, emp in insights[:k]
    ]

    notion_q = (
        select(NotionPage)
        .where(NotionPage.company_id == company_id, NotionPage.embedding.is_not(None))
        .order_by(NotionPage.embedding.cosine_distance(query_emb))
        .limit(k)
    )
    pages = db.execute(notion_q).scalars().all()
    notion_items = [
        {"type": "notion", "id": p.id, "title": p.title, "content": p.content[:800]}
        for p in pages[:5]
    ]
    return ins_items, notion_items


ANSWER_SYSTEM = (
    "You are Agora's leadership chat. Answer using only the provided insights and Notion excerpts. "
    "Cite sources inline as [interview:ID] or [notion:ID]. "
    "If the provided material does not cover the question, say so explicitly."
)

CLASSIFIER_SYSTEM = (
    "Decide whether the user question can be answered from the provided material. "
    "Reply with exactly one token: ANSWER or RESEARCH."
)


def rag_answer(
    db: Session, company_id: int, question: str, scope_type: str | None, scope_id: str | None
) -> dict:
    qemb = embed(question)
    ins_items, notion_items = _topk(db, company_id, qemb, scope_type, scope_id)
    material_lines: list[str] = []
    for i in ins_items:
        material_lines.append(
            f"[interview:{i['interview_id']}] {i['employee']} ({i['insight_type']}, sev {i['severity']}): {i['content']}"
        )
    for n in notion_items:
        material_lines.append(f"[notion:{n['id']}] {n['title']}: {n['content']}")
    material = "\n".join(material_lines) or "(no material found)"

    classify = llm_chat(
        [
            {"role": "system", "content": CLASSIFIER_SYSTEM},
            {"role": "user", "content": f"Question: {question}\n\nMaterial:\n{material}"},
        ],
        temperature=0.0,
    ).strip().upper()
    needs_research = classify.startswith("RESEARCH") and (len(ins_items) + len(notion_items)) < 3

    answer = llm_chat(
        [
            {"role": "system", "content": ANSWER_SYSTEM},
            {"role": "user", "content": f"Question: {question}\n\nMaterial:\n{material}"},
        ],
        temperature=0.2,
    )
    citations: list[dict] = []
    for i in ins_items:
        citations.append({"type": "insight", "id": i["id"], "interview_id": i["interview_id"], "employee": i["employee"]})
    for n in notion_items:
        citations.append({"type": "notion", "id": n["id"], "title": n["title"]})
    return {"reply": answer, "citations": citations, "needs_research": needs_research}
