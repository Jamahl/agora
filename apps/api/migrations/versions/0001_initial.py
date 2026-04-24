"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from pgvector.sqlalchemy import Vector


revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels = None
depends_on = None

EMBED = 3072


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "company",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("industry", sa.String(200)),
        sa.Column("description", sa.Text),
        sa.Column("cadence_days", sa.Integer, server_default="14", nullable=False),
        sa.Column("timezone", sa.String(64), server_default="UTC", nullable=False),
        sa.Column("window_start_hour", sa.Integer, server_default="9", nullable=False),
        sa.Column("window_end_hour", sa.Integer, server_default="17", nullable=False),
        sa.Column("weekdays", ARRAY(sa.Integer), server_default="{0,1,2,3,4}", nullable=False),
        sa.Column("hr_contact", sa.String(200)),
        sa.Column("composio_connection_id", sa.String(200)),
        sa.Column("admin_email", sa.String(200)),
        sa.Column("okr_tag_threshold", sa.Float, server_default="0.55", nullable=False),
        sa.Column("onboarding_completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "admin_session",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cookie_token", sa.String(200), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_admin_session_cookie_token", "admin_session", ["cookie_token"])

    op.create_table(
        "employee",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(200), nullable=False),
        sa.Column("job_title", sa.String(200)),
        sa.Column("department", sa.String(200)),
        sa.Column("linkedin_url", sa.String(500)),
        sa.Column("manager_id", sa.Integer, sa.ForeignKey("employee.id", ondelete="SET NULL")),
        sa.Column("memory_summary", sa.Text),
        sa.Column("status", sa.String(32), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("company_id", "email", name="uq_employee_company_email"),
        sa.CheckConstraint("manager_id IS NULL OR manager_id <> id", name="ck_employee_manager_not_self"),
    )

    op.create_table(
        "okr",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("objective", sa.Text, nullable=False),
        sa.Column("status", sa.String(32), server_default="active", nullable=False),
        sa.Column("embedding", Vector(EMBED)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "key_result",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("okr_id", sa.Integer, sa.ForeignKey("okr.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("target_metric", sa.String(500)),
        sa.Column("current_value", sa.String(500)),
        sa.Column("status", sa.String(32), server_default="active", nullable=False),
        sa.Column("embedding", Vector(EMBED)),
    )

    op.create_table(
        "research_request",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("status", sa.String(32), server_default="draft", nullable=False),
        sa.Column("plan_json", JSONB),
        sa.Column("report_json", JSONB),
        sa.Column("notify_threshold", sa.Float, server_default="0.75", nullable=False),
        sa.Column("notified_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "interview",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("employee_id", sa.Integer, sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(32), server_default="scheduled", nullable=False),
        sa.Column("link_token", sa.String(64), nullable=False, unique=True),
        sa.Column("retell_call_id", sa.String(200)),
        sa.Column("transcript_url", sa.String(500)),
        sa.Column("recording_url", sa.String(500)),
        sa.Column("raw_transcript_json", JSONB),
        sa.Column("cleaned_transcript_json", JSONB),
        sa.Column("corrected_summary", sa.Text),
        sa.Column("sensitive_omitted", ARRAY(sa.String)),
        sa.Column("research_request_id", sa.Integer, sa.ForeignKey("research_request.id", ondelete="SET NULL")),
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_interview_retell_call_id", "interview", ["retell_call_id"])
    op.create_index("ix_interview_link_token", "interview", ["link_token"])

    op.create_table(
        "insight",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("interview_id", sa.Integer, sa.ForeignKey("interview.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", sa.Integer, sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("direct_quote", sa.Text),
        sa.Column("severity", sa.Integer, server_default="3", nullable=False),
        sa.Column("confidence", sa.Float, server_default="0.7", nullable=False),
        sa.Column("review_state", sa.String(32), server_default="live", nullable=False),
        sa.Column("embedding", Vector(EMBED)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "type IN ('blocker','win','start_doing','stop_doing','tooling_gap','sentiment_note','other')",
            name="ck_insight_type",
        ),
        sa.CheckConstraint(
            "review_state IN ('live','needs_review','suppressed','omitted')",
            name="ck_insight_review_state",
        ),
    )

    op.create_table(
        "insight_okr_tag",
        sa.Column("insight_id", sa.Integer, sa.ForeignKey("insight.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("okr_id", sa.Integer, sa.ForeignKey("okr.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("similarity", sa.Float, nullable=False),
    )

    op.create_table(
        "interview_sentiment",
        sa.Column("interview_id", sa.Integer, sa.ForeignKey("interview.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("morale", sa.Integer, nullable=False),
        sa.Column("energy", sa.Integer, nullable=False),
        sa.Column("candor", sa.Integer, nullable=False),
        sa.Column("urgency", sa.Integer, nullable=False),
        sa.Column("notes", sa.Text),
    )

    op.create_table(
        "theme",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(300), nullable=False),
        sa.Column("summary", sa.Text),
        sa.Column("member_insight_ids", ARRAY(sa.Integer), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "admin_alert",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("interview_id", sa.Integer, sa.ForeignKey("interview.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(32), server_default="unread", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "notion_page",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notion_page_id", sa.String(200), nullable=False),
        sa.Column("chunk_index", sa.Integer, server_default="0", nullable=False),
        sa.Column("title", sa.String(500)),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", Vector(EMBED)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("company_id", "notion_page_id", "chunk_index", name="uq_notion_chunk"),
    )

    op.create_table(
        "chat_message",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope_type", sa.String(32)),
        sa.Column("scope_id", sa.String(100)),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("citations_json", JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    for t in [
        "chat_message", "notion_page", "admin_alert", "theme", "interview_sentiment",
        "insight_okr_tag", "insight", "interview", "research_request", "key_result", "okr",
        "employee", "admin_session", "company",
    ]:
        op.drop_table(t)
