import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceResponse,
    WorkspaceDetailResponse,
    WorkspaceMemberResponse,
    AddWorkspaceMemberRequest,
    UpdateWorkspaceMemberRequest,
)
from app.schemas.user import UserResponse
from app.schemas.auth import MessageResponse
from app.api.deps import (
    get_current_user,
    get_current_workspace_user,
    require_workspace_role,
)

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


@router.get(
    "",
    response_model=List[WorkspaceResponse],
    summary="List accessible workspaces for the current user",
)
async def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
        .where(WorkspaceMember.user_id == current_user.id)
        .order_by(Workspace.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    workspaces = []
    for workspace, role in rows:
        item = WorkspaceResponse(
            id=workspace.id,
            name=workspace.name,
            created_at=workspace.created_at,
            role=role,
        )
        workspaces.append(item)

    return workspaces


@router.post(
    "",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workspace (assigns creator as owner)",
)
async def create_workspace(
    payload: WorkspaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace = Workspace(name=payload.name)
    db.add(workspace)
    await db.flush()

    membership = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(membership)
    await db.commit()
    await db.refresh(workspace)

    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        created_at=workspace.created_at,
        role="owner",
    )


@router.get(
    "/{workspace_id}",
    response_model=WorkspaceDetailResponse,
    summary="Get workspace details and members (guarded by tenancy check)",
)
async def get_workspace_detail(
    workspace_id: uuid.UUID,
    member: WorkspaceMember = Depends(get_current_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Workspace)
        .options(
            selectinload(Workspace.members).selectinload(WorkspaceMember.user)
        )
        .where(Workspace.id == workspace_id)
    )
    res = await db.execute(stmt)
    workspace = res.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    members_dto = [
        WorkspaceMemberResponse(
            workspace_id=m.workspace_id,
            user_id=m.user_id,
            role=m.role,
            user=UserResponse.model_validate(m.user) if m.user else None,
        )
        for m in workspace.members
    ]

    return WorkspaceDetailResponse(
        id=workspace.id,
        name=workspace.name,
        created_at=workspace.created_at,
        role=member.role,
        members=members_dto,
    )


@router.post(
    "/{workspace_id}/members",
    response_model=WorkspaceMemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a user to the workspace by email (requires owner or admin role)",
)
async def add_workspace_member(
    workspace_id: uuid.UUID,
    payload: AddWorkspaceMemberRequest,
    member: WorkspaceMember = Depends(require_workspace_role(["owner", "admin"])),
    db: AsyncSession = Depends(get_db),
):
    # Find user by email
    user_stmt = select(User).where(User.email == payload.email)
    user_res = await db.execute(user_stmt)
    target_user = user_res.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with email '{payload.email}' not found",
        )

    # Check if already a member
    existing_stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == target_user.id,
    )
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member of this workspace",
        )

    # Only owners can add another owner
    if payload.role == "owner" and member.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners can appoint new owners",
        )

    new_member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=target_user.id,
        role=payload.role,
    )
    db.add(new_member)
    await db.commit()

    return WorkspaceMemberResponse(
        workspace_id=workspace_id,
        user_id=target_user.id,
        role=payload.role,
        user=UserResponse.model_validate(target_user),
    )


@router.delete(
    "/{workspace_id}/members/{user_id}",
    response_model=MessageResponse,
    summary="Remove a user from workspace (requires owner or admin role)",
)
async def remove_workspace_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    member: WorkspaceMember = Depends(require_workspace_role(["owner", "admin"])),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    )
    res = await db.execute(stmt)
    target_member = res.scalar_one_or_none()

    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in workspace",
        )

    if target_member.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the workspace owner",
        )

    await db.delete(target_member)
    await db.commit()

    return MessageResponse(message="Member removed successfully")
