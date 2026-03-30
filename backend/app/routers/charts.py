from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
import io

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.chart import Chart
from app.schemas.chart import ChartCreate, ChartUpdate, ChartResponse, ChartGenerateRequest
from app.services.helm_generator import build_chart_archive, generate_chart
from app.services.recommender import ChartParams, RecommendationSystem

router = APIRouter()
_recommender = RecommendationSystem()


# Declared before /{chart_id} routes to avoid path-parameter shadowing.
@router.get("/recommendations", response_model=list[str])
async def get_recommendations(params: Annotated[ChartParams, Depends()]) -> list[str]:
    return _recommender.analyze(params)


@router.get("/", response_model=list[ChartResponse])
async def list_charts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Chart).order_by(Chart.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=ChartResponse, status_code=status.HTTP_201_CREATED)
async def create_chart(data: ChartCreate, db: AsyncSession = Depends(get_db)):
    chart = Chart(**data.model_dump())
    db.add(chart)
    await db.flush()
    await db.refresh(chart)
    return chart


@router.get("/{chart_id}", response_model=ChartResponse)
async def get_chart(chart_id: int, db: AsyncSession = Depends(get_db)):
    chart = await db.get(Chart, chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    return chart


@router.patch("/{chart_id}", response_model=ChartResponse)
async def update_chart(
    chart_id: int, data: ChartUpdate, db: AsyncSession = Depends(get_db)
):
    chart = await db.get(Chart, chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(chart, field, value)
    await db.flush()
    await db.refresh(chart)
    return chart


@router.delete("/{chart_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chart(chart_id: int, db: AsyncSession = Depends(get_db)):
    chart = await db.get(Chart, chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    await db.delete(chart)


@router.post("/{chart_id}/generate", response_model=ChartResponse)
async def generate(
    chart_id: int,
    body: ChartGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    chart = await db.get(Chart, chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    if body.values_yaml:
        chart.values_yaml = body.values_yaml
    chart.generated_yaml = generate_chart(chart)
    await db.flush()
    await db.refresh(chart)
    return chart


@router.get("/{chart_id}/download")
async def download_chart(
    chart_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    chart = await db.get(Chart, chart_id)
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    if not chart.generated_yaml:
        raise HTTPException(status_code=400, detail="Chart not generated yet")

    archive_bytes = build_chart_archive(chart)
    filename = f"{chart.name}-{chart.chart_version}.tgz"

    return StreamingResponse(
        io.BytesIO(archive_bytes),
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
