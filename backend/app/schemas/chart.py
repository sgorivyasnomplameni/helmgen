from datetime import datetime
from pydantic import BaseModel


class ChartBase(BaseModel):
    name: str
    description: str | None = None
    chart_version: str = "0.1.0"
    app_version: str = "latest"
    values_yaml: str | None = None


class ChartCreate(ChartBase):
    pass


class ChartUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    chart_version: str | None = None
    app_version: str | None = None
    values_yaml: str | None = None


class ChartResponse(ChartBase):
    id: int
    generated_yaml: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChartGenerateRequest(BaseModel):
    values_yaml: str | None = None


class ChartValidationResponse(BaseModel):
    valid: bool
    errors: list[str]
    warnings: list[str]
    checks: list[str]
    engine: str = "builtin"
    summary: str = ""
