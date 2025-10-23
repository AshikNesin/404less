"""Request logging middleware."""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to add request ID and log requests."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate unique request ID
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        request.state.timestamp = time.time()

        # Log request start
        if settings.is_development:
            print(
                f"[{request_id}] {request.method} {request.url.path} - "
                f"Client: {request.client.host if request.client else 'unknown'}"
            )

        # Process request
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time

        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id

        # Log request completion
        if settings.is_development:
            print(
                f"[{request_id}] {request.method} {request.url.path} - "
                f"Status: {response.status_code} - "
                f"Time: {process_time:.3f}s"
            )

        return response
