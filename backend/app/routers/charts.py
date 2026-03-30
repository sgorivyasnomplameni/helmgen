from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.chart import Chart
from app.schemas.chart import ChartCreate, ChartUpdate, ChartResponse, ChartGenerateRequest
from app.services.helm_generator import generate_chart

router = APIRouter()


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
