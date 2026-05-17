"""set null audit chart foreign key

Revision ID: 20260517000200
Revises: 20260517000100
Create Date: 2026-05-17 00:02:00
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260517000200"
down_revision: Union[str, None] = "20260517000100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("audit_events_chart_id_fkey", "audit_events", type_="foreignkey")
    op.create_foreign_key(
        "audit_events_chart_id_fkey",
        "audit_events",
        "charts",
        ["chart_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("audit_events_chart_id_fkey", "audit_events", type_="foreignkey")
    op.create_foreign_key(
        "audit_events_chart_id_fkey",
        "audit_events",
        "charts",
        ["chart_id"],
        ["id"],
    )
