import asyncio
import json
import time
import uuid
from typing import Optional, Tuple
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy import select

import app.core.database as db_core
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
) -> Optional[Tuple[uuid.UUID, uuid.UUID, int]]:
    """
    Authenticate WebSocket connection via token query param/header
    and enforce multi-tenant workspace membership for board_id.
    Uses a short-lived AsyncSession to avoid connection pool exhaustion.
    Returns (user_id, workspace_id, token_exp) or None.
    """
    if not token:
        # Fallback to Authorization header
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
        token_exp = int(payload.get("exp", 0))
    except Exception:
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Invalid or expired authentication token",
        )
        return None

    # Check board existence and workspace tenancy in a short-lived DB session
    async with db_core.get_db_context() as db:
        board_stmt = select(Board.workspace_id).where(Board.id == board_id)
        board_res = await db.execute(board_stmt)
        workspace_id = board_res.scalar_one_or_none()

        if not workspace_id:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Board not found",
            )
            return None

        member_stmt = select(WorkspaceMember.role).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
        member_res = await db.execute(member_stmt)
        member_role = member_res.scalar_one_or_none()

        if not member_role:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Access denied: You are not a member of this workspace",
            )
            return None

    return user_id, workspace_id, token_exp


async def handle_websocket_connection(
    websocket: WebSocket,
    board_id: uuid.UUID,
    token: Optional[str],
):
    auth_info = await authenticate_and_verify_tenancy(websocket, board_id, token)
    if not auth_info:
        return

    user_id, workspace_id, token_exp = auth_info
    await manager.connect(websocket, board_id)
    last_tenancy_check = time.monotonic()

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
            try:
                # Wait for message with timeout to allow periodic expiration and tenancy verification
                data = await asyncio.wait_for(websocket.receive_text(), timeout=25.0)
            except asyncio.TimeoutError:
                data = None

            now_epoch = time.time()
            if token_exp > 0 and now_epoch >= token_exp:
                await websocket.close(
                    code=status.WS_1008_POLICY_VIOLATION,
                    reason="Session token has expired",
                )
                break

            now_mono = time.monotonic()
            if now_mono - last_tenancy_check >= 45.0:
                last_tenancy_check = now_mono
                async with db_core.get_db_context() as db:
                    check_stmt = select(WorkspaceMember.role).where(
                        WorkspaceMember.workspace_id == workspace_id,
                        WorkspaceMember.user_id == user_id,
                    )
                    res = await db.execute(check_stmt)
                    if res.scalar_one_or_none() is None:
                        await websocket.close(
                            code=status.WS_1008_POLICY_VIOLATION,
                            reason="Workspace membership revoked",
                        )
                        break

            if data is not None:
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
):
    """
    Real-time collaborative channel for boards.
    URL: /ws/boards/{board_id}?token={jwt}
    """
    await handle_websocket_connection(websocket, board_id, token)

