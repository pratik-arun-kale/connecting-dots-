"""
tests/api/test_account_delete.py
─────────────────────────────────
DELETE /auth/account: with the right password, the user and everything they
own is gone (projects, sessions, notes, sign-in sessions, email tokens, and
the search index); another user's data is untouched; a wrong password or no
sign-in changes nothing.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rag import vector_store, vocabulary
from app.db.soft_delete import INCLUDE_DELETED
from app.models.auth_session import AuthSession
from app.models.context import Context
from app.models.email_token import EmailToken
from app.models.project import Project
from app.models.session import Session
from app.models.user import User

API = "/api/v1"
PASSWORD = "fixture-password-123"  # authenticated_client's user (tests/conftest.py)
ALL = {INCLUDE_DELETED: True}


async def _project_with_note(client: AsyncClient, name: str) -> tuple[str, str]:
    pid = (await client.post(f"{API}/projects", json={"name": name})).json()["id"]
    resp = await client.post(f"{API}/projects/{pid}/capture", json={
        "idempotency_key": f"delete-{uuid.uuid4().hex}", "platform": "note",
        "chat_url": "https://chatgpt.com/c/delete", "captured_at": "2026-11-25T00:00:00Z",
        "title": f"{name} note", "messages": [{"role": "user", "content": f"Text of {name}", "index": 0}],
    })
    assert resp.status_code == 200, resp.text
    return pid, resp.json()["context_id"]


async def _user_id(db: AsyncSession, email: str) -> uuid.UUID:
    return (await db.execute(select(User.id).where(User.email == email))).scalar_one()


async def _owned(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    """How many rows of each kind belong to the user, trash included."""
    projects = select(Project.id).where(Project.user_id == user_id)
    sessions = select(Session.id).where(Session.project_id.in_(projects))

    async def count(query) -> int:
        return (await db.execute(query.execution_options(**ALL))).scalar_one()

    return {
        "users": await count(select(func.count()).select_from(User).where(User.id == user_id)),
        "projects": await count(select(func.count()).select_from(Project).where(Project.user_id == user_id)),
        "sessions": await count(select(func.count()).select_from(Session).where(Session.project_id.in_(projects))),
        "contexts": await count(select(func.count()).select_from(Context).where(Context.session_id.in_(sessions))),
        "auth_sessions": await count(
            select(func.count()).select_from(AuthSession).where(AuthSession.user_id == user_id)
        ),
        "email_tokens": await count(
            select(func.count()).select_from(EmailToken).where(EmailToken.user_id == user_id)
        ),
    }


async def _delete(client: AsyncClient, password: str):
    return await client.request("DELETE", f"{API}/auth/account", json={"password": password})


@pytest.mark.asyncio
async def test_deleting_the_account_removes_everything_it_owned(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient, db_session: AsyncSession
) -> None:
    me, other = authenticated_client, second_authenticated_client
    my_id = await _user_id(db_session, "fixture-user@test.com")
    other_id = await _user_id(db_session, "fixture-user-2@test.com")
    await _project_with_note(me, "Mine")
    trashed, _ = await _project_with_note(me, "Trashed")
    assert (await me.delete(f"{API}/projects/{trashed}")).status_code == 204  # in the Trash, still owned
    await me.post(f"{API}/auth/verify-email/request")  # leaves an email token
    await _project_with_note(other, "Theirs")

    before = await _owned(db_session, my_id)
    assert before["projects"] == 2 and before["contexts"] == 2 and before["email_tokens"] >= 1
    other_before = await _owned(db_session, other_id)

    resp = await _delete(me, PASSWORD)

    assert resp.status_code == 204, resp.text
    assert await _owned(db_session, my_id) == {k: 0 for k in before}
    assert await _owned(db_session, other_id) == other_before
    login = await me.post(f"{API}/auth/login", json={"email": "fixture-user@test.com", "password": PASSWORD})
    assert login.status_code == 401
    assert (await me.get(f"{API}/projects")).status_code == 401  # the old access token names a user who's gone


@pytest.mark.asyncio
async def test_a_wrong_password_deletes_nothing(authenticated_client: AsyncClient, db_session: AsyncSession) -> None:
    my_id = await _user_id(db_session, "fixture-user@test.com")
    await _project_with_note(authenticated_client, "Kept")
    before = await _owned(db_session, my_id)

    resp = await _delete(authenticated_client, "not-my-password")

    assert resp.status_code == 403  # signed in fine; only the confirmation is wrong
    assert await _owned(db_session, my_id) == before


@pytest.mark.asyncio
async def test_deleting_needs_a_signed_in_user(client: AsyncClient) -> None:
    assert (await _delete(client, PASSWORD)).status_code == 401


@pytest.mark.asyncio
async def test_password_guesses_are_limited(authenticated_client: AsyncClient) -> None:
    codes = [(await _delete(authenticated_client, f"guess-{i}")).status_code for i in range(6)]
    assert codes == [403] * 5 + [429]


@pytest.mark.asyncio
async def test_the_search_index_of_every_project_goes_too(
    pgvector_db, authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    mine, my_note = await _project_with_note(authenticated_client, "Indexed")
    trashed, trashed_note = await _project_with_note(authenticated_client, "Indexed, trashed")
    theirs, their_note = await _project_with_note(second_authenticated_client, "Theirs, indexed")
    assert (await authenticated_client.delete(f"{API}/projects/{trashed}")).status_code == 204
    # The suite stubs real indexing; put chunks and a vocabulary in directly.
    for pid, cid in ((mine, my_note), (trashed, trashed_note), (theirs, their_note)):
        vector_store.upsert_chunks(pid, [{
            "id": f"{cid}__m0__c0", "text": "text", "embedding": [1.0] + [0.0] * 383,
            "metadata": {"context_id": cid},
        }])
        vocabulary.update_vocabulary_from_context(pid, {"title": "LangGraph notes", "messages": []})

    assert (await _delete(authenticated_client, PASSWORD)).status_code == 204

    vocabulary.clear_cache()
    assert vector_store.chunk_count(mine) == 0 and vector_store.chunk_count(trashed) == 0
    assert vocabulary._load_vocab(mine) == {} and vocabulary._load_vocab(trashed) == {}
    assert vector_store.chunk_count(theirs) == 1
    assert vocabulary._load_vocab(theirs) != {}
