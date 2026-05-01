from __future__ import annotations

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.openai_client import structured
from app.models import Employee
from app.schemas import ResearchPlan, ResearchPlanEmployee


class _PlanEmp(BaseModel):
    employee_id: int
    reason: str


class _Plan(BaseModel):
    goal: str | None = None
    research_type: str = "root_cause"
    audience_mode: str = "employees"
    selected_departments: list[str] = Field(default_factory=list)
    employees: list[_PlanEmp]
    eta_days: int
    sample_questions: list[str] = Field(default_factory=list)
    expected_output: str | None = None
    notes: str | None = None


SYSTEM = (
    "You are drafting a launchable research brief for a leadership question. "
    "Identify the decision this should help with, classify the research_type as one of "
    "root_cause, pulse_check, decision_support, idea_discovery, follow_up, and pick 3-8 "
    "employees whose input would most directly answer the question. "
    "Prefer recommending departments first when the pattern is broad, then named employees. "
    "For each employee, give a one-sentence reason grounded in their role or team. "
    "Estimate how many days until enough signal is available based on a 14-day cadence. "
    "Include 3-5 sample questions the interviewer should explore. "
    "Only return employees from the provided roster — do not invent ids."
)


def draft_plan(db: Session, company_id: int, question: str) -> ResearchPlan:
    employees = list(
        db.execute(
            select(Employee).where(Employee.company_id == company_id, Employee.status == "active")
        ).scalars()
    )
    if not employees:
        return ResearchPlan(
            question=question,
            goal="Clarify what leadership should decide next.",
            employees=[],
            eta_days=14,
            timeline="No active employees available yet.",
            notes="No active employees",
        )
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
    valid_types = {"root_cause", "pulse_check", "decision_support", "idea_discovery", "follow_up"}
    research_type = plan.research_type if plan.research_type in valid_types else "root_cause"
    valid_audience_modes = {"departments", "employees", "custom"}
    audience_mode = (
        plan.audience_mode if plan.audience_mode in valid_audience_modes else "employees"
    )
    departments = sorted({e.department for e in employees if e.department})
    selected_departments = [d for d in plan.selected_departments if d in departments]
    return ResearchPlan(
        question=question,
        goal=plan.goal or "Help leadership decide the next action.",
        research_type=research_type,  # type: ignore[arg-type]
        audience_mode=audience_mode,  # type: ignore[arg-type]
        selected_departments=selected_departments,
        recommended_employees=emps,
        selected_employees=emps,
        employees=emps,
        eta_days=plan.eta_days,
        timeline=f"Enough signal expected in about {plan.eta_days} day{'s' if plan.eta_days != 1 else ''}.",
        sample_questions=plan.sample_questions,
        notes=plan.expected_output or plan.notes,
    )
