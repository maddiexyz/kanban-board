import asyncio
import json
import uuid
from typing import Dict, Set, Optional
from fastapi import WebSocket
from app.core.redis import get_redis


class ConnectionManager:
    """
    Manages active WebSocket connections grouped by board_id.
    Subscribes dynamically to Redis Pub/Sub channels when clients connect,
    and unsubscribes when the last client for a board disconnects.
    """

    def __init__(self):
        # Maps board_id -> set of active WebSocket instances
        self.active_connections: Dict[uuid.UUID, Set[WebSocket]] = {}
        # Maps board_id -> background asyncio.Task listening to Redis Pub/Sub
        self.subscriber_tasks: Dict[uuid.UUID, asyncio.Task] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, board_id: uuid.UUID) -> None:
        """Register an accepted WebSocket and ensure Redis subscriber task is running."""
        await websocket.accept()
        async with self._lock:
            if board_id not in self.active_connections:
                self.active_connections[board_id] = set()

            self.active_connections[board_id].add(websocket)

            # Start Redis subscriber for this board if not already running
            if board_id not in self.subscriber_tasks or self.subscriber_tasks[board_id].done():
                self.subscriber_tasks[board_id] = asyncio.create_task(
                    self._redis_subscriber(board_id)
                )

    async def disconnect(self, websocket: WebSocket, board_id: uuid.UUID) -> None:
        """Unregister a WebSocket and teardown Redis subscriber if no clients remain."""
        async with self._lock:
            if board_id in self.active_connections:
                self.active_connections[board_id].discard(websocket)
                if not self.active_connections[board_id]:
                    del self.active_connections[board_id]
                    # Cancel Redis subscriber task to save resources
                    task = self.subscriber_tasks.pop(board_id, None)
                    if task and not task.done():
                        task.cancel()

    async def broadcast_to_board(
        self,
        board_id: uuid.UUID,
        message: str,
        exclude: Optional[WebSocket] = None,
    ) -> None:
        """Send message text to all connected WebSocket clients for a board."""
        connections = self.active_connections.get(board_id, set()).copy()
        dead_sockets = []

        for ws in connections:
            if ws is not exclude:
                try:
                    await ws.send_text(message)
                except Exception:
                    dead_sockets.append(ws)

        if dead_sockets:
            async with self._lock:
                for dead_ws in dead_sockets:
                    if board_id in self.active_connections:
                        self.active_connections[board_id].discard(dead_ws)

    async def _redis_subscriber(self, board_id: uuid.UUID) -> None:
        """Background worker that consumes Redis Pub/Sub events and broadcasts to WebSockets."""
        channel_name = f"board:{board_id}"
        pubsub = None
        try:
            redis = await get_redis()
            pubsub = redis.pubsub()
            await pubsub.subscribe(channel_name)

            async for msg in pubsub.listen():
                if msg and msg.get("type") == "message":
                    raw_data = msg.get("data")
                    if isinstance(raw_data, (bytes, bytearray)):
                        text_data = raw_data.decode("utf-8")
                    else:
                        text_data = str(raw_data)
                    await self.broadcast_to_board(board_id, text_data)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[Redis Subscriber Error for {channel_name}]: {e}")
        finally:
            if pubsub is not None:
                try:
                    await pubsub.unsubscribe(channel_name)
                    await pubsub.aclose()
                except Exception:
                    pass

    async def broadcast_event(
        self,
        board_id: uuid.UUID,
        event_type: str,
        payload: dict,
    ) -> None:
        """Publish a structured event to Redis channel board:{board_id}."""
        try:
            redis = await get_redis()
            message = json.dumps({"type": event_type, "payload": payload})
            await redis.publish(f"board:{board_id}", message)
        except Exception as e:
            print(f"[Redis Broadcast Error for board:{board_id}]: {e}")


manager = ConnectionManager()
