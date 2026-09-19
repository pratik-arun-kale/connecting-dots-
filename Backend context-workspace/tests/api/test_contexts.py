"""
tests/api/test_contexts.py
───────────────────────────
Integration tests for /api/v1/contexts endpoints.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

PROJECT_BASE = "/api/v1/projects"
SESSION_BASE = "/api/v1/sessions"
CONTEXT_BASE = "/api/v1/contexts"


# ── Setup helpers ─────────────────────────────────────────────────────────────

async def _bootstrap(client: AsyncClient) -> tuple[str, str]:
    """Create a project + session, return (project_id, session_id)."""
    p = await client.post(PROJECT_BASE, json={"name": "Context Host"})
    project_id = p.json()["id"]
    s = await client.post(
        SESSION_BASE,
        json={"project_id": project_id, "source_platform": "claude"},
    )
    return project_id, s.json()["id"]


async def _create_context(
    client: AsyncClient,
    session_id: str,
    raw_content: dict | None = None,
    **kwargs,
) -> dict:
    payload = {
        "session_id": session_id,
        "raw_content": raw_content or {"type": "text", "body": "Hello world"},
        **kwargs,
    }
    resp = await client.post(CONTEXT_BASE, json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Create ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_context_minimal(authenticated_client: AsyncClient) -> None:
    _, session_id = await _bootstrap(authenticated_client)
    response = await authenticated_client.post(
        CONTEXT_BASE,
        json={
            "session_id": session_id,
            "raw_content": {"type": "text", "body": "What is RAG?"},
        },
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_context_full_payload(authenticated_client: AsyncClient) -> None:
    _, session_id = await _bootstrap(authenticated_client)
    response = await authenticated_client.post(
        CONTEXT_BASE,
        json={
            "session_id": session_id,
            "raw_content": {
                "type": "conversation",
                "messages": [
                    {"role": "user", "content": "Explain transformers"},
                    {"role": "assistant", "content": "Transformers are…"},
                ],
                "url": "https://claude.ai/chat/abc123",
            },
            "structured_content": {
                "topic": "machine learning",
                "entities": ["transformer", "attention"],
            },
            "tags": ["ml", "nlp", "transformers"],
            "metadata": {"browser": "Chrome", "extension_version": "1.0.0"},
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["tags"] == ["ml", "nlp", "transformers"]
    assert data["structured_content"]["topic"] == "machine learning"


@pytest.mark.asyncio
async def test_create_context_requires_session_id(authenticated_client: AsyncClient) -> None:
    response = await authenticated_client.post(
        CONTEXT_BASE,
        json={"raw_content": {"type": "text", "body": "No session"}},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_context_requires_raw_content(authenticated_client: AsyncClient) -> None:
    _, session_id = await _bootstrap(authenticated_client)
    response = await authenticated_client.post(
        CONTEXT_BASE,
        json={"session_id": session_id},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_context_empty_raw_content_rejected(authenticated_client: AsyncClient) -> None:
    _, session_id = await _bootstrap(authenticated_client)
    response = await authenticated_client.post(
        CONTEXT_BASE,
        json={"session_id": session_id, "raw_content": {}},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_context_invalid_session(authenticated_client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await authenticated_client.post(
        CONTEXT_BASE,
        json={
            "session_id": fake_id,
            "raw_content": {"type": "text", "body": "orphan"},
        },
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_context_under_another_users_session_returns_404(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    """IDOR: User B must not be able to write a context into User A's session."""
    _, session_id = await _bootstrap(authenticated_client)

    response = await second_authenticated_client.post(
        CONTEXT_BASE,
        json={"session_id": session_id, "raw_content": {"type": "text", "body": "injected"}},
    )
    assert response.status_code == 404


# ── List ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_contexts_for_session(authenticated_client: AsyncClient) -> None:
    _, session_id = await _bootstrap(authenticated_client)
    await _create_context(authenticated_client, session_id, raw_content={"type": "text", "body": "C1"})
    await _create_context(authenticated_client, session_id, raw_content={"type": "text", "body": "C2"})
    await _create_context(authenticated_client, session_id, raw_content={"type": "text", "body": "C3"})

    response = await authenticated_client.get(f"{CONTEXT_BASE}/{session_id}")
    data = response.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3


@pytest.mark.asyncio
async def test_list_contexts_empty_session(authenticated_client: AsyncClient) -> None:
    _, session_id = await _bootstrap(authenticated_client)
    response = await authenticated_client.get(f"{CONTEXT_BASE}/{session_id}")
    assert response.status_code == 200
    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_list_contexts_invalid_session(authenticated_client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await authenticated_client.get(f"{CONTEXT_BASE}/{fake_id}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_contexts_are_isolated_per_session(authenticated_client: AsyncClient) -> None:
    """Contexts from session A must not appear in session B's list."""
    project_id, session_a = await _bootstrap(authenticated_client)
    s_b_resp = await authenticated_client.post(
        SESSION_BASE,
        json={"project_id": project_id, "source_platform": "chatgpt"},
    )
    session_b = s_b_resp.json()["id"]

    await _create_context(authenticated_client, session_a)
    await _create_context(authenticated_client, session_a)

    response = await authenticated_client.get(f"{CONTEXT_BASE}/{session_b}")
    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_list_contexts_for_another_users_session_returns_404(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    """IDOR: User B must not be able to list User A's captured content."""
    _, session_id = await _bootstrap(authenticated_client)
    await _create_context(authenticated_client, session_id)

    response = await second_authenticated_client.get(f"{CONTEXT_BASE}/{session_id}")
    assert response.status_code == 404


# ── Get by ID ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_context_by_id(authenticated_client: AsyncClient) -> None:
    _, session_id = await _bootstrap(authenticated_client)
    created = await _create_context(authenticated_client, session_id)

    response = await authenticated_client.get(f"{CONTEXT_BASE}/detail/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


@pytest.mark.asyncio
async def test_get_context_not_found(authenticated_client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await authenticated_client.get(f"{CONTEXT_BASE}/detail/{fake_id}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_another_users_context_returns_404(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    """IDOR: User B must not be able to read User A's captured conversation
    content by context id, even via the two-hop Context->Session->Project
    ownership chain (no user_id column on Context itself)."""
    _, session_id = await _bootstrap(authenticated_client)
    created = await _create_context(authenticated_client, session_id)

    response = await second_authenticated_client.get(f"{CONTEXT_BASE}/detail/{created['id']}")
    assert response.status_code == 404
