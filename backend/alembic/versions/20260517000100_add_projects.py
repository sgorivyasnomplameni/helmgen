"""add projects

Revision ID: 20260517000100
Revises: 20260406033000
Create Date: 2026-05-17 00:01:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260517000100"
down_revision: Union[str, None] = "20260406033000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projects_id"), "projects", ["id"], unique=False)
    op.create_index(op.f("ix_projects_owner_id"), "projects", ["owner_id"], unique=False)

    op.add_column("charts", sa.Column("project_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_charts_project_id_projects", "charts", "projects", ["project_id"], ["id"])
    op.create_index(op.f("ix_charts_project_id"), "charts", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_charts_project_id"), table_name="charts")
    op.drop_constraint("fk_charts_project_id_projects", "charts", type_="foreignkey")
    op.drop_column("charts", "project_id")

    op.drop_index(op.f("ix_projects_owner_id"), table_name="projects")
    op.drop_index(op.f("ix_projects_id"), table_name="projects")
    op.drop_table("projects")
