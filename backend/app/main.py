from __future__ import annotations

import asyncio
import signal
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.health import router as health_router
from app.api.v1.todos import router as todos_router
from app.core.config import settings
from app.core.exceptions import (
    APIError,
    api_error_handler,
    general_exception_handler,
    http_exception_handler,
    validation_exception_handler,
)
from app.core.logging import configure_logging
from app.db.session import engine
from app.middleware.logging import RequestLoggingMiddleware
from app.middleware.rate_limit import SimpleRateLimitMiddleware
import sentry_sdk

# Global shutdown event
shutdown_event = asyncio.Event()

sentry_sdk.init(
    dsn="https://19ce34c27d781e8038237dcf7181bece@o223853.ingest.us.sentry.io/4510243024076800",
    # Add data like request headers and IP for users,
    # see https://docs.sentry.io/platforms/python/data-management/data-collected/ for more info
    send_default_pii=True,
)

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Application lifespan manager with graceful shutdown."""
    # Startup
    configure_logging(settings.logging.level)

    if settings.is_development:
        print("🚀 Application starting up...")

    # Setup signal handlers for graceful shutdown
    def signal_handler(signum, frame):
        if settings.is_development:
            print(f"\n📡 Received signal {signum}, initiating graceful shutdown...")
        shutdown_event.set()

    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    try:
        yield
    finally:
        # Cleanup on shutdown
        if settings.is_development:
            print("🔄 Starting graceful shutdown...")

        # Dispose database connections
        await engine.dispose()

        if settings.is_development:
            print("✅ Graceful shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title="404less API",
        version=settings.version,
        lifespan=lifespan,
        description="A simple, production-ready API for indie developers",
    )

    # Add middleware (order matters - first added = outermost)
    if not settings.is_development:
        # Skip rate limiting in development for better DX
        app.add_middleware(SimpleRateLimitMiddleware, calls=100, period=60)

    app.add_middleware(RequestLoggingMiddleware)

    # CORS configuration - more restrictive in production
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],  # More specific methods
        allow_headers=[
            "Content-Type",
            "Authorization",
            "X-Request-ID",
        ],  # More specific headers
    )

    # Exception handlers
    app.add_exception_handler(APIError, api_error_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)

    # Include routers
    app.include_router(health_router)
    app.include_router(todos_router, prefix="/v1")

    @app.get("/sentry-debug")
    async def trigger_error():
        division_by_zero = 1 / 0

    return app


app = create_app()
