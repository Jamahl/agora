from __future__ import annotations

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.openai_client import structured
from app.models import Employee
from app.schemas import ResearchPlan, ResearchPlanEmployee


class _PlanEmp(BaseModel):
    employee_id: int
    reason: str


class _Plan(BaseModel):
    employees: list[_PlanEmp]
    eta_days: int
    notes: str | None = None


SYSTEM = (
    "You are planning a research round. Given a leadership question and a roster of employees, "
    "pick 3-8 employees whose input would most directly answer the question. "
    "For each, give a one-sentence reason grounded in their role or team. "
    "Estimate how many days until the report can be ready based on a 14-day cadence. "
    "Only return employees from the provided roster — do not invent ids."
)


def draft_plan(db: Session, company_id: int, question: str) -> ResearchPlan:
    employees = list(
        db.execute(
            select(Employee).where(Employee.company_id == company_id, Employee.status == "active")
        ).scalars()
    )
    if not employees:
        return ResearchPlan(question=question, employees=[], eta_days=14, notes="No active employees")
    roster = "\n".join(
        f"- id={e.id} name={e.name} role={e.job_title or '?'} dept={e.department or '?'}"
        for e in employees
    )
    plan = structured(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Question: {question}\n\nRoster:\n{roster}"},
        ],
        _Plan,
        temperature=0.2,
    )
    valid_ids = {e.id for e in employees}
    emps = [
        ResearchPlanEmployee(employee_id=p.employee_id, reason=p.reason)
        for p in plan.employees
        if p.employee_id in valid_ids
    ]
    return ResearchPlan(question=question, employees=emps, eta_days=plan.eta_days, notes=plan.notes)
