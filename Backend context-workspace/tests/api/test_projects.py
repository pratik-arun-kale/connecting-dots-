"""
tests/api/test_projects.py
───────────────────────────
Integration tests for /api/v1/projects endpoints.
Each test runs inside a rolled-back transaction (see conftest.py).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

BASE = "/api/v1/projects"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _create_project(
    client: AsyncClient,
    name: str = "Test Project",
    description: str | None = "A test project",
) -> dict:
    resp = await client.post(BASE, json={"name": name, "description": description})
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Create ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_project_returns_201(client: AsyncClient) -> None:
    response = await client.post(
        BASE, json={"name": "Alpha", "description": "Alpha project"}
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_project_response_shape(client: AsyncClient) -> None:
    data = await _create_project(client, "Shape Test")
    assert "id" in data
    assert data["name"] == "Shape Test"
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.asyncio
async def test_create_project_requires_name(client: AsyncClient) -> None:
    response = await client.post(BASE, json={"description": "No name"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_project_name_cannot_be_empty(client: AsyncClient) -> None:
    response = await client.post(BASE, json={"name": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_project_strips_whitespace(client: AsyncClient) -> None:
    response = await client.post(BASE, json={"name": "  Trimmed  "})
    assert response.status_code == 201
    assert response.json()["name"] == "Trimmed"


# ── List ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_projects_empty(client: AsyncClient) -> None:
    response = await client.get(BASE)
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_projects_returns_created(client: AsyncClient) -> None:
    await _create_project(client, "Project A")
    await _create_project(client, "Project B")

    response = await client.get(BASE)
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_list_projects_pagination(client: AsyncClient) -> None:
    for i in range(5):
        await _create_project(client, f"Project {i}")

    page1 = await client.get(BASE, params={"offset": 0, "limit": 3})
    assert len(page1.json()["items"]) == 3

    page2 = await client.get(BASE, params={"offset": 3, "limit": 3})
    assert len(page2.json()["items"]) == 2


# ── Get by ID ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_project_by_id(client: AsyncClient) -> None:
    created = await _create_project(client, "Findable")
    response = await client.get(f"{BASE}/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


@pytest.mark.asyncio
async def test_get_project_not_found(client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"{BASE}/{fake_id}")
    assert response.status_code == 404
    assert "error" in response.json()


# ── Update ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_project_name(client: AsyncClient) -> None:
    created = await _create_project(client, "Original Name")
    response = await client.patch(
        f"{BASE}/{created['id']}", json={"name": "Updated Name"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_update_project_partial(client: AsyncClient) -> None:
    """PATCH must not overwrite fields not included in the payload."""
    created = await _create_project(client, "Partial", "Keep this description")
    response = await client.patch(
        f"{BASE}/{created['id']}", json={"name": "Patched"}
    )
    data = response.json()
    assert data["name"] == "Patched"
    assert data["description"] == "Keep this description"


# ── Delete ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_project(client: AsyncClient) -> None:
    created = await _create_project(client, "To Delete")
    delete_resp = await client.delete(f"{BASE}/{created['id']}")
    assert delete_resp.status_code == 204

    get_resp = await client.get(f"{BASE}/{created['id']}")
    assert get_resp.status_code == 404
