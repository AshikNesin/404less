from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_healthz(client) -> None:
    response = await client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "timestamp" in data
    assert "environment" in data
    assert "request_id" in data


@pytest.mark.asyncio
async def test_version(client) -> None:
    response = await client.get("/version")
    payload = response.json()
    assert response.status_code == 200
    assert "version" in payload
    assert "commit" in payload
    assert "environment" in payload


@pytest.mark.asyncio
async def test_health_detailed(client) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["ok", "degraded"]
    assert "timestamp" in data
    assert "environment" in data
    assert "request_id" in data
    assert "checks" in data
    assert "database" in data["checks"]
