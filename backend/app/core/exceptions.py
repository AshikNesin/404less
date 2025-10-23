"""Custom exception classes for the application."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class APIError(Exception):
    """Base API exception class."""

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class NotFoundError(APIError):
    """Exception raised when a resource is not found."""

    def __init__(
        self,
        message: str = "Resource not found",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, status.HTTP_404_NOT_FOUND, details)


class ValidationError(APIError):
    """Exception raised when validation fails."""

    def __init__(
        self,
        message: str = "Validation failed",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY, details)


class DatabaseError(APIError):
    """Exception raised when database operations fail."""

    def __init__(
        self,
        message: str = "Database operation failed",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, status.HTTP_500_INTERNAL_SERVER_ERROR, details)


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    """Handler for custom API exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "message": exc.message,
                "type": exc.__class__.__name__,
                "details": exc.details,
            },
            "timestamp": request.state.timestamp if hasattr(request.state, "timestamp") else None,
            "path": str(request.url.path),
        },
    )


async def http_exception_handler(
    request: Request,
    exc: HTTPException | StarletteHTTPException,
) -> JSONResponse:
    """Handler for HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "message": exc.detail,
                "type": "HTTPException",
                "details": {},
            },
            "timestamp": request.state.timestamp if hasattr(request.state, "timestamp") else None,
            "path": str(request.url.path),
        },
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Handler for request validation exceptions."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "message": "Request validation failed",
                "type": "ValidationError",
                "details": {
                    "validation_errors": exc.errors(),
                },
            },
            "timestamp": request.state.timestamp if hasattr(request.state, "timestamp") else None,
            "path": str(request.url.path),
        },
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handler for unexpected exceptions."""
    # Don't expose internal error details in production
    from app.core.config import settings

    message = "Internal server error" if settings.is_production else str(exc)
    details = {} if settings.is_production else {"exception_type": exc.__class__.__name__}

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "message": message,
                "type": "InternalServerError",
                "details": details,
            },
            "timestamp": request.state.timestamp if hasattr(request.state, "timestamp") else None,
            "path": str(request.url.path),
        },
    )
