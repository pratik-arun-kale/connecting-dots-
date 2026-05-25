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
async def test_create_session_returns_201(client: AsyncClient) -> None:
    project = await _create_project(client)
    response = await client.post(
        SESSION_BASE,
        json={"project_id": project["id"], "source_platform": "chatgpt"},
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_session_response_shape(client: AsyncClient) -> None:
    project = await _create_project(client)
    data = await _create_session(client, project["id"])
    assert "id" in data
    assert data["project_id"] == project["id"]
    assert data["source_platform"] == "claude"
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_session_invalid_project(client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.post(
        SESSION_BASE,
        json={"project_id": fake_id, "source_platform": "claude"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_session_invalid_platform(client: AsyncClient) -> None:
    project = await _create_project(client)
    response = await client.post(
        SESSION_BASE,
        json={"project_id": project["id"], "source_platform": "invalid_platform"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("platform", ["chatgpt", "claude", "gemini", "docs", "unknown"])
async def test_create_session_all_valid_platforms(
    client: AsyncClient, platform: str
) -> None:
    project = await _create_project(client, f"Project for {platform}")
    response = await client.post(
        SESSION_BASE,
        json={"project_id": project["id"], "source_platform": platform},
    )
    assert response.status_code == 201
    assert response.json()["source_platform"] == platform


# ── List ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_sessions_for_project(client: AsyncClient) -> None:
    project = await _create_project(client)
    await _create_session(client, project["id"], title="S1")
    await _create_session(client, project["id"], title="S2")

    response = await client.get(f"{SESSION_BASE}/{project['id']}")
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


@pytest.mark.asyncio
async def test_list_sessions_empty_project(client: AsyncClient) -> None:
    project = await _create_project(client)
    response = await client.get(f"{SESSION_BASE}/{project['id']}")
    assert response.status_code == 200
    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_list_sessions_invalid_project(client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"{SESSION_BASE}/{fake_id}")
    assert response.status_code == 404


# ── Get by ID ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_session_by_id(client: AsyncClient) -> None:
    project = await _create_project(client)
    created = await _create_session(client, project["id"])

    response = await client.get(f"{SESSION_BASE}/detail/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


@pytest.mark.asyncio
async def test_get_session_not_found(client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"{SESSION_BASE}/detail/{fake_id}")
    assert response.status_code == 404
