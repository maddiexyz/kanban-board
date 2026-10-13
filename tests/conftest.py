import asyncio
import sys
import pytest_asyncio
from typing import Dict
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession, AsyncEngine
from sqlalchemy.pool import NullPool
from app.core.config import settings
from app.core.database import get_db
from app.core.redis import close_redis
from main import app

# Ensure Windows selector event loop is used for asyncpg compatibility on Windows
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

_engines: Dict[asyncio.AbstractEventLoop, AsyncEngine] = {}


def get_loop_engine() -> AsyncEngine:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    if loop not in _engines:
        _engines[loop] = create_async_engine(
            settings.DATABASE_URL,
            poolclass=NullPool,
        )
    return _engines[loop]


async def override_get_db():
    eng = get_loop_engine()
    session_factory = async_sessionmaker(
        bind=eng,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
    async with session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(autouse=True)
async def cleanup_connections():
    yield
    await close_redis()


@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
