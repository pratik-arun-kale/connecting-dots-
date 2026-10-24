"""
tests/api/test_isolation.py
────────────────────────────
Tenant isolation across the whole API: user B gets nothing of user A's.

Every route that takes a project, session or note id is called by B with
A's ids and must answer 404 — the same as for an id that doesn't exist, so
B can't even learn A's ids are real. Each request is then repeated as A and
must NOT be a 404 or a 422, which proves the request itself was valid and
B's 404 really came from the ownership check. List routes must not include
A's rows.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

from app.services.rag_service import RagService

API = "/api/v1"


@dataclass
class OwnedByA:
    project_id: str
    session_id: str
    context_id: str


@pytest.fixture(autouse=True)
def _no_rag_work(monkeypatch):
    """Capture indexes in the background and query/search run the RAG
    pipeline; none of that is under test here, and none of it should load a
    model. If an ownership check were missing, B's request would reach these
    stubs and come back 200 instead of 404 — still a failure."""

    async def _nothing(self, *args, **kwargs):
        return None

    monkeypatch.setattr(RagService, "index_context", _nothing)


@pytest.fixture
async def owned_by_a(authenticated_client: AsyncClient) -> OwnedByA:
    project = await authenticated_client.post(f"{API}/projects", json={"name": "A's private project"})
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    session = await authenticated_client.post(
        f"{API}/sessions", json={"project_id": project_id, "source_platform": "claude"}
    )
    assert session.status_code == 201, session.text
    session_id = session.json()["id"]

    context = await authenticated_client.post(
        f"{API}/contexts",
        json={"session_id": session_id, "raw_content": {"type": "text", "body": "A's secret note"}},
    )
    assert context.status_code == 201, context.text
    return OwnedByA(project_id, session_id, context.json()["id"])


def _capture_body() -> dict:
    return {
        "idempotency_key": uuid.uuid4().hex,
        "platform": "note",
        "chat_url": "",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "title": "B's attempt",
        "messages": [{"role": "user", "content": "written by B", "timestamp": None, "index": 0}],
    }


# (method, path template, body factory, repeat as owner?)
# The owner repeat is skipped where a valid owner call would run the RAG
# pipeline (query/search) — the 404 for B is what matters there.
ROUTES = [
    ("GET", "/projects/{project_id}", None, True),
    ("PATCH", "/projects/{project_id}", lambda: {"name": "renamed by B"}, True),
    ("GET", "/projects/{project_id}/contexts", None, True),
    ("POST", "/projects/{project_id}/capture", _capture_body, True),
    ("POST", "/projects/{project_id}/query", lambda: {"question": "what did A write?"}, False),
    ("POST", "/search/conversations", lambda: {"project_id": "{project_id}", "query": "secret"}, False),
    ("GET", "/contexts?project_id={project_id}", None, True),
    ("POST", "/sessions", lambda: {"project_id": "{project_id}", "source_platform": "gemini"}, True),
    ("GET", "/sessions/{project_id}", None, True),
    ("GET", "/sessions/detail/{session_id}", None, True),
    ("PATCH", "/sessions/{session_id}/state", lambda: {"state": "creating_tab"}, True),
    ("PATCH", "/sessions/{session_id}/link", lambda: {"url": "https://claude.ai/chat/abc"}, True),
    ("PATCH", "/sessions/{session_id}/fail", lambda: {"reason": "ui_timeout"}, True),
    ("POST", "/contexts", lambda: {"session_id": "{session_id}", "raw_content": {"body": "B"}}, True),
    ("GET", "/contexts/{session_id}", None, True),
    ("GET", "/contexts/detail/{context_id}", None, True),
    ("PATCH", "/contexts/detail/{context_id}", lambda: {"user_title": "renamed by B"}, True),
    # Destructive ones last in the list; each test gets fresh data anyway.
    ("DELETE", "/contexts/detail/{context_id}", None, True),
    ("DELETE", "/projects/{project_id}", None, True),
]


def _fill(value, ids: OwnedByA):
    if isinstance(value, str):
        return value.format(project_id=ids.project_id, session_id=ids.session_id, context_id=ids.context_id)
    if isinstance(value, dict):
        return {k: _fill(v, ids) for k, v in value.items()}
    return value


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,path,body,repeat_as_owner", ROUTES, ids=[f"{m} {p}" for m, p, _, _ in ROUTES]
)
async def test_other_users_ids_are_not_found(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
    owned_by_a: OwnedByA,
    monkeypatch,
    method: str,
    path: str,
    body,
    repeat_as_owner: bool,
) -> None:
    async def _must_not_run(self, *args, **kwargs):
        raise AssertionError("RAG ran for a project the caller doesn't own")

    monkeypatch.setattr(RagService, "query_project", _must_not_run)
    monkeypatch.setattr(RagService, "search_conversations", _must_not_run)

    url = API + _fill(path, owned_by_a)
    payload = _fill(body(), owned_by_a) if body else None

    as_b = await second_authenticated_client.request(method, url, json=payload)
    assert as_b.status_code == 404, f"{method} {path} as another user -> {as_b.status_code}: {as_b.text}"

    if repeat_as_owner:
        payload = _fill(body(), owned_by_a) if body else None  # fresh idempotency key
        as_a = await authenticated_client.request(method, url, json=payload)
        assert as_a.status_code not in (404, 422), (
            f"{method} {path} as the owner -> {as_a.status_code}: {as_a.text} "
            "(the request itself is invalid, so B's 404 proves nothing)"
        )


@pytest.mark.asyncio
async def test_lists_never_include_another_users_rows(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
    owned_by_a: OwnedByA,
) -> None:
    projects = await second_authenticated_client.get(f"{API}/projects")
    assert projects.status_code == 200
    assert owned_by_a.project_id not in {p["id"] for p in projects.json()["items"]}

    notes = await second_authenticated_client.get(f"{API}/contexts")
    assert notes.status_code == 200
    assert owned_by_a.context_id not in {n["id"] for n in notes.json()["items"]}


@pytest.mark.asyncio
async def test_another_users_ids_look_exactly_like_missing_ones(
    second_authenticated_client: AsyncClient, owned_by_a: OwnedByA
) -> None:
    real = await second_authenticated_client.get(f"{API}/projects/{owned_by_a.project_id}")
    missing = await second_authenticated_client.get(f"{API}/projects/{uuid.uuid4()}")
    assert real.status_code == missing.status_code == 404
    assert real.json().keys() == missing.json().keys()
