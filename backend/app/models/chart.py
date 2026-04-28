from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Chart(Base):
    __tablename__ = "charts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    chart_version: Mapped[str] = mapped_column(String(50), default="0.1.0")
    app_version: Mapped[str] = mapped_column(String(50), default="latest")
    values_yaml: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_yaml: Mapped[str | None] = mapped_column(Text, nullable=True)
    lifecycle_status: Mapped[str] = mapped_column(String(50), default="draft")
    validation_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    validation_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    template_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    template_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    templated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dry_run_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    dry_run_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    dry_run_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    dry_run_release_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dry_run_namespace: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dry_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deploy_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    deploy_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    deploy_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    deployed_release_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deployed_namespace: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deployed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
