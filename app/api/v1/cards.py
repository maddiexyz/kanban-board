import json
import uuid
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, AsyncSessionLocal
from app.core.redis import get_redis
from app.models.user import User
from app.models.board import Board, Column, Card
from app.schemas.board import (
    CardCreate,
    CardUpdate,
    CardMoveRequest,
    CardResponse,
)
from app.schemas.auth import MessageResponse
from app.api.deps import get_current_user
from app.api.v1.boards import check_board_access
from app.api.v1.columns import check_column_access
from app.services.websocket_manager import manager
from app.services.lexorank import (
    between,
    needs_rebalance,
    rebalance_column_cards,
)

router = APIRouter(tags=["Cards"])


async def bg_rebalance(board_id: uuid.UUID, column_id: uuid.UUID):
    """Background task to rebalance column ranks and broadcast event."""
    async with AsyncSessionLocal() as session:
        try:
            cards = await rebalance_column_cards(session, column_id)
            await manager.broadcast_event(
                board_id,
                "COLUMN_REBALANCED",
                {
                    "column_id": str(column_id),
                    "board_id": str(board_id),
                    "cards": [{"card_id": str(c.id), "rank": c.rank} for c in cards],
                },
            )
        except Exception as e:
            print(f"[Lexorank Background Rebalance Error]: {e}")


async def check_card_access(
    card_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> Card:
    """Helper to verify user has workspace membership for target card's board."""
    stmt = select(Card).where(Card.id == card_id)
    res = await db.execute(stmt)
    card = res.scalar_one_or_none()

    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card not found",
        )

    # Verify board tenancy
    await check_board_access(card.board_id, user, db)
    return card


@router.post(
    "/columns/{column_id}/cards",
    response_model=CardResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new card in a column with calculated Lexorank",
)
async def create_card(
    column_id: uuid.UUID,
    payload: CardCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    column = await check_column_access(column_id, current_user, db)

    # Calculate rank
    rank = payload.rank
    if not rank:
        if payload.prev_rank or payload.next_rank:
            rank = between(payload.prev_rank, payload.next_rank)
        elif payload.position == "start":
            first_stmt = (
                select(Card.rank)
                .where(Card.column_id == column_id)
                .order_by(Card.rank.asc())
                .limit(1)
            )
            first_res = await db.execute(first_stmt)
            first_rank = first_res.scalar_one_or_none()
            rank = between(None, first_rank)
        else:
            last_stmt = (
                select(Card.rank)
                .where(Card.column_id == column_id)
                .order_by(Card.rank.desc())
                .limit(1)
            )
            last_res = await db.execute(last_stmt)
            last_rank = last_res.scalar_one_or_none()
            rank = between(last_rank, None)

    card = Card(
        column_id=column_id,
        board_id=column.board_id,
        title=payload.title,
        description=payload.description,
        assignee_id=payload.assignee_id,
        rank=rank,
        version=1,
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)

    # Check if rebalance needed
    if needs_rebalance(card.rank):
        background_tasks.add_task(bg_rebalance, card.board_id, column_id)

    # Broadcast event
    await manager.broadcast_event(
        card.board_id,
        "CARD_CREATED",
        {
            "card_id": str(card.id),
            "column_id": str(column_id),
            "board_id": str(card.board_id),
            "title": card.title,
            "description": card.description,
            "assignee_id": str(card.assignee_id) if card.assignee_id else None,
            "rank": card.rank,
            "version": card.version,
            "actor_user_id": str(current_user.id),
        },
    )

    return card


@router.get(
    "/cards/{card_id}",
    response_model=CardResponse,
    summary="Get card by ID",
)
async def get_card(
    card_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await check_card_access(card_id, current_user, db)


@router.patch(
    "/cards/{card_id}",
    response_model=CardResponse,
    summary="Update card title or description",
)
async def update_card(
    card_id: uuid.UUID,
    payload: CardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await check_card_access(card_id, current_user, db)
    if payload.title is not None:
        card.title = payload.title
    if payload.description is not None:
        card.description = payload.description
    if "assignee_id" in payload.model_fields_set:
        card.assignee_id = payload.assignee_id

    card.version += 1
    await db.commit()
    await db.refresh(card)

    await manager.broadcast_event(
        card.board_id,
        "CARD_UPDATED",
        {
            "card_id": str(card.id),
            "column_id": str(card.column_id),
            "board_id": str(card.board_id),
            "title": card.title,
            "description": card.description,
            "assignee_id": str(card.assignee_id) if card.assignee_id else None,
            "version": card.version,
            "actor_user_id": str(current_user.id),
        },
    )

    return card


@router.delete(
    "/cards/{card_id}",
    response_model=MessageResponse,
    summary="Delete a card",
)
async def delete_card(
    card_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await check_card_access(card_id, current_user, db)
    board_id = card.board_id
    col_id = card.column_id
    card_id_str = str(card.id)

    await db.delete(card)
    await db.commit()

    await manager.broadcast_event(
        board_id,
        "CARD_DELETED",
        {
            "card_id": card_id_str,
            "column_id": str(col_id),
            "board_id": str(board_id),
            "actor_user_id": str(current_user.id),
        },
    )

    return MessageResponse(message="Card deleted successfully")


@router.patch(
    "/cards/{card_id}/move",
    response_model=CardResponse,
    summary="Move card to new column/rank with O(1) Lexorank update and optimistic concurrency",
)
async def move_card(
    card_id: uuid.UUID,
    payload: CardMoveRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    card = await check_card_access(card_id, current_user, db)
    source_column_id = card.column_id
    target_column_id = payload.target_column_id or source_column_id

    # If moving to a different column, verify target column belongs to the same board
    if target_column_id != source_column_id:
        target_col = await check_column_access(target_column_id, current_user, db)
        if target_col.board_id != card.board_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target column does not belong to the same board",
            )

    # Optimistic Concurrency Control Check
    if payload.version is not None and card.version != payload.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Conflict: Card has been modified. Server version is {card.version}, payload was {payload.version}.",
        )

    # Compute new rank
    new_rank = payload.rank
    if not new_rank:
        if payload.prev_rank is not None or payload.next_rank is not None:
            new_rank = between(payload.prev_rank, payload.next_rank)
        else:
            # Place at tail of target column
            last_stmt = (
                select(Card.rank)
                .where(Card.column_id == target_column_id, Card.id != card.id)
                .order_by(Card.rank.desc())
                .limit(1)
            )
            last_res = await db.execute(last_stmt)
            last_rank = last_res.scalar_one_or_none()
            new_rank = between(last_rank, None)

    # O(1) Reorder: Update only this single card row
    card.column_id = target_column_id
    card.rank = new_rank
    card.version += 1

    await db.commit()
    await db.refresh(card)

    # Trigger background rebalance if string length exceeds threshold
    if needs_rebalance(card.rank):
        background_tasks.add_task(bg_rebalance, card.board_id, target_column_id)

    # Publish real-time move event to Redis
    await manager.broadcast_event(
        card.board_id,
        "CARD_MOVED",
        {
            "card_id": str(card.id),
            "source_column_id": str(source_column_id),
            "target_column_id": str(target_column_id),
            "new_rank": card.rank,
            "version": card.version,
            "actor_user_id": str(current_user.id),
        },
    )

    return card
