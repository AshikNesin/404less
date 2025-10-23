from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request

from app.core.config import settings
from app.db.session import check_db_health

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz(request: Request) -> dict[str, Any]:
    """
    Basic health check endpoint.
    
    Returns:
        dict: Health status information
    """
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "request_id": getattr(request.state, "request_id", None),
        "environment": settings.env,
    }


@router.get("/health")
async def health(request: Request) -> dict[str, Any]:
    """
    Detailed health check endpoint with database status.
    
    Returns:
        dict: Detailed health status including database connectivity
    """
    # Check database connection
    db_healthy = await check_db_health()
    
    # Overall health status
    overall_status = "ok" if db_healthy else "degraded"
    
    return {
        "status": overall_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "request_id": getattr(request.state, "request_id", None),
        "environment": settings.env,
        "checks": {
            "database": {
                "status": "ok" if db_healthy else "error",
                "message": "Connected" if db_healthy else "Connection failed",
            },
        },
    }


@router.get("/version")
async def version() -> dict[str, str]:
    """
    Get application version information.
    
    Returns:
        dict: Version and commit information
    """
    return {
        "version": settings.version,
        "commit": settings.commit,
        "environment": settings.env,
    }
