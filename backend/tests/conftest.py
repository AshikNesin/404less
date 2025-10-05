from __future__ import annotations

from collections.abc import AsyncGenerator, AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.deps import get_db_session
from app.db.models import Base
from app.main import create_app


@pytest_asyncio.fixture(scope="session")
async def app() -> AsyncIterator[FastAPI]:
    yield create_app()


SessionFactory = async_sessionmaker[AsyncSession]


@pytest_asyncio.fixture()
async def session_factory(
	tmp_path_factory: pytest.TempPathFactory,
) -> AsyncIterator[SessionFactory]:
    db_path: Path = tmp_path_factory.mktemp("db") / "test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", future=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory_local: SessionFactory = async_sessionmaker(engine, expire_on_commit=False)

    yield session_factory_local

    await engine.dispose()


@pytest_asyncio.fixture()
async def client(
    app: FastAPI,
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncClient]:
    async def _get_test_session() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = _get_test_session

    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client

    app.dependency_overrides.pop(get_db_session, None)
