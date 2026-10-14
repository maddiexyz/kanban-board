import asyncio
from typing import Optional
import redis.asyncio as aioredis
from app.core.config import settings

redis_client: Optional[aioredis.Redis] = None
_redis_loop: Optional[asyncio.AbstractEventLoop] = None


async def get_redis() -> aioredis.Redis:
    global redis_client, _redis_loop
    current_loop = asyncio.get_running_loop()
    if redis_client is not None:
        if _redis_loop is None or _redis_loop.is_closed() or _redis_loop is not current_loop:
            redis_client = None

    if redis_client is None:
        _redis_loop = current_loop
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


from fastapi import HTTPException, status


async def block_token(jti: str, expires_in_seconds: int) -> None:
    """Store revoked token identifier in Redis blocklist."""
    client = await get_redis()
    ttl = max(1, int(expires_in_seconds))
    await client.set(f"token_blocklist:{jti}", "revoked", ex=ttl)


async def consume_token(jti: str, expires_in_seconds: int) -> bool:
    """
    Atomically mark a token as consumed/revoked using SET NX.
    Returns True if successfully consumed (was not already revoked), False if already consumed.
    """
    try:
        client = await get_redis()
        ttl = max(1, int(expires_in_seconds))
        res = await client.set(f"token_blocklist:{jti}", "revoked", ex=ttl, nx=True)
        return bool(res)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable",
        ) from e


async def is_token_blocked(jti: str) -> bool:
    """Check if token identifier is in Redis blocklist. Fails closed on connection error."""
    try:
        client = await get_redis()
        return bool(await client.exists(f"token_blocklist:{jti}"))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable",
        ) from e
