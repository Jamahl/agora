from __future__ import annotations
from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, EmailStr, Field

InsightType = Literal[
    "blocker", "win", "start_doing", "stop_doing", "tooling_gap", "sentiment_note", "other"
]
ReviewState = Literal["live", "needs_review", "suppressed", "omitted"]


class CompanyIn(BaseModel):
    name: str
    industry: Optional[str] = None
    description: Optional[str] = None
    admin_email: Optional[str] = None
    hr_contact: Optional[str] = None


class CompanyCadenceIn(BaseModel):
    cadence_days: int = Field(14, ge=1, le=90)
    timezone: str = "UTC"
    window_start_hour: int = Field(9, ge=0, le=23)
    window_end_hour: int = Field(17, ge=1, le=24)
    weekdays: list[int] = [0, 1, 2, 3, 4]


class CompanyOut(BaseModel):
    id: int
    name: str
    industry: Optional[str]
    description: Optional[str]
    cadence_days: int
    timezone: str
    window_start_hour: int
    window_end_hour: int
    weekdays: list[int]
    hr_contact: Optional[str]
    admin_email: Optional[str]
    onboarding_completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class EmployeeIn(BaseModel):
    name: str
    email: EmailStr
    job_title: Optional[str] = None
    department: Optional[str] = None
    linkedin_url: Optional[str] = None
    manager_id: Optional[int] = None


class EmployeeOut(BaseModel):
    id: int
    name: str
    email: str
    job_title: Optional[str]
    department: Optional[str]
    linkedin_url: Optional[str]
    manager_id: Optional[int]
    status: str

    model_config = {"from_attributes": True}


class KeyResultIn(BaseModel):
    description: str
    target_metric: Optional[str] = None
    current_value: Optional[str] = None


class KeyResultOut(KeyResultIn):
    id: int
    status: str

    model_config = {"from_attributes": True}


class OKRIn(BaseModel):
    objective: str
    key_results: list[KeyResultIn] = []
    scope_type: Literal["company", "department"] = "company"
    scope_id: Optional[str] = None


class OKROut(BaseModel):
    id: int
    objective: str
    status: str
    scope_type: str = "company"
    scope_id: Optional[str] = None
    key_results: list[KeyResultOut]

    model_config = {"from_attributes": True}


class OKRExtractIn(BaseModel):
    text: str


class OKRExtractOut(BaseModel):
    objectives: list[OKRIn]


class InterviewOut(BaseModel):
    id: int
    employee_id: int
    scheduled_at: datetime
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    status: str
    link_token: str
    retell_call_id: Optional[str]
    research_request_id: Optional[int]

    model_config = {"from_attributes": True}


class InsightOut(BaseModel):
    id: int
    interview_id: int
    employee_id: int
    type: str
    content: str
    direct_quote: Optional[str]
    severity: int
    confidence: float
    review_state: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatIn(BaseModel):
    message: str
    session_id: Optional[int] = None
    context_mode: Literal["all", "page", "custom"] = "all"
    scope_type: Optional[str] = None
    scope_id: Optional[str] = None


class ChatOut(BaseModel):
    reply: str
    citations: list[dict[str, Any]] = []
    session_id: Optional[int] = None
    needs_research: bool = False
    proposed_research_request_id: Optional[int] = None


class ResearchPlanEmployee(BaseModel):
    employee_id: int
    reason: str


class ResearchPlan(BaseModel):
    question: str
    goal: Optional[str] = None
    research_type: Literal[
        "root_cause", "pulse_check", "decision_support", "idea_discovery", "follow_up"
    ] = "root_cause"
    audience_mode: Literal["departments", "employees", "custom"] = "employees"
    selected_departments: list[str] = Field(default_factory=list)
    recommended_employees: list[ResearchPlanEmployee] = Field(default_factory=list)
    selected_employees: list[ResearchPlanEmployee] = Field(default_factory=list)
    sample_questions: list[str] = Field(default_factory=list)
    timeline: Optional[str] = None
    readout_threshold: float = Field(0.75, ge=0, le=1)
    employees: list[ResearchPlanEmployee] = Field(default_factory=list)
    eta_days: int = 14
    notes: Optional[str] = None


class ResearchIn(BaseModel):
    question: str


class ResearchOut(BaseModel):
    id: int
    question: str
    status: str
    plan: Optional[ResearchPlan]
    report: Optional[dict[str, Any]]

    model_config = {"from_attributes": True}
