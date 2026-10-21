"""
tests/api/test_projects.py
───────────────────────────
Integration tests for /api/v1/projects endpoints.
Each test runs inside a rolled-back transaction (see conftest.py).

All requests are authenticated (authenticated_client) — every project
endpoint requires it. Cross-user IDOR tests use second_authenticated_client.
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


# ── Auth is required at all ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_request_is_rejected(client: AsyncClient) -> None:
    response = await client.get(BASE)
    assert response.status_code == 401


# ── Create ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_project_returns_201(authenticated_client: AsyncClient) -> None:
    response = await authenticated_client.post(
        BASE, json={"name": "Alpha", "description": "Alpha project"}
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_project_response_shape(authenticated_client: AsyncClient) -> None:
    data = await _create_project(authenticated_client, "Shape Test")
    assert "id" in data
    assert data["name"] == "Shape Test"
    assert "created_at" in data
    assert "updated_at" in data
    # Ownership is server-assigned — never exposed in the response for the
    # client to see/manipulate.
    assert "user_id" not in data


@pytest.mark.asyncio
async def test_create_project_requires_name(authenticated_client: AsyncClient) -> None:
    response = await authenticated_client.post(BASE, json={"description": "No name"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_project_name_cannot_be_empty(authenticated_client: AsyncClient) -> None:
    response = await authenticated_client.post(BASE, json={"name": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_project_strips_whitespace(authenticated_client: AsyncClient) -> None:
    response = await authenticated_client.post(BASE, json={"name": "  Trimmed  "})
    assert response.status_code == 201
    assert response.json()["name"] == "Trimmed"


# ── List ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_projects_empty(authenticated_client: AsyncClient) -> None:
    response = await authenticated_client.get(BASE)
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_projects_returns_created(authenticated_client: AsyncClient) -> None:
    await _create_project(authenticated_client, "Project A")
    await _create_project(authenticated_client, "Project B")

    response = await authenticated_client.get(BASE)
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_list_projects_pagination(authenticated_client: AsyncClient) -> None:
    for i in range(5):
        await _create_project(authenticated_client, f"Project {i}")

    page1 = await authenticated_client.get(BASE, params={"offset": 0, "limit": 3})
    assert len(page1.json()["items"]) == 3

    page2 = await authenticated_client.get(BASE, params={"offset": 3, "limit": 3})
    assert len(page2.json()["items"]) == 2


@pytest.mark.asyncio
async def test_list_projects_only_shows_the_caller_own_projects(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    await _create_project(authenticated_client, "Mine")
    await _create_project(second_authenticated_client, "Not mine")
    await _create_project(second_authenticated_client, "Also not mine")

    response = await authenticated_client.get(BASE)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "Mine"


# ── Get by ID ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_project_by_id(authenticated_client: AsyncClient) -> None:
    created = await _create_project(authenticated_client, "Findable")
    response = await authenticated_client.get(f"{BASE}/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


@pytest.mark.asyncio
async def test_get_project_not_found(authenticated_client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await authenticated_client.get(f"{BASE}/{fake_id}")
    assert response.status_code == 404
    assert "error" in response.json()


@pytest.mark.asyncio
async def test_get_another_users_project_returns_404_not_403(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    """IDOR: User B must not be able to fetch User A's project by guessing/
    knowing its id — and the response must be indistinguishable from a
    nonexistent id (404, never a 403 that would confirm it exists)."""
    created = await _create_project(authenticated_client, "User A's private project")

    response = await second_authenticated_client.get(f"{BASE}/{created['id']}")
    assert response.status_code == 404


# ── Update ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_project_name(authenticated_client: AsyncClient) -> None:
    created = await _create_project(authenticated_client, "Original Name")
    response = await authenticated_client.patch(
        f"{BASE}/{created['id']}", json={"name": "Updated Name"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_update_project_partial(authenticated_client: AsyncClient) -> None:
    """PATCH must not overwrite fields not included in the payload."""
    created = await _create_project(authenticated_client, "Partial", "Keep this description")
    response = await authenticated_client.patch(
        f"{BASE}/{created['id']}", json={"name": "Patched"}
    )
    data = response.json()
    assert data["name"] == "Patched"
    assert data["description"] == "Keep this description"


@pytest.mark.asyncio
async def test_update_another_users_project_returns_404(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    """IDOR: User B must not be able to rename User A's project."""
    created = await _create_project(authenticated_client, "User A's project")

    response = await second_authenticated_client.patch(
        f"{BASE}/{created['id']}", json={"name": "Hijacked by User B"}
    )
    assert response.status_code == 404

    # Confirm it was NOT actually renamed.
    check = await authenticated_client.get(f"{BASE}/{created['id']}")
    assert check.json()["name"] == "User A's project"


# ── Delete ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_project(authenticated_client: AsyncClient) -> None:
    created = await _create_project(authenticated_client, "To Delete")
    delete_resp = await authenticated_client.delete(f"{BASE}/{created['id']}")
    assert delete_resp.status_code == 204

    get_resp = await authenticated_client.get(f"{BASE}/{created['id']}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_another_users_project_returns_404(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    """IDOR: User B must not be able to delete User A's project."""
    created = await _create_project(authenticated_client, "User A's project")

    response = await second_authenticated_client.delete(f"{BASE}/{created['id']}")
    assert response.status_code == 404

    # Confirm it still exists for the real owner.
    check = await authenticated_client.get(f"{BASE}/{created['id']}")
    assert check.status_code == 200
