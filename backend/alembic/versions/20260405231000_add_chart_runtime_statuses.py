"""add chart runtime statuses

Revision ID: 20260405231000
Revises: 20260331031138
Create Date: 2026-04-05 23:10:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260405231000"
down_revision: Union[str, None] = "20260331031138"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("charts", sa.Column("lifecycle_status", sa.String(length=50), nullable=False, server_default="draft"))
    op.add_column("charts", sa.Column("validation_status", sa.String(length=50), nullable=True))
    op.add_column("charts", sa.Column("validation_summary", sa.Text(), nullable=True))
    op.add_column("charts", sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("charts", sa.Column("template_status", sa.String(length=50), nullable=True))
    op.add_column("charts", sa.Column("template_summary", sa.Text(), nullable=True))
    op.add_column("charts", sa.Column("templated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("charts", sa.Column("dry_run_status", sa.String(length=50), nullable=True))
    op.add_column("charts", sa.Column("dry_run_summary", sa.Text(), nullable=True))
    op.add_column("charts", sa.Column("dry_run_output", sa.Text(), nullable=True))
    op.add_column("charts", sa.Column("dry_run_release_name", sa.String(length=255), nullable=True))
    op.add_column("charts", sa.Column("dry_run_namespace", sa.String(length=255), nullable=True))
    op.add_column("charts", sa.Column("dry_run_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("charts", sa.Column("deploy_status", sa.String(length=50), nullable=True))
    op.add_column("charts", sa.Column("deploy_summary", sa.Text(), nullable=True))
    op.add_column("charts", sa.Column("deploy_output", sa.Text(), nullable=True))
    op.add_column("charts", sa.Column("deployed_release_name", sa.String(length=255), nullable=True))
    op.add_column("charts", sa.Column("deployed_namespace", sa.String(length=255), nullable=True))
    op.add_column("charts", sa.Column("deployed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE charts SET lifecycle_status = 'draft' WHERE lifecycle_status IS NULL")
    op.alter_column("charts", "lifecycle_status", server_default=None)


def downgrade() -> None:
    op.drop_column("charts", "deployed_at")
    op.drop_column("charts", "deployed_namespace")
    op.drop_column("charts", "deployed_release_name")
    op.drop_column("charts", "deploy_output")
    op.drop_column("charts", "deploy_summary")
    op.drop_column("charts", "deploy_status")
    op.drop_column("charts", "dry_run_at")
    op.drop_column("charts", "dry_run_namespace")
    op.drop_column("charts", "dry_run_release_name")
    op.drop_column("charts", "dry_run_output")
    op.drop_column("charts", "dry_run_summary")
    op.drop_column("charts", "dry_run_status")
    op.drop_column("charts", "templated_at")
    op.drop_column("charts", "template_summary")
    op.drop_column("charts", "template_status")
    op.drop_column("charts", "validated_at")
    op.drop_column("charts", "validation_summary")
    op.drop_column("charts", "validation_status")
    op.drop_column("charts", "lifecycle_status")
