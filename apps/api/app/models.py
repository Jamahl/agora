from __future__ import annotations

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.config import get_settings
from app.db import Base

EMBED_DIM = get_settings().embedding_dim


class Company(Base):
    __tablename__ = "company"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    industry: Mapped[Optional[str]] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text)
    cadence_days: Mapped[int] = mapped_column(Integer, default=14)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    window_start_hour: Mapped[int] = mapped_column(Integer, default=9)
    window_end_hour: Mapped[int] = mapped_column(Integer, default=17)
    weekdays: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=lambda: [0, 1, 2, 3, 4])
    hr_contact: Mapped[Optional[str]] = mapped_column(String(200))
    composio_connection_id: Mapped[Optional[str]] = mapped_column(String(200))
    gmail_connection_id: Mapped[Optional[str]] = mapped_column(String(200))
    notion_connection_id: Mapped[Optional[str]] = mapped_column(String(200))
    admin_email: Mapped[Optional[str]] = mapped_column(String(200))
    okr_tag_threshold: Mapped[float] = mapped_column(Float, default=0.55)
    email_templates: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    onboarding_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AdminSession(Base):
    __tablename__ = "admin_session"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id", ondelete="CASCADE"))
    cookie_token: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Employee(Base):
    __tablename__ = "employee"
    __table_args__ = (
        UniqueConstraint("company_id", "email", name="uq_employee_company_email"),
        CheckConstraint("manager_id IS NULL OR manager_id <> id", name="ck_employee_manager_not_self"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(200))
    job_title: Mapped[Optional[str]] = mapped_column(String(200))
    department: Mapped[Optional[str]] = mapped_column(String(200))
    linkedin_url: Mapped[Optional[str]] = mapped_column(String(500))
    manager_id: Mapped[Optional[int]] = mapped_column(ForeignKey("employee.id", ondelete="SET NULL"))
    memory_summary: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OKR(Base):
    __tablename__ = "okr"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id", ondelete="CASCADE"))
    objective: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="active")
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBED_DIM))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    key_results: Mapped[list[KeyResult]] = relationship(
        "KeyResult", back_populates="okr", cascade="all, delete-orphan"
    )


class KeyResult(Base):
    __tablename__ = "key_result"
    id: Mapped[int] = mapped_column(primary_key=True)
    okr_id: Mapped[int] = mapped_column(ForeignKey("okr.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(Text)
    target_metric: Mapped[Optional[str]] = mapped_column(String(500))
    current_value: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(32), default="active")
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBED_DIM))

    okr: Mapped[OKR] = relationship("OKR", back_populates="key_results")


class ResearchRequest(Base):
    __tablename__ = "research_request"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id", ondelete="CASCADE"))
    question: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    plan_json: Mapped[Optional[dict]] = mapped_column(JSONB)
    report_json: Mapped[Optional[dict]] = mapped_column(JSONB)
    notify_threshold: Mapped[float] = mapped_column(Float, default=0.75)
    notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Interview(Base):
    __tablename__ = "interview"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employee.id", ondelete="CASCADE"))
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id", ondelete="CASCADE"))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="scheduled")
    link_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    retell_call_id: Mapped[Optional[str]] = mapped_column(String(200), index=True)
    transcript_url: Mapped[Optional[str]] = mapped_column(String(500))
    recording_url: Mapped[Optional[str]] = mapped_column(String(500))
    raw_transcript_json: Mapped[Optional[dict]] = mapped_column(JSONB)
    cleaned_transcript_json: Mapped[Optional[dict]] = mapped_column(JSONB)
    corrected_summary: Mapped[Optional[str]] = mapped_column(Text)
    sensitive_omitted: Mapped[Optional[list[str]]] = mapped_column(ARRAY(String))
    research_request_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("research_request.id", ondelete="SET NULL")
    )
    reminder_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    invite_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    summary_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Insight(Base):
    __tablename__ = "insight"
    id: Mapped[int] = mapped_column(primary_key=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interview.id", ondelete="CASCADE"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employee.id", ondelete="CASCADE"))
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(Text)
    direct_quote: Mapped[Optional[str]] = mapped_column(Text)
    severity: Mapped[int] = mapped_column(Integer, default=3)
    confidence: Mapped[float] = mapped_column(Float, default=0.7)
    review_state: Mapped[str] = mapped_column(String(32), default="live")
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBED_DIM))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InsightOkrTag(Base):
    __tablename__ = "insight_okr_tag"
    insight_id: Mapped[int] = mapped_column(
        ForeignKey("insight.id", ondelete="CASCADE"), primary_key=True
    )
    okr_id: Mapped[int] = mapped_column(
        ForeignKey("okr.id", ondelete="CASCADE"), primary_key=True
    )
    similarity: Mapped[float] = mapped_column(Float)


class InterviewSentiment(Base):
    __tablename__ = "interview_sentiment"
    interview_id: Mapped[int] = mapped_column(
        ForeignKey("interview.id", ondelete="CASCADE"), primary_key=True
    )
    morale: Mapped[int] = mapped_column(Integer)
    energy: Mapped[int] = mapped_column(Integer)
    candor: Mapped[int] = mapped_column(Integer)
    urgency: Mapped[int] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class Theme(Base):
    __tablename__ = "theme"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(300))
    summary: Mapped[Optional[str]] = mapped_column(Text)
    member_insight_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AdminAlert(Base):
    __tablename__ = "admin_alert"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String(64))
    summary: Mapped[str] = mapped_column(Text)
    interview_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("interview.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(32), default="unread")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class NotionPage(Base):
    __tablename__ = "notion_page"
    __table_args__ = (
        UniqueConstraint("company_id", "notion_page_id", "chunk_index", name="uq_notion_chunk"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id", ondelete="CASCADE"))
    notion_page_id: Mapped[str] = mapped_column(String(200))
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[Optional[str]] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBED_DIM))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_message"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id", ondelete="CASCADE"))
    scope_type: Mapped[Optional[str]] = mapped_column(String(32))
    scope_id: Mapped[Optional[str]] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(Text)
    citations_json: Mapped[Optional[list[dict]]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
