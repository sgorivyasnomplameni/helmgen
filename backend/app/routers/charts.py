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
    ChartReleaseHistoryResponse,
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
from app.services.chart_operations import ChartOperationsService
from app.services.chart_renderer import get_cluster_status
from app.services.helm_generator import build_chart_archive
from app.services.recommender import ChartParams, RecommendationSystem
from app.services.security import get_current_user

router = APIRouter()
_recommender = RecommendationSystem()


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
    service = ChartOperationsService(db, current_user)
    return await service.create_chart(data)


@router.get("/{chart_id}", response_model=ChartResponse)
async def get_chart(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.get_owned_chart(chart_id)


@router.patch("/{chart_id}", response_model=ChartResponse)
async def update_chart(
    chart_id: int,
    data: ChartUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.update_chart(chart_id, data)


@router.delete("/{chart_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chart(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    await service.delete_chart(chart_id)


@router.post("/{chart_id}/generate", response_model=ChartResponse)
async def generate(
    chart_id: int,
    body: ChartGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.generate_chart(chart_id, body)


@router.post("/{chart_id}/validate", response_model=ChartValidationResponse)
async def validate(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.validate_chart(chart_id)


@router.post("/{chart_id}/template", response_model=ChartTemplateResponse)
async def template_chart(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.render_chart_template(chart_id)


@router.post("/{chart_id}/deploy/dry-run", response_model=ChartDryRunResponse)
async def dry_run_deploy(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.dry_run_deploy(chart_id)


@router.post("/{chart_id}/deploy", response_model=ChartDeployResponse)
async def deploy(
    chart_id: int,
    body: ChartDeployRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.deploy_chart(chart_id, body)


@router.get("/{chart_id}/deploy/status", response_model=ChartReleaseStatusResponse)
async def release_status(
    chart_id: int,
    namespace: str | None = Query(default=None),
    release_name: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.release_status(
        chart_id,
        namespace=namespace,
        release_name=release_name,
    )


@router.get("/{chart_id}/deploy/monitoring", response_model=ChartMonitoringResponse)
async def monitoring(
    chart_id: int,
    namespace: str | None = Query(default=None),
    release_name: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.monitoring(
        chart_id,
        namespace=namespace,
        release_name=release_name,
    )


@router.get("/{chart_id}/deploy/history", response_model=ChartReleaseHistoryResponse)
async def release_history(
    chart_id: int,
    namespace: str | None = Query(default=None),
    release_name: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.release_history(
        chart_id,
        namespace=namespace,
        release_name=release_name,
    )


@router.post("/{chart_id}/deploy/rollback", response_model=ChartRollbackResponse)
async def rollback(
    chart_id: int,
    body: ChartRollbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.rollback_chart(chart_id, body)


@router.post("/{chart_id}/deploy/uninstall", response_model=ChartUninstallResponse)
async def uninstall(
    chart_id: int,
    body: ChartUninstallRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    return await service.uninstall_chart(chart_id, body)


@router.get("/{chart_id}/audit", response_model=list[AuditEventResponse])
async def chart_audit_events(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service = ChartOperationsService(db, current_user)
    chart = await service.get_owned_chart(chart_id)
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
    service = ChartOperationsService(db, current_user)
    chart = await service.get_owned_chart(chart_id)
    if not chart.generated_yaml:
        raise HTTPException(status_code=400, detail="Chart not generated yet")

    archive_bytes = build_chart_archive(chart)
    filename = f"{chart.name}-{chart.chart_version}.tgz"
    return StreamingResponse(
        io.BytesIO(archive_bytes),
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
