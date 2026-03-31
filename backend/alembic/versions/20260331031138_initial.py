"""initial

Revision ID: 20260331031138
Revises:
Create Date: 2026-03-31 03:11:38

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "20260331031138"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if not inspect(bind).has_table("charts"):
        op.create_table(
            "charts",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("chart_version", sa.String(50), nullable=False, server_default="0.1.0"),
            sa.Column("app_version", sa.String(50), nullable=False, server_default="latest"),
            sa.Column("values_yaml", sa.Text(), nullable=True),
            sa.Column("generated_yaml", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )


def downgrade() -> None:
    op.drop_table("charts")
