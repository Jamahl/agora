"""operating context, chat sessions, and KR tags

Revision ID: 0004
Revises: 0003
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("okr", sa.Column("scope_type", sa.String(length=32), server_default="company", nullable=False))
    op.add_column("okr", sa.Column("scope_id", sa.String(length=200), nullable=True))

    op.create_table(
        "insight_key_result_tag",
        sa.Column("insight_id", sa.Integer(), nullable=False),
        sa.Column("key_result_id", sa.Integer(), nullable=False),
        sa.Column("similarity", sa.Float(), nullable=False),
        sa.Column("match_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["insight_id"], ["insight.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["key_result_id"], ["key_result.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("insight_id", "key_result_id"),
    )

    op.create_table(
        "company_context",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("scope_type", sa.String(length=32), server_default="company", nullable=False),
        sa.Column("scope_id", sa.String(length=200), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["company.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "chat_session",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("context_mode", sa.String(length=32), server_default="all", nullable=False),
        sa.Column("scope_type", sa.String(length=32), nullable=True),
        sa.Column("scope_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["company.id"], ondelete="CASCADE"),
    )
    op.add_column("chat_message", sa.Column("session_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_chat_message_session_id",
        "chat_message",
        "chat_session",
        ["session_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_chat_message_session_id", "chat_message", type_="foreignkey")
    op.drop_column("chat_message", "session_id")
    op.drop_table("chat_session")
    op.drop_table("company_context")
    op.drop_table("insight_key_result_tag")
    op.drop_column("okr", "scope_id")
    op.drop_column("okr", "scope_type")
