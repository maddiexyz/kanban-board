import asyncio
from typing import Optional
import redis.asyncio as aioredis
from app.core.config import settings

redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global redis_client
    current_loop = asyncio.get_running_loop()
    if redis_client is not None:
        client_loop = getattr(redis_client.connection_pool, "_loop", None)
        if client_loop is not None and (client_loop.is_closed() or client_loop is not current_loop):
            redis_client = None

    if redis_client is None:
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=5.0,
            socket_connect_timeout=5.0,
        )
    return redis_client


async def close_redis() -> None:
    global redis_client
    if redis_client is not None:
        try:
            await redis_client.aclose()
        except Exception:
            pass
        redis_client = None


async def block_token(jti: str, expires_in_seconds: int) -> None:
    """Store revoked token identifier in Redis blocklist."""
    client = await get_redis()
    await client.set(f"token_blocklist:{jti}", "revoked", ex=expires_in_seconds)


async def is_token_blocked(jti: str) -> bool:
    """Check if token identifier is in Redis blocklist."""
    try:
        client = await get_redis()
        return bool(await client.exists(f"token_blocklist:{jti}"))
    except Exception:
        return False
