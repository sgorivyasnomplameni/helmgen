from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.chart import Chart
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.services.audit import log_audit_event
from app.services.security import get_current_user

router = APIRouter()


async def _get_owned_project(db: AsyncSession, project_id: int, current_user: User) -> Project:
    project = await db.get(Project, project_id)
    if not project or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Project)
        .where(Project.owner_id == current_user.id)
        .order_by(Project.updated_at.desc(), Project.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = Project(
        owner_id=current_user.id,
        name=data.name.strip(),
        description=data.description.strip() if data.description else None,
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)
    log_audit_event(
        db,
        action="project.create",
        status="success",
        summary=f"Создан проект {project.name}.",
        user=current_user,
        entity_type="project",
    )
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_owned_project(db, project_id, current_user)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_owned_project(db, project_id, current_user)
    payload = data.model_dump(exclude_unset=True)
    if "name" in payload and payload["name"] is not None:
        project.name = payload["name"].strip()
    if "description" in payload:
        project.description = payload["description"].strip() if payload["description"] else None
    log_audit_event(
        db,
        action="project.update",
        status="success",
        summary=f"Обновлён проект {project.name}.",
        user=current_user,
        entity_type="project",
    )
    await db.flush()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await _get_owned_project(db, project_id, current_user)
    charts_count = await db.scalar(
        select(func.count(Chart.id)).where(Chart.project_id == project.id)
    )
    if charts_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Нельзя удалить проект, пока в нём есть chart.",
        )

    log_audit_event(
        db,
        action="project.delete",
        status="success",
        summary=f"Удалён проект {project.name}.",
        user=current_user,
        entity_type="project",
    )
    await db.delete(project)
