from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.chart import Chart
from app.models.user import User


def log_audit_event(
    db: AsyncSession,
    *,
    action: str,
    status: str,
    summary: str,
    user: User | None = None,
    chart: Chart | None = None,
    details: str | None = None,
    entity_type: str = "chart",
) -> AuditEvent:
    event = AuditEvent(
        user_id=user.id if user else None,
        chart_id=chart.id if chart else None,
        action=action,
        entity_type=entity_type,
        status=status,
        summary=summary,
        details=details,
    )
    db.add(event)
    return event
