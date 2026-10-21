"""
tests/api/test_sessions.py
───────────────────────────
Integration tests for /api/v1/sessions endpoints.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

PROJECT_BASE = "/api/v1/projects"
SESSION_BASE = "/api/v1/sessions"


# ── Fixtures ──────────────────────────────────────────────────────────────────

async def _create_project(client: AsyncClient, name: str = "Session Host") -> dict:
    resp = await client.post(PROJECT_BASE, json={"name": name})
    assert resp.status_code == 201
    return resp.json()


async def _create_session(
    client: AsyncClient,
    project_id: str,
    platform: str = "claude",
    title: str | None = "Test Session",
) -> dict:
    resp = await client.post(
        SESSION_BASE,
        json={
            "project_id": project_id,
            "source_platform": platform,
            "title": title,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Create ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_session_returns_201(authenticated_client: AsyncClient) -> None:
    project = await _create_project(authenticated_client)
    response = await authenticated_client.post(
        SESSION_BASE,
        json={"project_id": project["id"], "source_platform": "chatgpt"},
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_session_response_shape(authenticated_client: AsyncClient) -> None:
    project = await _create_project(authenticated_client)
    data = await _create_session(authenticated_client, project["id"])
    assert "id" in data
    assert data["project_id"] == project["id"]
    assert data["source_platform"] == "claude"
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_session_invalid_project(authenticated_client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await authenticated_client.post(
        SESSION_BASE,
        json={"project_id": fake_id, "source_platform": "claude"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_session_under_another_users_project_returns_404(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    """IDOR: a client-supplied project_id in the body must not let User B
    create a session under User A's project."""
    project = await _create_project(authenticated_client, "User A's project")

    response = await second_authenticated_client.post(
        SESSION_BASE,
        json={"project_id": project["id"], "source_platform": "claude"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_session_invalid_platform(authenticated_client: AsyncClient) -> None:
    project = await _create_project(authenticated_client)
    response = await authenticated_client.post(
        SESSION_BASE,
        json={"project_id": project["id"], "source_platform": "invalid_platform"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("platform", ["chatgpt", "claude", "gemini", "unknown"])
async def test_create_session_all_valid_platforms(
    authenticated_client: AsyncClient, platform: str
) -> None:
    project = await _create_project(authenticated_client, f"Project for {platform}")
    response = await authenticated_client.post(
        SESSION_BASE,
        json={"project_id": project["id"], "source_platform": platform},
    )
    assert response.status_code == 201
    assert response.json()["source_platform"] == platform


# ── List ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_sessions_for_project(authenticated_client: AsyncClient) -> None:
    project = await _create_project(authenticated_client)
    # Different platforms: create_or_get_session is intentionally idempotent
    # per (project, platform) — two calls with the SAME platform reuse one
    # session rather than creating two (a pre-existing bug in this test,
    # using "claude" for both, went uncaught until the test DB existed).
    await _create_session(authenticated_client, project["id"], platform="claude", title="S1")
    await _create_session(authenticated_client, project["id"], platform="chatgpt", title="S2")

    response = await authenticated_client.get(f"{SESSION_BASE}/{project['id']}")
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_list_sessions_empty_project(authenticated_client: AsyncClient) -> None:
    project = await _create_project(authenticated_client)
    response = await authenticated_client.get(f"{SESSION_BASE}/{project['id']}")
    assert response.status_code == 200
    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_list_sessions_invalid_project(authenticated_client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await authenticated_client.get(f"{SESSION_BASE}/{fake_id}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_sessions_for_another_users_project_returns_404(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    """IDOR: User B must not be able to list User A's sessions."""
    project = await _create_project(authenticated_client, "User A's project")
    await _create_session(authenticated_client, project["id"])

    response = await second_authenticated_client.get(f"{SESSION_BASE}/{project['id']}")
    assert response.status_code == 404


# ── Get by ID ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_session_by_id(authenticated_client: AsyncClient) -> None:
    project = await _create_project(authenticated_client)
    created = await _create_session(authenticated_client, project["id"])

    response = await authenticated_client.get(f"{SESSION_BASE}/detail/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


@pytest.mark.asyncio
async def test_get_session_not_found(authenticated_client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await authenticated_client.get(f"{SESSION_BASE}/detail/{fake_id}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_another_users_session_returns_404(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    """IDOR: User B must not be able to fetch User A's session by id, even
    though sessions don't carry their own user_id — ownership is checked via
    the JOIN through Session.project_id -> Project.user_id."""
    project = await _create_project(authenticated_client, "User A's project")
    created = await _create_session(authenticated_client, project["id"])

    response = await second_authenticated_client.get(f"{SESSION_BASE}/detail/{created['id']}")
    assert response.status_code == 404
