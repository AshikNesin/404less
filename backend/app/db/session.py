from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import settings


def create_db_engine():
    """Create database engine with appropriate configuration."""
    engine_kwargs = {
        "pool_pre_ping": True,
        "echo": settings.is_development,  # Log SQL in development
    }
    
    # Use connection pooling in production
    if settings.is_production:
        engine_kwargs.update({
            "pool_size": settings.db_pool_size,
            "max_overflow": settings.db_max_overflow,
            "pool_timeout": settings.db_pool_timeout,
            "pool_recycle": settings.db_pool_recycle,
        })
    else:
        # In development, use NullPool to avoid connection issues
        engine_kwargs["poolclass"] = NullPool
    
    return create_async_engine(settings.database_url, **engine_kwargs)


engine = create_db_engine()
SessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    class_=AsyncSession,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get database session with proper error handling."""
    try:
        async with SessionLocal() as session:
            yield session
    except Exception as e:
        # Log database connection errors
        if settings.is_development:
            print(f"Database session error: {e}")
        raise


async def check_db_health() -> bool:
    """Check if database connection is healthy."""
    try:
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        if settings.is_development:
            print(f"Database health check failed: {e}")
        return False
