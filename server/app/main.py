from __future__ import annotations

import asyncio
import signal
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
import httpx
from pathlib import Path

from app.api.v1.auth import router as auth_router
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

    # Include API routers (all under /api prefix)
    app.include_router(health_router, prefix="/api")
    app.include_router(auth_router, prefix="/api/v1/auth")
    app.include_router(todos_router, prefix="/api/v1")

    @app.get("/api/sentry-debug")
    async def trigger_error():
        division_by_zero = 1 / 0

    # Frontend serving (production: static files, development: proxy to Vite)
    if settings.is_production:
        # Production: serve static files
        static_dir = Path(__file__).parent.parent / settings.frontend_build_dir
        if static_dir.exists():
            app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

            @app.get("/{full_path:path}")
            async def serve_spa(full_path: str):
                # Serve index.html for SPA routing (all non-API routes)
                if not full_path.startswith("api/"):
                    index_file = static_dir / "index.html"
                    if index_file.exists():
                        return FileResponse(index_file)
                raise HTTPException(status_code=404, detail="Not found")
        else:
            print(f"⚠️  Static directory not found: {static_dir}")
    else:
        # Development: proxy to Vite dev server
        @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
        async def proxy_to_vite(request: Request, full_path: str):
            # Don't proxy API routes
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="Not found")

            # Proxy everything else to Vite dev server
            async with httpx.AsyncClient() as client:
                url = f"{settings.vite_dev_server_url}/{full_path}"
                headers = dict(request.headers)
                headers.pop("host", None)

                try:
                    response = await client.request(
                        method=request.method,
                        url=url,
                        headers=headers,
                        content=await request.body(),
                        follow_redirects=True
                    )
                    return Response(
                        content=response.content,
                        status_code=response.status_code,
                        headers=dict(response.headers)
                    )
                except httpx.ConnectError:
                    return Response(
                        content=f"""
                        <html>
                            <body>
                                <h1>Vite Dev Server Not Running</h1>
                                <p>Please start the Vite dev server on {settings.vite_dev_server_url}</p>
                                <p>Run: <code>cd client && pnpm dev</code></p>
                            </body>
                        </html>
                        """,
                        status_code=503,
                        media_type="text/html"
                    )

    return app


app = create_app()
