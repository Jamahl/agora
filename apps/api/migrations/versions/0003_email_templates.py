"""add email_templates + invite_sent_at + summary_sent_at

Revision ID: 0003
Revises: 0002
"""
from typing import Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("company", sa.Column("email_templates", JSONB, server_default="{}", nullable=False))
    op.add_column("interview", sa.Column("invite_sent_at", sa.DateTime(timezone=True)))
    op.add_column("interview", sa.Column("summary_sent_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("interview", "summary_sent_at")
    op.drop_column("interview", "invite_sent_at")
    op.drop_column("company", "email_templates")
