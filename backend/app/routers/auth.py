from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserResponse
from app.services.audit import log_audit_event
from app.services.security import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter()


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(User).where(User.email == data.email.lower()))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь с таким email уже существует.",
        )

    user = User(
        email=data.email.lower(),
        full_name=data.full_name.strip() if data.full_name else None,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    log_audit_event(
        db,
        action="auth.register",
        status="success",
        summary="Создан новый пользовательский аккаунт.",
        user=user,
        entity_type="auth",
    )

    return AuthResponse(access_token=create_access_token(user), user=user)


@router.post("/login", response_model=AuthResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == data.email.lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль.",
        )

    log_audit_event(
        db,
        action="auth.login",
        status="success",
        summary="Пользователь выполнил вход в систему.",
        user=user,
        entity_type="auth",
    )

    return AuthResponse(access_token=create_access_token(user), user=user)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
