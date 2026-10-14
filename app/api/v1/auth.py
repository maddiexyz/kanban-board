import uuid
from typing import Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import jwt

from datetime import datetime, timezone
import anyio
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    DUMMY_PASSWORD_HASH,
)
from app.core.redis import block_token, is_token_blocked, consume_token
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshTokenRequest,
    MessageResponse,
)
from app.schemas.user import UserResponse, UserUpdate
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_refresh_cookie(response: Response, refresh_token: str, max_age: int) -> None:
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        max_age=max_age,
        expires=max_age,
        samesite=settings.COOKIE_SAMESITE,
        secure=settings.COOKIE_SECURE,
        path="/",
    )


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    payload: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    email_normalized = str(payload.email).lower().strip()

    # Check if email is already registered
    existing_stmt = select(User).where(User.email == email_normalized)
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    # Hash password in worker thread to prevent event loop starvation
    hashed_pw = await anyio.to_thread.run_sync(hash_password, payload.password)

    # Create new user
    display_name = payload.display_name or email_normalized.split("@")[0].capitalize()
    new_user = User(
        email=email_normalized,
        display_name=display_name,
        hashed_password=hashed_pw,
    )
    db.add(new_user)
    
    try:
        await db.flush()  # assign user.id

        # Create default workspace for new user
        default_workspace = Workspace(name="My Workspace")
        db.add(default_workspace)
        await db.flush()

        # Assign user as owner
        membership = WorkspaceMember(
            workspace_id=default_workspace.id,
            user_id=new_user.id,
            role="owner",
        )
        db.add(membership)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    await db.refresh(new_user)

    # Issue tokens
    access_token = create_access_token(subject=str(new_user.id))
    refresh_token, _, max_age = create_refresh_token(subject=str(new_user.id))
    _set_refresh_cookie(response, refresh_token, max_age)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(new_user),
    )


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="Authenticate and obtain JWT access token (sets HttpOnly refresh cookie)",
    openapi_extra={
        "requestBody": {
            "content": {
                "application/x-www-form-urlencoded": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "username": {"type": "string", "description": "Email address"},
                            "password": {"type": "string", "format": "password"},
                            "grant_type": {"type": "string", "default": "password"},
                            "client_id": {"type": "string"},
                            "client_secret": {"type": "string"},
                        },
                        "required": ["username", "password"],
                    }
                },
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "email": {"type": "string", "format": "email"},
                            "password": {"type": "string", "format": "password"},
                        },
                        "required": ["email", "password"],
                    }
                },
            }
        }
    },
)
@router.post(
    "/login",
    response_model=TokenResponse,
    include_in_schema=False,
)
async def login(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    email: Optional[str] = None
    password: Optional[str] = None

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            email = body.get("email") or body.get("username")
            password = body.get("password")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid JSON payload",
            )
    else:
        try:
            form = await request.form()
            email = str(form.get("username") or form.get("email") or "")
            password = str(form.get("password") or "")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid form data payload",
            )

    if not email or not password or not isinstance(email, str) or not isinstance(password, str):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing required valid string fields: email/username and password",
        )

    email_normalized = email.lower().strip()
    stmt = select(User).where(User.email == email_normalized)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    # Always verify password against real or dummy hash to prevent user enumeration via timing attack
    target_hash = user.hashed_password if user else DUMMY_PASSWORD_HASH
    is_valid = await anyio.to_thread.run_sync(verify_password, password, target_hash)

    if not user or not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(subject=str(user.id))
    refresh_token, _, max_age = create_refresh_token(subject=str(user.id))
    _set_refresh_cookie(response, refresh_token, max_age)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token using HttpOnly cookie or payload",
)
async def refresh_token(
    request: Request,
    response: Response,
    payload: Optional[RefreshTokenRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    # Try getting refresh token from cookie first, then request body
    token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not token and payload and payload.refresh_token:
        token = payload.refresh_token

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )

    try:
        token_payload = decode_token(token)
        if token_payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type: expected refresh token",
            )

        jti = token_payload.get("jti")
        if not jti:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )

        # Atomically consume old refresh token to prevent replay/race conditions
        exp = token_payload.get("exp", 0)
        now_ts = int(datetime.now(timezone.utc).timestamp())
        remaining = max(1, exp - now_ts) if exp > 0 else (86400 * settings.REFRESH_TOKEN_EXPIRE_DAYS)

        consumed = await consume_token(jti, remaining)
        if not consumed:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked or already used",
            )

        user_id_str = token_payload.get("sub")
        if not user_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )
        user_id = uuid.UUID(user_id_str)
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with token not found",
        )

    # Issue new access token and rotate refresh token
    new_access_token = create_access_token(subject=str(user.id))
    new_refresh_token, new_jti, max_age = create_refresh_token(subject=str(user.id))
    _set_refresh_cookie(response, new_refresh_token, max_age)

    return TokenResponse(
        access_token=new_access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout user and invalidate refresh token and access token",
)
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
):
    # Invalidate access token from Authorization header if present
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        access_token_str = auth_header.split(" ", 1)[1]
        try:
            acc_payload = decode_token(access_token_str)
            acc_jti = acc_payload.get("jti")
            if acc_jti:
                acc_exp = acc_payload.get("exp", 0)
                now_ts = int(datetime.now(timezone.utc).timestamp())
                acc_remaining = max(1, acc_exp - now_ts) if acc_exp > 0 else (settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
                await block_token(acc_jti, acc_remaining)
        except Exception:
            pass

    # Invalidate refresh token from cookie if present
    refresh_token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            jti = payload.get("jti")
            if jti:
                exp = payload.get("exp", 0)
                now_ts = int(datetime.now(timezone.utc).timestamp())
                remaining = max(1, exp - now_ts) if exp > 0 else (86400 * settings.REFRESH_TOKEN_EXPIRE_DAYS)
                await block_token(jti, remaining)
        except Exception:
            pass

    # Clear HttpOnly cookie
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        path="/",
        samesite=settings.COOKIE_SAMESITE,
        secure=settings.COOKIE_SECURE,
    )

    return MessageResponse(message="Successfully logged out")


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user profile",
)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    return current_user


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update current authenticated user profile (display name)",
)
async def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.display_name is not None:
        current_user.display_name = payload.display_name
        await db.commit()
        await db.refresh(current_user)
    return current_user

