from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import (
    Company,
    Employee,
    Insight,
    InsightOkrTag,
    Interview,
    InterviewSentiment,
    OKR,
    Theme,
)
from app.security import get_current_company

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _recent(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


@router.get("/home/summary")
def home_summary(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    since = _recent(7)
    interviews = db.execute(
        select(func.count(Interview.id)).where(
            Interview.company_id == company.id,
            Interview.status == "completed",
            Interview.ended_at >= since,
        )
    ).scalar_one()
    blockers = db.execute(
        select(func.count(Insight.id)).where(
            Insight.company_id == company.id,
            Insight.review_state == "live",
            Insight.type == "blocker",
            Insight.created_at >= since,
        )
    ).scalar_one()
    wins = db.execute(
        select(func.count(Insight.id)).where(
            Insight.company_id == company.id,
            Insight.review_state == "live",
            Insight.type == "win",
            Insight.created_at >= since,
        )
    ).scalar_one()
    return {"interviews": interviews, "blockers": blockers, "wins": wins}


def _recency_decay(created: datetime) -> float:
    age_days = (datetime.now(timezone.utc) - created).total_seconds() / 86400.0
    return math.exp(-age_days / 14.0)


@router.get("/home/blockers")
def top_blockers(
    department: str | None = None,
    limit: int = 5,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    since = _recent(30)
    q = (
        select(Insight, Employee)
        .join(Employee, Employee.id == Insight.employee_id)
        .where(
            Insight.company_id == company.id,
            Insight.review_state == "live",
            Insight.type == "blocker",
            Insight.created_at >= since,
        )
    )
    if department:
        q = q.where(Employee.department == department)
    rows = list(db.execute(q).all())
    scored = []
    for ins, emp in rows:
        score = ins.severity * ins.confidence * _recency_decay(ins.created_at)
        scored.append(
            {
                "id": ins.id,
                "interview_id": ins.interview_id,
                "employee": {"id": emp.id, "name": emp.name, "department": emp.department},
                "content": ins.content,
                "severity": ins.severity,
                "score": round(score, 3),
                "created_at": ins.created_at,
            }
        )
    scored.sort(key=lambda r: r["score"], reverse=True)
    return scored[:limit]


@router.get("/home/okr-health")
def okr_health(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    okrs = list(
        db.execute(
            select(OKR)
            .where(OKR.company_id == company.id, OKR.status == "active")
            .options(selectinload(OKR.key_results))
        ).scalars()
    )
    out = []
    since = _recent(14)
    for o in okrs:
        q = (
            select(Insight)
            .join(InsightOkrTag, InsightOkrTag.insight_id == Insight.id)
            .where(
                InsightOkrTag.okr_id == o.id,
                Insight.review_state == "live",
                Insight.created_at >= since,
            )
        )
        insights = list(db.execute(q).scalars())
        volume = len(insights)
        avg_sev = sum(i.severity for i in insights) / volume if volume else 0
        blockers = sum(1 for i in insights if i.type == "blocker")
        wins = sum(1 for i in insights if i.type == "win")
        signal = (blockers * 1.5 + avg_sev) - wins * 0.5
        if blockers >= 3 and avg_sev >= 3.5:
            color = "red"
        elif volume == 0:
            color = "gray"
        elif blockers >= 1:
            color = "amber"
        else:
            color = "green"
        out.append(
            {
                "id": o.id,
                "objective": o.objective,
                "volume": volume,
                "avg_severity": round(avg_sev, 2),
                "blockers": blockers,
                "wins": wins,
                "color": color,
                "score": round(signal, 2),
            }
        )
    return out


@router.get("/home/sentiment-trend")
def sentiment_trend(
    days: int = 90,
    department: str | None = None,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    since = _recent(days)
    q = (
        select(Interview, InterviewSentiment, Employee)
        .join(InterviewSentiment, InterviewSentiment.interview_id == Interview.id)
        .join(Employee, Employee.id == Interview.employee_id)
        .where(
            Interview.company_id == company.id,
            Interview.ended_at.is_not(None),
            Interview.ended_at >= since,
        )
        .order_by(Interview.ended_at)
    )
    if department:
        q = q.where(Employee.department == department)
    rows = list(db.execute(q).all())
    return [
        {
            "date": iv.ended_at.date().isoformat() if iv.ended_at else None,
            "morale": s.morale,
            "energy": s.energy,
            "candor": s.candor,
            "urgency": s.urgency,
        }
        for iv, s, _emp in rows
    ]


@router.get("/departments")
def departments(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = db.execute(
        select(Employee.department, func.count(Employee.id))
        .where(Employee.company_id == company.id, Employee.status == "active")
        .group_by(Employee.department)
    ).all()
    return [{"name": r[0] or "Unassigned", "count": r[1]} for r in rows]


@router.get("/departments/{name}")
def department_detail(
    name: str,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    employees = list(
        db.execute(
            select(Employee).where(
                Employee.company_id == company.id,
                Employee.status == "active",
                Employee.department == name,
            )
        ).scalars()
    )
    upcoming = list(
        db.execute(
            select(Interview, Employee)
            .join(Employee, Employee.id == Interview.employee_id)
            .where(
                Interview.company_id == company.id,
                Employee.department == name,
                Interview.status == "scheduled",
            )
            .order_by(Interview.scheduled_at)
            .limit(10)
        ).all()
    )
    return {
        "name": name,
        "employees": [{"id": e.id, "name": e.name, "job_title": e.job_title} for e in employees],
        "upcoming": [
            {
                "id": iv.id,
                "employee_name": emp.name,
                "scheduled_at": iv.scheduled_at,
                "link_token": iv.link_token,
            }
            for iv, emp in upcoming
        ],
    }


@router.get("/okrs/{okr_id}")
def okr_detail(
    okr_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    okr = db.get(OKR, okr_id)
    if not okr or okr.company_id != company.id:
        raise HTTPException(404)
    q = (
        select(Insight, Employee)
        .join(InsightOkrTag, InsightOkrTag.insight_id == Insight.id)
        .join(Employee, Employee.id == Insight.employee_id)
        .where(InsightOkrTag.okr_id == okr_id, Insight.review_state == "live")
        .order_by(Insight.severity.desc(), Insight.created_at.desc())
    )
    rows = list(db.execute(q).all())
    attribution = {}
    for ins, emp in rows:
        attribution.setdefault(emp.id, {"employee_id": emp.id, "name": emp.name, "count": 0})
        attribution[emp.id]["count"] += 1
    return {
        "id": okr.id,
        "objective": okr.objective,
        "key_results": [{"id": kr.id, "description": kr.description} for kr in okr.key_results],
        "insights": [
            {
                "id": ins.id,
                "type": ins.type,
                "content": ins.content,
                "severity": ins.severity,
                "employee": {"id": emp.id, "name": emp.name},
                "interview_id": ins.interview_id,
            }
            for ins, emp in rows
        ],
        "attribution": list(attribution.values()),
    }


@router.get("/okrs/{okr_id}/summary")
def okr_summary(
    okr_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    from app.clients.openai_client import chat as llm_chat

    okr = db.get(OKR, okr_id)
    if not okr or okr.company_id != company.id:
        raise HTTPException(404)
    q = (
        select(Insight)
        .join(InsightOkrTag, InsightOkrTag.insight_id == Insight.id)
        .where(InsightOkrTag.okr_id == okr_id, Insight.review_state == "live")
        .order_by(Insight.severity.desc())
        .limit(40)
    )
    insights = list(db.execute(q).scalars())
    if not insights:
        return {"summary": "No signal yet for this OKR.", "source_count": 0}
    material = "\n".join(f"- [{i.type}] {i.content}" for i in insights)
    text = llm_chat(
        [
            {"role": "system", "content": "Summarize the biggest risk to this OKR based on employee interview insights. Be concrete and 2-4 sentences. Do not invent facts."},
            {"role": "user", "content": f"OKR: {okr.objective}\n\nInsights:\n{material}"},
        ],
        temperature=0.3,
    )
    return {"summary": text, "source_count": len(insights)}


@router.get("/employees/{employee_id}")
def employee_detail(
    employee_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    emp = db.get(Employee, employee_id)
    if not emp or emp.company_id != company.id:
        raise HTTPException(404)
    interviews = list(
        db.execute(
            select(Interview)
            .where(Interview.employee_id == emp.id)
            .order_by(Interview.scheduled_at.desc())
        ).scalars()
    )
    out_interviews = []
    for iv in interviews:
        ins = list(
            db.execute(
                select(Insight).where(
                    Insight.interview_id == iv.id, Insight.review_state == "live"
                )
            ).scalars()
        )
        sent = db.get(InterviewSentiment, iv.id)
        out_interviews.append(
            {
                "id": iv.id,
                "scheduled_at": iv.scheduled_at,
                "ended_at": iv.ended_at,
                "status": iv.status,
                "insight_count": len(ins),
                "top_insights": [
                    {
                        "id": i.id,
                        "type": i.type,
                        "content": i.content,
                        "severity": i.severity,
                        "review_state": i.review_state,
                    }
                    for i in ins[:5]
                ],
                "sentiment": (
                    {
                        "morale": sent.morale,
                        "energy": sent.energy,
                        "candor": sent.candor,
                        "urgency": sent.urgency,
                    }
                    if sent
                    else None
                ),
            }
        )
    return {
        "id": emp.id,
        "name": emp.name,
        "email": emp.email,
        "job_title": emp.job_title,
        "department": emp.department,
        "manager_id": emp.manager_id,
        "memory_summary": emp.memory_summary,
        "status": emp.status,
        "interviews": out_interviews,
    }


@router.get("/themes")
def list_themes(
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> list[dict]:
    themes = list(
        db.execute(
            select(Theme)
            .where(Theme.company_id == company.id)
            .order_by(Theme.created_at.desc())
        ).scalars()
    )
    out = []
    for t in themes:
        insight_count = (
            db.execute(
                select(func.count(Insight.id)).where(Insight.id.in_(t.member_insight_ids))
            ).scalar_one()
            if t.member_insight_ids
            else 0
        )
        out.append(
            {
                "id": t.id,
                "label": t.label,
                "summary": t.summary,
                "member_count": insight_count,
                "created_at": t.created_at,
            }
        )
    return out


@router.get("/themes/{theme_id}")
def theme_detail(
    theme_id: int,
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
) -> dict:
    t = db.get(Theme, theme_id)
    if not t or t.company_id != company.id:
        raise HTTPException(404)
    q = select(Insight, Employee).join(Employee, Employee.id == Insight.employee_id).where(
        Insight.id.in_(t.member_insight_ids or [])
    )
    rows = list(db.execute(q).all())
    return {
        "id": t.id,
        "label": t.label,
        "summary": t.summary,
        "insights": [
            {
                "id": i.id,
                "type": i.type,
                "content": i.content,
                "severity": i.severity,
                "employee": {"id": e.id, "name": e.name},
                "interview_id": i.interview_id,
            }
            for i, e in rows
        ],
    }
