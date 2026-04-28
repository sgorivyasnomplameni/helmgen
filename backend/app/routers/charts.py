from datetime import datetime, timezone
import io
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.audit_event import AuditEvent
from app.models.chart import Chart
from app.models.user import User
from app.schemas.audit import AuditEventResponse
from app.schemas.chart import (
    ChartCreate,
    ChartDeployRequest,
    ChartDeployResponse,
    ChartDryRunResponse,
    ChartGenerateRequest,
    ChartMonitoringResponse,
    ChartReleaseStatusResponse,
    ChartResponse,
    ChartRollbackRequest,
    ChartRollbackResponse,
    ChartTemplateResponse,
    ChartUninstallRequest,
    ChartUninstallResponse,
    ChartUpdate,
    ChartValidationResponse,
    ClusterStatusResponse,
)
from app.services.chart_renderer import (
    deploy_chart,
    dry_run_deploy_chart,
    get_cluster_status,
    monitor_release_chart,
    release_status_chart,
    render_chart_template,
    rollback_chart,
    uninstall_chart,
)
from app.services.audit import log_audit_event
from app.services.chart_validator import validate_chart
from app.services.helm_generator import build_chart_archive, generate_chart
from app.services.recommender import ChartParams, RecommendationSystem
from app.services.security import get_current_user

router = APIRouter()
_recommender = RecommendationSystem()


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


async def _get_owned_chart(db: AsyncSession, chart_id: int, current_user: User) -> Chart:
    chart = await db.get(Chart, chart_id)
    if not chart or chart.owner_id not in {None, current_user.id}:
        raise HTTPException(status_code=404, detail="Chart not found")
    return chart


@router.get("/recommendations", response_model=list[str])
async def get_recommendations(params: Annotated[ChartParams, Depends()]) -> list[str]:
    return _recommender.analyze(params)


@router.get("/cluster/status", response_model=ClusterStatusResponse)
async def cluster_status(current_user: User = Depends(get_current_user)) -> ClusterStatusResponse:
    return get_cluster_status()


@router.get("/", response_model=list[ChartResponse])
async def list_charts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Chart)
        .where(or_(Chart.owner_id == current_user.id, Chart.owner_id.is_(None)))
        .order_by(Chart.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=ChartResponse, status_code=status.HTTP_201_CREATED)
async def create_chart(
    data: ChartCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = Chart(**data.model_dump(), lifecycle_status="draft", owner_id=current_user.id)
    db.add(chart)
    await db.flush()
    await db.refresh(chart)
    log_audit_event(
        db,
        action="chart.create",
        status="success",
        summary=f"Создан chart {chart.name}.",
        user=current_user,
        chart=chart,
    )
    return chart


@router.get("/{chart_id}", response_model=ChartResponse)
async def get_chart(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_owned_chart(db, chart_id, current_user)


@router.patch("/{chart_id}", response_model=ChartResponse)
async def update_chart(
    chart_id: int,
    data: ChartUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(chart, field, value)
    log_audit_event(
        db,
        action="chart.update",
        status="success",
        summary=f"Обновлён chart {chart.name}.",
        user=current_user,
        chart=chart,
    )
    await db.flush()
    await db.refresh(chart)
    return chart


@router.delete("/{chart_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chart(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
    log_audit_event(
        db,
        action="chart.delete",
        status="success",
        summary=f"Удалён chart {chart.name}.",
        user=current_user,
        chart=chart,
    )
    await db.delete(chart)


@router.post("/{chart_id}/generate", response_model=ChartResponse)
async def generate(
    chart_id: int,
    body: ChartGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
    if body.values_yaml:
        chart.values_yaml = body.values_yaml
    chart.generated_yaml = generate_chart(chart)
    chart.lifecycle_status = "generated"
    _reset_runtime_states(chart)
    log_audit_event(
        db,
        action="chart.generate",
        status="success",
        summary=f"Собран chart {chart.name}.",
        user=current_user,
        chart=chart,
    )
    await db.flush()
    await db.refresh(chart)
    return chart


@router.post("/{chart_id}/validate", response_model=ChartValidationResponse)
async def validate(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
    result = validate_chart(chart)
    chart.validation_status = "passed" if result.valid else "failed"
    chart.validation_summary = result.summary
    chart.validated_at = _utcnow()
    if result.valid:
        chart.lifecycle_status = "validated"
    log_audit_event(
        db,
        action="chart.validate",
        status="success" if result.valid else "error",
        summary=result.summary,
        user=current_user,
        chart=chart,
        details="\n".join(result.errors or result.warnings or result.checks[:10]) or None,
    )
    await db.flush()
    return result


@router.post("/{chart_id}/template", response_model=ChartTemplateResponse)
async def template_chart(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
    result = render_chart_template(chart)
    chart.template_status = "passed" if result.success else "failed"
    chart.template_summary = result.summary
    chart.templated_at = _utcnow()
    if result.success:
        chart.lifecycle_status = "templated"
    log_audit_event(
        db,
        action="chart.template",
        status="success" if result.success else "error",
        summary=result.summary,
        user=current_user,
        chart=chart,
        details="\n".join(result.errors or result.warnings) or None,
    )
    await db.flush()
    return result


@router.post("/{chart_id}/deploy/dry-run", response_model=ChartDryRunResponse)
async def dry_run_deploy(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
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
        db,
        action="chart.dry_run",
        status="success" if result.success else "error",
        summary=result.summary,
        user=current_user,
        chart=chart,
        details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
    )
    await db.flush()
    return result


@router.post("/{chart_id}/deploy", response_model=ChartDeployResponse)
async def deploy(
    chart_id: int,
    body: ChartDeployRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
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
        db,
        action="chart.deploy",
        status="success" if result.success else "error",
        summary=result.summary,
        user=current_user,
        chart=chart,
        details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
    )
    await db.flush()
    return result


@router.get("/{chart_id}/deploy/status", response_model=ChartReleaseStatusResponse)
async def release_status(
    chart_id: int,
    namespace: str | None = Query(default=None),
    release_name: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
    result = release_status_chart(
        chart,
        namespace=namespace or chart.deployed_namespace or "helmgen-demo",
        release_name=release_name or chart.deployed_release_name or chart.name,
    )
    log_audit_event(
        db,
        action="chart.release_status",
        status="success" if result.success else "error",
        summary=result.summary,
        user=current_user,
        chart=chart,
        details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
    )
    await db.flush()
    return result


@router.get("/{chart_id}/deploy/monitoring", response_model=ChartMonitoringResponse)
async def monitoring(
    chart_id: int,
    namespace: str | None = Query(default=None),
    release_name: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
    result = monitor_release_chart(
        chart,
        namespace=namespace or chart.deployed_namespace or "helmgen-demo",
        release_name=release_name or chart.deployed_release_name or chart.name,
    )
    log_audit_event(
        db,
        action="chart.monitoring",
        status="success" if result.success else "error",
        summary=result.summary,
        user=current_user,
        chart=chart,
        details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
    )
    await db.flush()
    return result


@router.post("/{chart_id}/deploy/rollback", response_model=ChartRollbackResponse)
async def rollback(
    chart_id: int,
    body: ChartRollbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
    result = rollback_chart(chart, namespace=body.namespace, release_name=body.release_name, revision=body.revision)
    chart.deploy_status = "passed" if result.success else "rollback_failed"
    chart.deploy_summary = result.summary
    chart.deploy_output = result.output
    chart.deployed_release_name = result.release_name
    chart.deployed_namespace = result.namespace
    if result.success:
        chart.deployed_at = _utcnow()
        chart.lifecycle_status = "deployed"
    log_audit_event(
        db,
        action="chart.rollback",
        status="success" if result.success else "error",
        summary=result.summary,
        user=current_user,
        chart=chart,
        details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
    )
    await db.flush()
    return result


@router.post("/{chart_id}/deploy/uninstall", response_model=ChartUninstallResponse)
async def uninstall(
    chart_id: int,
    body: ChartUninstallRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
    result = uninstall_chart(chart, namespace=body.namespace, release_name=body.release_name)
    chart.deploy_status = "removed" if result.success else "remove_failed"
    chart.deploy_summary = result.summary
    chart.deploy_output = result.output
    chart.deployed_release_name = result.release_name
    chart.deployed_namespace = result.namespace
    if result.success:
        chart.lifecycle_status = "undeployed"
    log_audit_event(
        db,
        action="chart.uninstall",
        status="success" if result.success else "error",
        summary=result.summary,
        user=current_user,
        chart=chart,
        details=result.output[:4000] if result.output else ("\n".join(result.errors) or None),
    )
    await db.flush()
    return result


@router.get("/{chart_id}/audit", response_model=list[AuditEventResponse])
async def chart_audit_events(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
    result = await db.execute(
        select(AuditEvent)
        .where(AuditEvent.chart_id == chart.id)
        .order_by(AuditEvent.created_at.desc())
        .limit(30)
    )
    return result.scalars().all()


@router.get("/{chart_id}/download")
async def download_chart(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chart = await _get_owned_chart(db, chart_id, current_user)
    if not chart.generated_yaml:
        raise HTTPException(status_code=400, detail="Chart not generated yet")

    archive_bytes = build_chart_archive(chart)
    filename = f"{chart.name}-{chart.chart_version}.tgz"
    return StreamingResponse(
        io.BytesIO(archive_bytes),
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
