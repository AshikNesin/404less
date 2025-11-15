from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_create_and_list_todos(client) -> None:
    create_resp = await client.post("/v1/todos", json={"title": "Test todo"})
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["title"] == "Test todo"
    assert created["completed"] is False

    list_resp = await client.get("/v1/todos")
    todos = list_resp.json()
    assert list_resp.status_code == 200
    assert len(todos) == 1
    assert todos[0]["id"] == created["id"]


@pytest.mark.asyncio
async def test_update_todo(client) -> None:
    create_resp = await client.post("/v1/todos", json={"title": "Initial"})
    todo_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"/v1/todos/{todo_id}",
        json={"title": "Updated", "completed": True},
    )
    assert patch_resp.status_code == 200
    payload = patch_resp.json()
    assert payload["title"] == "Updated"
    assert payload["completed"] is True


@pytest.mark.asyncio
async def test_delete_todo(client) -> None:
    create_resp = await client.post("/v1/todos", json={"title": "Disposable"})
    todo_id = create_resp.json()["id"]

    delete_resp = await client.delete(f"/v1/todos/{todo_id}")
    assert delete_resp.status_code == 204

    list_resp = await client.get("/v1/todos")
    assert list_resp.status_code == 200
    assert list_resp.json() == []
