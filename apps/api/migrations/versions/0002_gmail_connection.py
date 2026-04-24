"""add gmail_connection_id to company

Revision ID: 0002
Revises: 0001
"""
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("company", sa.Column("gmail_connection_id", sa.String(200), nullable=True))
    op.add_column("company", sa.Column("notion_connection_id", sa.String(200), nullable=True))
    op.execute(
        "UPDATE company SET notion_connection_id = composio_connection_id "
        "WHERE composio_connection_id IS NOT NULL AND notion_connection_id IS NULL"
    )


def downgrade() -> None:
    op.drop_column("company", "notion_connection_id")
    op.drop_column("company", "gmail_connection_id")
