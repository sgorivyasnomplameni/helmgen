from datetime import datetime

from pydantic import BaseModel


class AuditEventResponse(BaseModel):
    id: int
    user_id: int | None = None
    chart_id: int | None = None
    action: str
    entity_type: str
    status: str
    summary: str
    details: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
