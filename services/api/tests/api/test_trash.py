"""
tests/api/test_trash.py
────────────────────────
Deleting moves notes and projects to the Trash: hidden everywhere else,
restorable, deletable for good, and purged after the retention period.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.core.settings import settings
from app.db.soft_delete import INCLUDE_DELETED
from app.models.context import Context
from app.models.project import Project
from app.services import context as context_module
from app.services import trash as trash_module
from app.services.rag_service import RagService
from app.services.trash import TrashService


@pytest.fixture
def vector_calls(monkeypatch) -> list[tuple]:
    """Vector-store and vocabulary cleanups, recorded instead of run."""
    calls: list[tuple] = []
    for module in (trash_module, context_module):
        monkeypatch.setattr(
            module.vector_store, "delete_context_chunks", lambda pid, cid: calls.append(("chunks", pid, cid))
        )
    monkeypatch.setattr(
        trash_module.vector_store, "delete_project_collection", lambda pid: calls.append(("collection", pid))
    )
    monkeypatch.setattr(trash_module.vocabulary, "delete_vocabulary", lambda pid: calls.append(("vocabulary", pid)))
    return calls


async def _project(client: AsyncClient, name: str = "Trash test") -> str:
    resp = await client.post("/api/v1/projects", json={"name": name})
    return resp.json()["id"]


async def _note(client: AsyncClient, pid: str, text: str, kind: str = "captured") -> str:
    resp = await client.post(
        f"/api/v1/projects/{pid}/capture",
        json={
            "idempotency_key": f"trash-{uuid.uuid4().hex}",
            "platform": "note",
            "chat_url": "https://claude.ai/chat/trash",
            "captured_at": "2026-11-17T00:00:00Z",
            "title": text[:40],
            "messages": [{"role": "assistant", "content": text, "timestamp": None, "index": 0}],
            "kind": kind,
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["context_id"]


async def _notes_of(client: AsyncClient, pid: str) -> list[str]:
    resp = await client.get(f"/api/v1/projects/{pid}/contexts")
    return [n["id"] for n in resp.json()["items"]]


# ── Notes ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_a_deleted_note_is_hidden_and_listed_in_the_trash(
    authenticated_client: AsyncClient, vector_calls: list
) -> None:
    pid = await _project(authenticated_client)
    keep = await _note(authenticated_client, pid, "keep me")
    gone = await _note(authenticated_client, pid, "trash me")

    assert (await authenticated_client.delete(f"/api/v1/contexts/detail/{gone}")).status_code == 204
    assert ("chunks", pid, gone) in vector_calls  # out of search and Ask AI at once

    assert await _notes_of(authenticated_client, pid) == [keep]
    assert (await authenticated_client.get(f"/api/v1/contexts/detail/{gone}")).status_code == 404
    everywhere = await authenticated_client.get("/api/v1/contexts")
    assert gone not in [n["id"] for n in everywhere.json()["items"]]

    trash = (await authenticated_client.get("/api/v1/trash")).json()
    assert trash["retention_days"] == settings.trash_retention_days
    [listed] = trash["notes"]
    assert listed["id"] == gone and listed["project_id"] == pid
    def parse(value: str) -> datetime:  # Python 3.10's fromisoformat has no "Z"
        return datetime.fromisoformat(value.replace("Z", "+00:00"))

    assert parse(listed["purge_at"]) - parse(listed["deleted_at"]) == timedelta(days=settings.trash_retention_days)


@pytest.mark.asyncio
async def test_restoring_a_note_brings_it_back_and_reindexes_it(
    authenticated_client: AsyncClient, vector_calls: list, monkeypatch
) -> None:
    reindexed: list = []

    async def record(self, *args):
        reindexed.append(args)

    monkeypatch.setattr(RagService, "reindex_context", record)

    pid = await _project(authenticated_client)
    nid = await _note(authenticated_client, pid, "come back")
    await authenticated_client.delete(f"/api/v1/contexts/detail/{nid}")

    resp = await authenticated_client.post(f"/api/v1/trash/notes/{nid}/restore")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"id": nid, "project_id": pid}
    assert await _notes_of(authenticated_client, pid) == [nid]
    assert (await authenticated_client.get("/api/v1/trash")).json()["notes"] == []

    # Its chunks went with the trashing; the next question puts them back.
    async def answer(self, project_id, question):
        return {"answer": "stub", "confidence": "LOW", "citations": [], "query_used": question,
                "corrective_triggered": False}

    monkeypatch.setattr(RagService, "query_project", answer)
    assert reindexed == []
    asked = await authenticated_client.post(f"/api/v1/projects/{pid}/query", json={"question": "back?"})
    assert asked.status_code == 200, asked.text
    assert [str(a[0]) for a in reindexed] == [nid]


@pytest.mark.asyncio
async def test_trashed_text_can_be_captured_again(authenticated_client: AsyncClient, vector_calls: list) -> None:
    pid = await _project(authenticated_client)
    first = await _note(authenticated_client, pid, "captured twice")
    await authenticated_client.delete(f"/api/v1/contexts/detail/{first}")
    # Not a duplicate of something in the Trash.
    second = await _note(authenticated_client, pid, "captured twice")
    assert second != first

    # Restoring the trashed copy keeps both, rather than failing.
    resp = await authenticated_client.post(f"/api/v1/trash/notes/{first}/restore")
    assert resp.status_code == 200, resp.text
    assert set(await _notes_of(authenticated_client, pid)) == {first, second}


@pytest.mark.asyncio
async def test_delete_forever_removes_a_trashed_note(authenticated_client: AsyncClient, vector_calls: list) -> None:
    pid = await _project(authenticated_client)
    nid = await _note(authenticated_client, pid, "bye for good")
    # Only things already in the Trash can be deleted for good.
    assert (await authenticated_client.delete(f"/api/v1/trash/notes/{nid}")).status_code == 404

    await authenticated_client.delete(f"/api/v1/contexts/detail/{nid}")
    assert (await authenticated_client.delete(f"/api/v1/trash/notes/{nid}")).status_code == 204
    assert (await authenticated_client.get("/api/v1/trash")).json()["notes"] == []
    assert (await authenticated_client.post(f"/api/v1/trash/notes/{nid}/restore")).status_code == 404


# ── Projects ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_a_trashed_project_hides_its_notes_and_comes_back_with_them(
    authenticated_client: AsyncClient, vector_calls: list
) -> None:
    pid = await _project(authenticated_client, "Whole project")
    n1 = await _note(authenticated_client, pid, "one")
    n2 = await _note(authenticated_client, pid, "two")

    assert (await authenticated_client.delete(f"/api/v1/projects/{pid}")).status_code == 204
    assert vector_calls == []  # vectors stay until purge
    assert (await authenticated_client.get(f"/api/v1/contexts/detail/{n1}")).status_code == 404
    everywhere = await authenticated_client.get("/api/v1/contexts")
    assert {n1, n2}.isdisjoint(n["id"] for n in everywhere.json()["items"])
    search = await authenticated_client.post(
        "/api/v1/search/conversations", json={"query": "one", "project_id": pid}
    )
    assert search.status_code == 404

    trash = (await authenticated_client.get("/api/v1/trash")).json()
    assert [(p["id"], p["notes_count"]) for p in trash["projects"]] == [(pid, 2)]
    assert trash["notes"] == []  # its notes come back with it, not one by one

    assert (await authenticated_client.post(f"/api/v1/trash/projects/{pid}/restore")).status_code == 200
    assert set(await _notes_of(authenticated_client, pid)) == {n1, n2}


@pytest.mark.asyncio
async def test_delete_forever_removes_a_project_and_its_rag_data(
    authenticated_client: AsyncClient, vector_calls: list, db_session
) -> None:
    pid = await _project(authenticated_client)
    nid = await _note(authenticated_client, pid, "in a doomed project")
    await authenticated_client.delete(f"/api/v1/projects/{pid}")

    assert (await authenticated_client.delete(f"/api/v1/trash/projects/{pid}")).status_code == 204
    assert vector_calls == [("collection", pid), ("vocabulary", pid)]
    rows = await db_session.execute(
        select(Context.id).where(Context.id == uuid.UUID(nid)).execution_options(**{INCLUDE_DELETED: True})
    )
    assert rows.first() is None


# ── Isolation ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_another_users_trash_is_invisible_and_untouchable(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient, vector_calls: list
) -> None:
    pid = await _project(authenticated_client)
    nid = await _note(authenticated_client, pid, "mine")
    await authenticated_client.delete(f"/api/v1/contexts/detail/{nid}")
    other = await _project(authenticated_client, "Other")
    await authenticated_client.delete(f"/api/v1/projects/{other}")

    theirs = (await second_authenticated_client.get("/api/v1/trash")).json()
    assert theirs["notes"] == [] and theirs["projects"] == []
    for method, path in [
        ("post", f"/api/v1/trash/notes/{nid}/restore"),
        ("delete", f"/api/v1/trash/notes/{nid}"),
        ("post", f"/api/v1/trash/projects/{other}/restore"),
        ("delete", f"/api/v1/trash/projects/{other}"),
    ]:
        resp = await getattr(second_authenticated_client, method)(path)
        assert resp.status_code == 404, (method, path)
    assert len((await authenticated_client.get("/api/v1/trash")).json()["notes"]) == 1


# ── Purge ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_purge_removes_only_what_is_past_the_retention_period(
    authenticated_client: AsyncClient, vector_calls: list, db_session
) -> None:
    pid = await _project(authenticated_client)
    old = await _note(authenticated_client, pid, "old trash")
    recent = await _note(authenticated_client, pid, "recent trash")
    live = await _note(authenticated_client, pid, "still here")
    for nid in (old, recent):
        await authenticated_client.delete(f"/api/v1/contexts/detail/{nid}")
    old_project = await _project(authenticated_client, "Old project")
    await authenticated_client.delete(f"/api/v1/projects/{old_project}")

    long_ago = datetime.now(timezone.utc) - timedelta(days=settings.trash_retention_days + 1)
    await db_session.execute(update(Context).where(Context.id == uuid.UUID(old)).values(deleted_at=long_ago))
    await db_session.execute(
        update(Project).where(Project.id == uuid.UUID(old_project)).values(deleted_at=long_ago)
    )
    vector_calls.clear()

    notes, projects = await TrashService(db_session).purge_expired()
    assert (notes, projects) == (1, 1)
    assert ("chunks", pid, old) in vector_calls
    assert ("collection", old_project) in vector_calls

    trash = (await authenticated_client.get("/api/v1/trash")).json()
    assert [n["id"] for n in trash["notes"]] == [recent]
    assert trash["projects"] == []
    assert await _notes_of(authenticated_client, pid) == [live]

    assert await TrashService(db_session).purge_expired() == (0, 0)  # idempotent
