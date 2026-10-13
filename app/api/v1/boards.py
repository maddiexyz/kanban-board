import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.models.board import Board, Column, Card
from app.schemas.board import (
    BoardCreate,
    BoardUpdate,
    BoardResponse,
    BoardDetailResponse,
    ColumnDetailResponse,
    CardResponse,
)
from app.schemas.auth import MessageResponse
from app.api.deps import (
    get_current_user,
    get_current_workspace_user,
    require_workspace_role,
)
from app.services.lexorank import generate_spaced_ranks

router = APIRouter(tags=["Boards"])


async def check_board_access(
    board_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> Board:
    """Helper to verify user has workspace membership for target board."""
    stmt = (
        select(Board)
        .options(
            selectinload(Board.columns).selectinload(Column.cards)
        )
        .where(Board.id == board_id)
    )
    res = await db.execute(stmt)
    board = res.scalar_one_or_none()

    if not board:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Board not found",
        )

    # Check tenancy
    member_stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == board.workspace_id,
        WorkspaceMember.user_id == user.id,
    )
    member_res = await db.execute(member_stmt)
    if not member_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You are not a member of this workspace",
        )

    return board


@router.post(
    "/workspaces/{workspace_id}/boards",
    response_model=BoardResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new board in a workspace",
)
async def create_board(
    workspace_id: uuid.UUID,
    payload: BoardCreate,
    member: WorkspaceMember = Depends(get_current_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    board = Board(
        workspace_id=workspace_id,
        title=payload.title,
    )
    db.add(board)
    await db.flush()

    # Pre-populate 3 default columns: To Do, In Progress, Done
    default_ranks = generate_spaced_ranks(3)
    default_cols = [
        Column(board_id=board.id, title="To Do", rank=default_ranks[0]),
        Column(board_id=board.id, title="In Progress", rank=default_ranks[1]),
        Column(board_id=board.id, title="Done", rank=default_ranks[2]),
    ]
    db.add_all(default_cols)
    await db.commit()
    await db.refresh(board)

    return board


@router.get(
    "/workspaces/{workspace_id}/boards",
    response_model=List[BoardResponse],
    summary="List all boards in a workspace",
)
async def list_workspace_boards(
    workspace_id: uuid.UUID,
    member: WorkspaceMember = Depends(get_current_workspace_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Board)
        .where(Board.workspace_id == workspace_id)
        .order_by(Board.created_at.desc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get(
    "/boards/{board_id}",
    response_model=BoardDetailResponse,
    summary="Get board detail with ordered columns and cards",
)
async def get_board(
    board_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await check_board_access(board_id, current_user, db)

    # Sort columns by rank, and each column's cards by rank
    sorted_columns = sorted(board.columns, key=lambda c: c.rank)
    columns_dto: List[ColumnDetailResponse] = []
    for col in sorted_columns:
        sorted_cards = sorted(col.cards, key=lambda card: card.rank)
        cards_dto = [CardResponse.model_validate(card) for card in sorted_cards]
        col_dto = ColumnDetailResponse(
            id=col.id,
            board_id=col.board_id,
            title=col.title,
            rank=col.rank,
            created_at=col.created_at,
            cards=cards_dto,
        )
        columns_dto.append(col_dto)

    return BoardDetailResponse(
        id=board.id,
        workspace_id=board.workspace_id,
        title=board.title,
        created_at=board.created_at,
        columns=columns_dto,
    )


@router.patch(
    "/boards/{board_id}",
    response_model=BoardResponse,
    summary="Update board title",
)
async def update_board(
    board_id: uuid.UUID,
    payload: BoardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await check_board_access(board_id, current_user, db)
    if payload.title is not None:
        board.title = payload.title
    await db.commit()
    await db.refresh(board)
    return board


@router.delete(
    "/boards/{board_id}",
    response_model=MessageResponse,
    summary="Delete board (requires owner or admin role)",
)
async def delete_board(
    board_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await check_board_access(board_id, current_user, db)
    
    # Check if user is owner/admin
    member_stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == board.workspace_id,
        WorkspaceMember.user_id == current_user.id,
    )
    member_res = await db.execute(member_stmt)
    member = member_res.scalar_one_or_none()
    if not member or member.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners or admins can delete boards",
        )

    await db.delete(board)
    await db.commit()
    return MessageResponse(message="Board deleted successfully")
