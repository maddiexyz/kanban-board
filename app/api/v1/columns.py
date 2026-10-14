import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.user import User
from app.models.board import Board, Column, Card
from app.models.workspace import WorkspaceMember
from app.schemas.board import (
    ColumnCreate,
    ColumnUpdate,
    ColumnResponse,
    ColumnDetailResponse,
    CardResponse,
)
from app.schemas.auth import MessageResponse
from app.api.deps import get_current_user
from app.api.v1.boards import check_board_access
from app.services.lexorank import between, rebalance_column_cards, RankSpaceExhausted
from app.services.websocket_manager import manager

router = APIRouter(tags=["Columns"])


async def check_column_access(
    column_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> Column:
    """Helper to verify user has workspace membership for target column's board."""
    stmt = select(Column).where(Column.id == column_id)
    res = await db.execute(stmt)
    column = res.scalar_one_or_none()

    if not column:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Column not found",
        )

    # Verify board tenancy
    await check_board_access(column.board_id, user, db)
    return column


async def check_column_management_role(
    column: Column,
    user: User,
    db: AsyncSession,
) -> None:
    """Helper to verify user has owner or admin role in target column's workspace."""
    board_stmt = select(Board.workspace_id).where(Board.id == column.board_id)
    res = await db.execute(board_stmt)
    workspace_id = res.scalar_one_or_none()
    if not workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found for board",
        )

    member_stmt = select(WorkspaceMember.role).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user.id,
    )
    member_res = await db.execute(member_stmt)
    role = member_res.scalar_one_or_none()

    if role not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners and admins can perform this action",
        )


@router.post(
    "/boards/{board_id}/columns",
    response_model=ColumnResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new column on a board with calculated Lexorank",
)
async def create_column(
    board_id: uuid.UUID,
    payload: ColumnCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await check_board_access(board_id, current_user, db)

    # Enforce maximum 10 columns per board
    count_stmt = select(func.count()).select_from(Column).where(Column.board_id == board_id)
    count_res = await db.execute(count_stmt)
    column_count = count_res.scalar_one()
    if column_count >= 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A board can have a maximum of 10 columns.",
        )

    # Compute rank if not provided
    rank = payload.rank
    if not rank:
        try:
            if payload.prev_rank or payload.next_rank:
                rank = between(payload.prev_rank, payload.next_rank)
            else:
                # Place at the end of columns
                cols_stmt = (
                    select(Column.rank)
                    .where(Column.board_id == board_id)
                    .order_by(Column.rank.desc())
                    .limit(1)
                )
                cols_res = await db.execute(cols_stmt)
                last_rank = cols_res.scalar_one_or_none()
                rank = between(last_rank, None)
        except RankSpaceExhausted as e:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Rank space exhausted between {e.prev_rank} and {e.next_rank}",
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            )

    col = Column(
        board_id=board_id,
        title=payload.title,
        rank=rank,
    )
    db.add(col)
    await db.commit()
    await db.refresh(col)

    # Broadcast event
    await manager.broadcast_event(
        board_id,
        "COLUMN_CREATED",
        {
            "column_id": str(col.id),
            "board_id": str(board_id),
            "title": col.title,
            "rank": col.rank,
            "actor_user_id": str(current_user.id),
        },
    )

    return col


@router.patch(
    "/columns/{column_id}",
    response_model=ColumnResponse,
    summary="Update column title",
)
async def update_column(
    column_id: uuid.UUID,
    payload: ColumnUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    column = await check_column_access(column_id, current_user, db)
    if payload.title is not None:
        column.title = payload.title
    await db.commit()
    await db.refresh(column)

    # Broadcast event
    await manager.broadcast_event(
        column.board_id,
        "COLUMN_UPDATED",
        {
            "column_id": str(column.id),
            "board_id": str(column.board_id),
            "title": column.title,
            "actor_user_id": str(current_user.id),
        },
    )

    return column


@router.delete(
    "/columns/{column_id}",
    response_model=MessageResponse,
    summary="Delete column (cascades cards)",
)
async def delete_column(
    column_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    column = await check_column_access(column_id, current_user, db)
    await check_column_management_role(column, current_user, db)
    board_id = column.board_id
    col_id_str = str(column.id)

    await db.delete(column)
    await db.commit()

    # Broadcast event
    await manager.broadcast_event(
        board_id,
        "COLUMN_DELETED",
        {
            "column_id": col_id_str,
            "board_id": str(board_id),
            "actor_user_id": str(current_user.id),
        },
    )

    return MessageResponse(message="Column deleted successfully")


@router.post(
    "/columns/{column_id}/rebalance",
    response_model=MessageResponse,
    summary="Manually trigger Lexorank rebalancing for a column",
)
async def trigger_column_rebalance(
    column_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    column = await check_column_access(column_id, current_user, db)
    await check_column_management_role(column, current_user, db)
    cards = await rebalance_column_cards(db, column_id)

    # Broadcast event
    await manager.broadcast_event(
        column.board_id,
        "COLUMN_REBALANCED",
        {
            "column_id": str(column.id),
            "board_id": str(column.board_id),
            "cards": [{"card_id": str(c.id), "rank": c.rank} for c in cards],
        },
    )

    return MessageResponse(message=f"Rebalanced {len(cards)} cards in column")
