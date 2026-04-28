from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.audit_event import AuditEvent
from app.models.user import User
from app.schemas.audit import AuditEventResponse
from app.services.security import get_current_user

router = APIRouter()


@router.get("/recent", response_model=list[AuditEventResponse])
async def recent_audit_events(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AuditEvent)
        .where(AuditEvent.user_id == current_user.id)
        .order_by(desc(AuditEvent.created_at))
        .limit(max(1, min(limit, 100)))
    )
    return result.scalars().all()
