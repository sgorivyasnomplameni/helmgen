"""add users and chart owners

Revision ID: 20260406021000
Revises: 20260405231000
Create Date: 2026-04-06 02:10:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "20260406021000"
down_revision: Union[str, None] = "20260405231000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("full_name", sa.String(length=255), nullable=True),
            sa.Column("password_hash", sa.String(length=512), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    chart_columns = {column["name"] for column in inspector.get_columns("charts")}
    if "owner_id" not in chart_columns:
        op.add_column("charts", sa.Column("owner_id", sa.Integer(), nullable=True))
        op.create_index("ix_charts_owner_id", "charts", ["owner_id"], unique=False)
        op.create_foreign_key(
            "fk_charts_owner_id_users",
            "charts",
            "users",
            ["owner_id"],
            ["id"],
        )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    chart_columns = {column["name"] for column in inspector.get_columns("charts")}
    if "owner_id" in chart_columns:
        op.drop_constraint("fk_charts_owner_id_users", "charts", type_="foreignkey")
        op.drop_index("ix_charts_owner_id", table_name="charts")
        op.drop_column("charts", "owner_id")

    if inspector.has_table("users"):
        op.drop_index("ix_users_email", table_name="users")
        op.drop_table("users")
