import json
import uuid
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.core.redis import is_token_blocked
from app.models.board import Board
from app.models.workspace import WorkspaceMember
from app.services.websocket_manager import manager

router = APIRouter(tags=["WebSockets"])


async def authenticate_and_verify_tenancy(
    websocket: WebSocket,
    board_id: uuid.UUID,
    token: Optional[str],
    db: AsyncSession,
) -> Optional[uuid.UUID]:
    """
    Authenticate WebSocket connection via token query param/header
    and enforce multi-tenant workspace membership for board_id.
    """
    if not token:
        # Fallback to Authorization header or query params
        auth_header = websocket.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]

    if not token:
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Authentication token required",
        )
        return None

    # Validate JWT
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Invalid token type: expected access token",
            )
            return None

        jti = payload.get("jti")
        if jti and await is_token_blocked(jti):
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Token has been revoked",
            )
            return None

        user_id_str = payload.get("sub")
        if not user_id_str:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Invalid token subject",
            )
            return None
        user_id = uuid.UUID(user_id_str)
    except Exception:
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Invalid or expired authentication token",
        )
        return None

    # Verify board existence and workspace tenancy
    board_stmt = select(Board).where(Board.id == board_id)
    board_res = await db.execute(board_stmt)
    board = board_res.scalar_one_or_none()

    if not board:
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Board not found",
        )
        return None

    member_stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == board.workspace_id,
        WorkspaceMember.user_id == user_id,
    )
    member_res = await db.execute(member_stmt)
    member = member_res.scalar_one_or_none()

    if not member:
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Access denied: You are not a member of this workspace",
        )
        return None

    return user_id


async def handle_websocket_connection(
    websocket: WebSocket,
    board_id: uuid.UUID,
    token: Optional[str],
    db: AsyncSession,
):
    user_id = await authenticate_and_verify_tenancy(websocket, board_id, token, db)
    if not user_id:
        return

    await manager.connect(websocket, board_id)
    try:
        # Acknowledge connection
        await websocket.send_text(
            json.dumps({
                "type": "CONNECTED",
                "payload": {
                    "board_id": str(board_id),
                    "user_id": str(user_id),
                },
            })
        )

        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                # Handle client ping heartbeat
                if msg.get("type") == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        await manager.disconnect(websocket, board_id)
    except Exception:
        await manager.disconnect(websocket, board_id)


@router.websocket("/ws/boards/{board_id}")
async def ws_board_endpoint(
    websocket: WebSocket,
    board_id: uuid.UUID,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Real-time collaborative channel for boards.
    URL: /ws/boards/{board_id}?token={jwt}
    """
    await handle_websocket_connection(websocket, board_id, token, db)
