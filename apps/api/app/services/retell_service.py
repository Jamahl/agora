from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.clients.retell_client import client as retell_client
from app.config import get_settings
from app.models import Company, Employee, Interview, OKR


def _active_okrs_text(db: Session, company_id: int) -> str:
    okrs = list(
        db.execute(
            select(OKR)
            .where(OKR.company_id == company_id, OKR.status == "active")
            .options(selectinload(OKR.key_results))
        ).scalars()
    )
    lines = []
    for o in okrs:
        lines.append(f"- {o.objective}")
        for kr in o.key_results:
            lines.append(f"    · KR: {kr.description}")
    return "\n".join(lines) or "(no OKRs yet)"


def build_dynamic_vars(db: Session, company: Company, employee: Employee, interview: Interview) -> dict:
    prior = db.execute(
        select(Interview)
        .where(
            Interview.employee_id == employee.id,
            Interview.status == "completed",
            Interview.id != interview.id,
        )
        .limit(1)
    ).scalar_one_or_none()
    is_first = prior is None
    memory_block = ""
    if employee.memory_summary and not is_first:
        memory_block = f"Recent context from prior interviews:\n{employee.memory_summary}"

    research_block = ""
    if interview.research_request_id:
        from app.models import ResearchRequest

        rr = db.get(ResearchRequest, interview.research_request_id)
        if rr:
            research_block = (
                f"This is a research-request interview. Leadership asked: {rr.question}"
            )

    return {
        "employee_name": (employee.name or "").split(" ")[0] or employee.name or "there",
        "company_name": company.name,
        "company_description": company.description or "",
        "is_first_interview": "true" if is_first else "false",
        "memory_summary": memory_block,
        "active_okrs": _active_okrs_text(db, company.id),
        "hr_contact": company.hr_contact or "HR",
        "research_context": research_block,
    }


def build_web_call(db: Session, company: Company, employee: Employee, interview: Interview) -> tuple[str, str]:
    s = get_settings()
    if not s.retell_agent_id:
        raise RuntimeError("RETELL_AGENT_ID not set — run scripts/provision_retell_agent.py")
    vars_ = build_dynamic_vars(db, company, employee, interview)
    r = retell_client().call.create_web_call(
        agent_id=s.retell_agent_id,
        metadata={"interview_id": interview.id, "employee_id": employee.id},
        retell_llm_dynamic_variables=vars_,
    )
    return r.access_token, r.call_id
