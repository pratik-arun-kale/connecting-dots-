"""
tests/api/test_rate_limits.py
──────────────────────────────
Per-user rate limits on the signed-in routes that cost the most (see
app.dependencies.user_rate_limit). Ask AI is the example: 20 questions a
minute per user. The RAG pipeline is stubbed — only the limiter is under
test. Buckets are cleared between tests by conftest's autouse fixture.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.services.rag_service import RagService

API = "/api/v1"
ASK_AI_LIMIT = 20


@pytest.fixture(autouse=True)
def _stub_rag(monkeypatch):
    async def _answer(self, project_id, question):
        return {
            "answer": "stub",
            "confidence": "LOW",
            "citations": [],
            "query_used": question,
            "corrective_triggered": False,
        }

    monkeypatch.setattr(RagService, "query_project", _answer)


async def _project(client: AsyncClient) -> str:
    resp = await client.post(f"{API}/projects", json={"name": "Rate limited"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _ask(client: AsyncClient, project_id: str) -> int:
    resp = await client.post(f"{API}/projects/{project_id}/query", json={"question": "what is RRF?"})
    return resp.status_code


@pytest.mark.asyncio
async def test_ask_ai_allows_the_limit_then_answers_429(authenticated_client: AsyncClient) -> None:
    project_id = await _project(authenticated_client)

    statuses = [await _ask(authenticated_client, project_id) for _ in range(ASK_AI_LIMIT)]
    assert statuses == [200] * ASK_AI_LIMIT

    assert await _ask(authenticated_client, project_id) == 429


@pytest.mark.asyncio
async def test_one_users_limit_does_not_affect_another(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    a_project = await _project(authenticated_client)
    b_project = await _project(second_authenticated_client)

    for _ in range(ASK_AI_LIMIT):
        await _ask(authenticated_client, a_project)
    assert await _ask(authenticated_client, a_project) == 429

    # Both clients share one test IP — a per-IP limit would block B here.
    assert await _ask(second_authenticated_client, b_project) == 200
