from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_healthz(client) -> None:
    response = await client.get("/api/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_version(client) -> None:
    response = await client.get("/api/version")
    payload = response.json()
    assert response.status_code == 200
    assert "version" in payload
    assert "commit" in payload
