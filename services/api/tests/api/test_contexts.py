"""
tests/api/test_contexts.py
───────────────────────────
Integration tests for /api/v1/contexts endpoints.
"""

from __future__ import annotations

import uuid

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


# ── List across projects (GET /contexts) ───────────────────────────────────────

@pytest.mark.asyncio
async def test_list_notes_across_projects(authenticated_client: AsyncClient) -> None:
    project_a, session_a = await _bootstrap(authenticated_client)
    project_b, session_b = await _bootstrap(authenticated_client)
    c1 = await _create_context(authenticated_client, session_a)
    c2 = await _create_context(authenticated_client, session_b)

    response = await authenticated_client.get(CONTEXT_BASE)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    by_id = {item["id"]: item for item in data["items"]}
    assert by_id[c1["id"]]["project_id"] == project_a
    assert by_id[c2["id"]]["project_id"] == project_b


@pytest.mark.asyncio
async def test_list_notes_filtered_by_project(authenticated_client: AsyncClient) -> None:
    project_a, session_a = await _bootstrap(authenticated_client)
    _, session_b = await _bootstrap(authenticated_client)
    only = await _create_context(authenticated_client, session_a)
    await _create_context(authenticated_client, session_b)

    response = await authenticated_client.get(CONTEXT_BASE, params={"project_id": project_a})
    data = response.json()
    assert data["total"] == 1
    assert [item["id"] for item in data["items"]] == [only["id"]]


@pytest.mark.asyncio
async def test_list_notes_never_includes_another_users_notes(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    _, session_id = await _bootstrap(authenticated_client)
    await _create_context(authenticated_client, session_id)

    response = await second_authenticated_client.get(CONTEXT_BASE)
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}


@pytest.mark.asyncio
async def test_list_notes_for_another_users_project_returns_404(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    project_id, session_id = await _bootstrap(authenticated_client)
    await _create_context(authenticated_client, session_id)

    response = await second_authenticated_client.get(CONTEXT_BASE, params={"project_id": project_id})
    assert response.status_code == 404


# ── User title (PATCH user_title) ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_set_and_clear_user_title(authenticated_client: AsyncClient) -> None:
    _, session_id = await _bootstrap(authenticated_client)
    created = await _create_context(authenticated_client, session_id)
    url = f"{CONTEXT_BASE}/detail/{created['id']}"

    set_resp = await authenticated_client.patch(url, json={"user_title": "  Interview prep  "})
    assert set_resp.status_code == 200
    assert set_resp.json()["user_title"] == "Interview prep"
    assert set_resp.json()["title"] == created["title"]  # automatic title untouched

    clear_resp = await authenticated_client.patch(url, json={"user_title": "   "})
    assert clear_resp.status_code == 200
    assert clear_resp.json()["user_title"] is None


# ── Re-index on edit ───────────────────────────────────────────────────────────
# An edit only bumps the note's version; the next search or Ask AI question on
# the project re-indexes it, once, with its latest text (Context.indexed_version).

@pytest.fixture
def _stub_answer(monkeypatch):
    """Ask AI's retrieval and answer, stubbed: these tests are about what gets
    re-indexed before it runs."""
    from app.services.rag_service import RagService

    async def _answer(self, project_id, question):
        return {"answer": "stub", "confidence": "LOW", "citations": [], "query_used": question,
                "corrective_triggered": False}

    monkeypatch.setattr(RagService, "query_project", _answer)


async def _ask(client: AsyncClient, project_id: str) -> None:
    resp = await client.post(f"{PROJECT_BASE}/{project_id}/query", json={"question": "anything new?"})
    assert resp.status_code == 200, resp.text


async def _written_note(client: AsyncClient, project_id: str, monkeypatch) -> tuple[dict, str]:
    """A dashboard-style note (platform "note"), created through capture,
    which indexes it in the same request. Indexing is stubbed here.
    Returns (note, session_id)."""
    from app.services.rag_service import RagService

    async def _indexed(self, *args):
        return None

    monkeypatch.setattr(RagService, "index_context", _indexed)
    resp = await client.post(
        f"{PROJECT_BASE}/{project_id}/capture",
        json={
            "idempotency_key": f"note-{uuid.uuid4().hex}",
            "platform": "note",
            "chat_url": "",
            "captured_at": "2026-11-24T00:00:00Z",
            "title": "[Note] first words",
            "messages": [{"role": "user", "content": "first words", "index": 0}],
        },
    )
    assert resp.status_code == 200, resp.text
    note = (await client.get(f"{CONTEXT_BASE}/detail/{resp.json()['context_id']}")).json()
    return note, resp.json()["session_id"]


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["content_md", "user_title"])
async def test_editing_body_or_title_reindexes_once_before_the_next_question(
    authenticated_client: AsyncClient, reindex_calls: list, _stub_answer, monkeypatch, field: str
) -> None:
    project_id, _ = await _bootstrap(authenticated_client)
    created, session_id = await _written_note(authenticated_client, project_id, monkeypatch)
    await _ask(authenticated_client, project_id)
    assert reindex_calls == []  # indexed by its capture request: nothing stale

    url = f"{CONTEXT_BASE}/detail/{created['id']}"
    for text in ("draft", "draft two", "Edited text"):  # a burst of autosaves
        response = await authenticated_client.patch(url, json={field: text})
        assert response.status_code == 200
    assert reindex_calls == []  # the edits themselves index nothing

    await _ask(authenticated_client, project_id)
    assert len(reindex_calls) == 1
    context_id, called_session_id, called_project_id, raw = reindex_calls[0]
    assert (str(context_id), str(called_session_id), str(called_project_id)) == (
        created["id"],
        session_id,
        project_id,
    )
    indexed_text = raw["title"] if field == "user_title" else raw["messages"][0]["content"]
    assert indexed_text == "Edited text"  # the latest version, not an earlier autosave

    await _ask(authenticated_client, project_id)
    assert len(reindex_calls) == 1  # up to date now: nothing more to do


@pytest.mark.asyncio
async def test_editing_only_the_annotation_does_not_reindex(
    authenticated_client: AsyncClient, reindex_calls: list, _stub_answer
) -> None:
    project_id, session_id = await _bootstrap(authenticated_client)
    created = await _create_context(authenticated_client, session_id)
    await _ask(authenticated_client, project_id)
    reindex_calls.clear()

    response = await authenticated_client.patch(
        f"{CONTEXT_BASE}/detail/{created['id']}", json={"user_note": "my own aside"}
    )
    assert response.status_code == 200
    await _ask(authenticated_client, project_id)
    assert reindex_calls == []


@pytest.mark.asyncio
async def test_a_failed_reindex_is_retried_on_the_next_question(
    authenticated_client: AsyncClient, _stub_answer, monkeypatch
) -> None:
    from app.services.rag_service import RagService

    attempts: list = []

    async def _flaky(self, *args):
        attempts.append(args)
        if len(attempts) == 1:
            raise RuntimeError("embedding failed")

    monkeypatch.setattr(RagService, "reindex_context", _flaky)
    project_id, session_id = await _bootstrap(authenticated_client)
    await _create_context(authenticated_client, session_id)

    await _ask(authenticated_client, project_id)  # the question still works
    await _ask(authenticated_client, project_id)  # and the note is retried
    await _ask(authenticated_client, project_id)  # then left alone
    assert len(attempts) == 2


@pytest.mark.asyncio
async def test_indexing_keeps_the_notes_last_edited_order(
    authenticated_client: AsyncClient, reindex_calls: list, _stub_answer
) -> None:
    # The notes list is ordered by updated_at (the reader's last edit).
    # Marking a note indexed must not count as an edit.
    project_id, session_id = await _bootstrap(authenticated_client)
    first = await _create_context(authenticated_client, session_id, raw_content={"type": "text", "body": "one"})
    second = await _create_context(authenticated_client, session_id, raw_content={"type": "text", "body": "two"})
    before = {c["id"]: c["updated_at"] for c in (await authenticated_client.get(CONTEXT_BASE)).json()["items"]}

    await _ask(authenticated_client, project_id)
    assert len(reindex_calls) == 2  # both were indexed

    after = {c["id"]: c["updated_at"] for c in (await authenticated_client.get(CONTEXT_BASE)).json()["items"]}
    assert after == before
    assert set(after) == {first["id"], second["id"]}


@pytest.mark.asyncio
async def test_set_another_users_title_returns_404(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    _, session_id = await _bootstrap(authenticated_client)
    created = await _create_context(authenticated_client, session_id)

    response = await second_authenticated_client.patch(
        f"{CONTEXT_BASE}/detail/{created['id']}", json={"user_title": "hijacked"}
    )
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
