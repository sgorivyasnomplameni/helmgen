from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chart import Chart
from app.models.user import User
from app.schemas.chart import (
    ChartCreate,
    ChartDeployRequest,
    ChartGenerateRequest,
    ChartRollbackRequest,
    ChartUninstallRequest,
    ChartUpdate,
)
from app.services.audit import log_audit_event
from app.services.chart_renderer import (
    DeployResult,
    DryRunDeployResult,
    MonitoringResult,
    ReleaseHistoryResult,
    ReleaseStatusResult,
    RollbackResult,
    TemplateResult,
    UninstallResult,
    deploy_chart,
    dry_run_deploy_chart,
    monitor_release_chart,
    release_history_chart,
    release_status_chart,
    render_chart_template,
    rollback_chart,
    uninstall_chart,
)
from app.services.chart_validator import ValidationResult, validate_chart
from app.services.helm_generator import generate_chart


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _reset_runtime_states(chart: Chart) -> None:
    chart.validation_status = None
    chart.validation_summary = None
    chart.validated_at = None
    chart.template_status = None
    chart.template_summary = None
    chart.templated_at = None
    chart.dry_run_status = None
    chart.dry_run_summary = None
    chart.dry_run_output = None
    chart.dry_run_release_name = None
    chart.dry_run_namespace = None
    chart.dry_run_at = None
    chart.deploy_status = None
    chart.deploy_summary = None
    chart.deploy_output = None
    chart.deployed_release_name = None
    chart.deployed_namespace = None
    chart.deployed_at = None


class ChartOperationsService:
    def __init__(self, db: AsyncSession, current_user: User):
        self.db = db
        self.current_user = current_user

    async def get_owned_chart(self, chart_id: int) -> Chart:
        chart = await self.db.get(Chart, chart_id)
        if not chart or chart.owner_id not in {None, self.current_user.id}:
            raise HTTPException(status_code=404, detail="Chart not found")
        return chart

    async def create_chart(self, data: ChartCreate) -> Chart:
        chart = Chart(**data.model_dump(), lifecycle_status="draft", owner_id=self.current_user.id)
        self.db.add(chart)
        await self.db.flush()
        await self.db.refresh(chart)
        log_audit_event(
            self.db,
            action="chart.create",
            status="success",
            summary=f"Создан chart {chart.name}.",
            user=self.current_user,
            chart=chart,
        )
        return chart

    async def update_chart(self, chart_id: int, data: ChartUpdate) -> Chart:
        chart = await self.get_owned_chart(chart_id)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(chart, field, value)
        log_audit_event(
            self.db,
            action="chart.update",
            status="success",
            summary=f"Обновлён chart {chart.name}.",
            user=self.current_user,
            chart=chart,
        )
        await self.db.flush()
        await self.db.refresh(chart)
        return chart

    async def delete_chart(self, chart_id: int) -> None:
        chart = await self.get_owned_chart(chart_id)
        log_audit_event(
            self.db,
            action="chart.delete",
            status="success",
            summary=f"Удалён chart {chart.name}.",
            user=self.current_user,
            chart=chart,
        )
        await self.db.delete(chart)

    async def generate_chart(self, chart_id: int, body: ChartGenerateRequest) -> Chart:
        chart = await self.get_owned_chart(chart_id)
        if body.values_yaml:
            chart.values_yaml = body.values_yaml
        chart.generated_yaml = generate_chart(chart)
        chart.lifecycle_status = "generated"
        _reset_runtime_states(chart)
        log_audit_event(
            self.db,
            action="chart.generate",
            status="success",
            summary=f"Собран chart {chart.name}.",
            user=self.current_user,
            chart=chart,
        )
        await self.db.flush()
        await self.db.refresh(chart)
        return chart

    async def validate_chart(self, chart_id: int) -> ValidationResult:
        chart = await self.get_owned_chart(chart_id)
        result = validate_chart(chart)
        chart.validation_status = "passed" if result.valid else "failed"
        chart.validation_summary = result.summary
        chart.validated_at = _utcnow()
        if result.valid:
            chart.lifecycle_status = "validated"
        log_audit_event(
            self.db,
            action="chart.validate",
            status="success" if result.valid else "error",
            summary=result.summary,
            user=self.current_user,
            chart=chart,
            details="\n".join(result.errors or result.warnings or result.checks[:10]) or None,
        )
        await self.db.flush()
        return result

    async def render_chart_template(self, chart_id: int) -> TemplateResult:
        chart = await self.get_owned_chart(chart_id)
        result = render_chart_template(chart)
        chart.template_status = "passed" if result.success else "failed"
        chart.template_summary = result.summary
        chart.templated_at = _utcnow()
        if result.success:
            chart.lifecycle_status = "templated"
        log_audit_event(
            self.db,
            action="chart.template",
            status="success" if result.success else "error",
            summary=result.summary,
            user=self.current_user,
            chart=chart,
            details="\n".join(result.errors or result.warnings) or None,
        )
        await self.db.flush()
        return result

    async def dry_run_deploy(self, chart_id: int) -> DryRunDeployResult:
        chart = await self.get_owned_chart(chart_id)
        result = dry_run_deploy_chart(chart)
        chart.dry_run_status = "passed" if result.success else "failed"
        chart.dry_run_summary = result.summary
        chart.dry_run_output = result.output
        chart.dry_run_release_name = f"{chart.name or 'chart'}-release"
        chart.dry_run_namespace = "helmgen-preview"
        chart.dry_run_at = _utcnow()
        if result.success:
            chart.lifecycle_status = "dry_run_ready"
        log_audit_event(
            self.db,
            action="chart.dry_run",
            status="success" if result.success else "error",
            summary=result.summary,
            user=self.current_user,
            chart=chart,
            details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
        )
        await self.db.flush()
        return result

    async def deploy_chart(self, chart_id: int, body: ChartDeployRequest) -> DeployResult:
        chart = await self.get_owned_chart(chart_id)
        result = deploy_chart(chart, namespace=body.namespace, release_name=body.release_name)
        chart.deploy_status = "passed" if result.success else "failed"
        chart.deploy_summary = result.summary
        chart.deploy_output = result.output
        chart.deployed_release_name = result.release_name
        chart.deployed_namespace = result.namespace
        chart.deployed_at = _utcnow()
        if result.success:
            chart.lifecycle_status = "deployed"
        log_audit_event(
            self.db,
            action="chart.deploy",
            status="success" if result.success else "error",
            summary=result.summary,
            user=self.current_user,
            chart=chart,
            details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
        )
        await self.db.flush()
        return result

    async def release_status(
        self,
        chart_id: int,
        *,
        namespace: str | None,
        release_name: str | None,
    ) -> ReleaseStatusResult:
        chart = await self.get_owned_chart(chart_id)
        result = release_status_chart(
            chart,
            namespace=namespace or chart.deployed_namespace or "helmgen-demo",
            release_name=release_name or chart.deployed_release_name or chart.name,
        )
        log_audit_event(
            self.db,
            action="chart.release_status",
            status="success" if result.success else "error",
            summary=result.summary,
            user=self.current_user,
            chart=chart,
            details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
        )
        await self.db.flush()
        return result

    async def monitoring(
        self,
        chart_id: int,
        *,
        namespace: str | None,
        release_name: str | None,
    ) -> MonitoringResult:
        chart = await self.get_owned_chart(chart_id)
        result = monitor_release_chart(
            chart,
            namespace=namespace or chart.deployed_namespace or "helmgen-demo",
            release_name=release_name or chart.deployed_release_name or chart.name,
        )
        log_audit_event(
            self.db,
            action="chart.monitoring",
            status="success" if result.success else "error",
            summary=result.summary,
            user=self.current_user,
            chart=chart,
            details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
        )
        await self.db.flush()
        return result

    async def release_history(
        self,
        chart_id: int,
        *,
        namespace: str | None,
        release_name: str | None,
    ) -> ReleaseHistoryResult:
        chart = await self.get_owned_chart(chart_id)
        result = release_history_chart(
            chart,
            namespace=namespace or chart.deployed_namespace or "helmgen-demo",
            release_name=release_name or chart.deployed_release_name or chart.name,
        )
        log_audit_event(
            self.db,
            action="chart.release_history",
            status="success" if result.success else "error",
            summary=result.summary,
            user=self.current_user,
            chart=chart,
            details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
        )
        await self.db.flush()
        return result

    async def rollback_chart(self, chart_id: int, body: ChartRollbackRequest) -> RollbackResult:
        chart = await self.get_owned_chart(chart_id)
        result = rollback_chart(
            chart,
            namespace=body.namespace,
            release_name=body.release_name,
            revision=body.revision,
        )
        chart.deploy_status = "passed" if result.success else "rollback_failed"
        chart.deploy_summary = result.summary
        chart.deploy_output = result.output
        chart.deployed_release_name = result.release_name
        chart.deployed_namespace = result.namespace
        if result.success:
            chart.deployed_at = _utcnow()
            chart.lifecycle_status = "deployed"
        log_audit_event(
            self.db,
            action="chart.rollback",
            status="success" if result.success else "error",
            summary=result.summary,
            user=self.current_user,
            chart=chart,
            details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
        )
        await self.db.flush()
        return result

    async def uninstall_chart(self, chart_id: int, body: ChartUninstallRequest) -> UninstallResult:
        chart = await self.get_owned_chart(chart_id)
        result = uninstall_chart(chart, namespace=body.namespace, release_name=body.release_name)
        chart.deploy_status = "removed" if result.success else "remove_failed"
        chart.deploy_summary = result.summary
        chart.deploy_output = result.output
        chart.deployed_release_name = result.release_name
        chart.deployed_namespace = result.namespace
        if result.success:
            chart.lifecycle_status = "undeployed"
        log_audit_event(
            self.db,
            action="chart.uninstall",
            status="success" if result.success else "error",
            summary=result.summary,
            user=self.current_user,
            chart=chart,
            details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
        )
        await self.db.flush()
        return result
