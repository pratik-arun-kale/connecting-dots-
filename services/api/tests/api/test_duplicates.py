"""
tests/api/test_duplicates.py
─────────────────────────────
A captured passage or conversation is saved once per project: a second
capture of the same text from the same page — under any idempotency key —
gets 409 `duplicate` naming the note that already holds it.
"""
from __future__ import annotations

import importlib.util
import uuid
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.core.fingerprint import capture_fingerprint
from app.repositories.context import ContextRepository

URL = "https://claude.ai/chat/dup-test"


async def _project(client: AsyncClient, name: str = "Dup project") -> str:
    resp = await client.post("/api/v1/projects", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _payload(text: str, *, key: str | None = None, url: str = URL, kind: str = "captured", platform: str = "note"):
    return {
        "idempotency_key": key or f"dup-{uuid.uuid4().hex}",
        "platform": platform,
        "chat_url": url,
        "captured_at": "2026-11-17T00:00:00Z",
        "title": "t",
        "messages": [{"role": "assistant", "content": text, "timestamp": None, "index": 0}],
        "kind": kind,
    }


async def _capture(client: AsyncClient, project_id: str, payload: dict):
    return await client.post(f"/api/v1/projects/{project_id}/capture", json=payload)


@pytest.mark.asyncio
async def test_the_same_passage_twice_is_a_409_naming_the_first(authenticated_client: AsyncClient) -> None:
    pid = await _project(authenticated_client)
    first = await _capture(authenticated_client, pid, _payload("Rust borrows are checked at compile time."))
    assert first.status_code == 200, first.text

    second = await _capture(authenticated_client, pid, _payload("Rust borrows are checked at compile time."))
    assert second.status_code == 409
    error = second.json()["error"]
    assert error["code"] == "duplicate"
    assert error["details"]["context_id"] == first.json()["context_id"]

    notes = await authenticated_client.get(f"/api/v1/projects/{pid}/contexts")
    assert notes.json()["total"] == 1


@pytest.mark.asyncio
async def test_a_retry_with_the_same_key_is_still_a_200_replay(authenticated_client: AsyncClient) -> None:
    pid = await _project(authenticated_client)
    payload = _payload("Same request, sent twice by a flaky network.")
    first = await _capture(authenticated_client, pid, payload)
    again = await _capture(authenticated_client, pid, payload)
    assert again.status_code == 200
    assert again.json()["created"] is False
    assert again.json()["context_id"] == first.json()["context_id"]


@pytest.mark.asyncio
async def test_whitespace_differences_still_count_as_the_same(authenticated_client: AsyncClient) -> None:
    pid = await _project(authenticated_client)
    assert (await _capture(authenticated_client, pid, _payload("one  two\nthree"))).status_code == 200
    assert (await _capture(authenticated_client, pid, _payload("  one two three \n"))).status_code == 409


@pytest.mark.asyncio
async def test_a_url_fragment_doesnt_make_it_new(authenticated_client: AsyncClient) -> None:
    pid = await _project(authenticated_client)
    assert (await _capture(authenticated_client, pid, _payload("anchor test", url=URL))).status_code == 200
    assert (await _capture(authenticated_client, pid, _payload("anchor test", url=URL + "#msg-3"))).status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["text", "page", "project"])
async def test_different_text_page_or_project_is_a_new_note(authenticated_client: AsyncClient, change: str) -> None:
    pid = await _project(authenticated_client)
    assert (await _capture(authenticated_client, pid, _payload("base text"))).status_code == 200
    other_pid = await _project(authenticated_client, "Other") if change == "project" else pid
    payload = _payload(
        "base text, changed" if change == "text" else "base text",
        url=URL + "-other" if change == "page" else URL,
    )
    assert (await _capture(authenticated_client, other_pid, payload)).status_code == 200


@pytest.mark.asyncio
async def test_written_notes_can_repeat(authenticated_client: AsyncClient) -> None:
    pid = await _project(authenticated_client)
    for _ in range(2):
        resp = await _capture(authenticated_client, pid, _payload("todo: buy milk", kind="written", url=""))
        assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_an_unchanged_conversation_recapture_is_a_duplicate(authenticated_client: AsyncClient) -> None:
    pid = await _project(authenticated_client)
    chat = _payload("the whole chat", platform="claude")
    assert (await _capture(authenticated_client, pid, chat)).status_code == 200
    again = {**chat, "idempotency_key": "dup-recapture-2"}
    assert (await _capture(authenticated_client, pid, again)).status_code == 409
    grown = {**chat, "idempotency_key": "dup-recapture-3"}
    grown["messages"] = [*chat["messages"], {"role": "user", "content": "one more", "timestamp": None, "index": 1}]
    assert (await _capture(authenticated_client, pid, grown)).status_code == 200


@pytest.mark.asyncio
async def test_another_users_identical_capture_is_independent(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    mine = await _project(authenticated_client)
    theirs = await _project(second_authenticated_client)
    text = "Both users highlight the same answer."
    assert (await _capture(authenticated_client, mine, _payload(text))).status_code == 200
    resp = await _capture(second_authenticated_client, theirs, _payload(text))
    assert resp.status_code == 200  # never a 409 that would point at the other user's note


@pytest.mark.asyncio
async def test_a_simultaneous_duplicate_loses_the_race_cleanly(
    authenticated_client: AsyncClient, monkeypatch
) -> None:
    """Two identical captures both pass the pre-check; the unique index
    stops the second, which then answers 409 like any other duplicate."""
    pid = await _project(authenticated_client)
    first = await _capture(authenticated_client, pid, _payload("racing text"))

    real = ContextRepository.get_by_content_hash
    calls = {"n": 0}

    async def miss_once(self, content_hash: str):
        calls["n"] += 1
        return None if calls["n"] == 1 else await real(self, content_hash)

    monkeypatch.setattr(ContextRepository, "get_by_content_hash", miss_once)
    resp = await _capture(authenticated_client, pid, _payload("racing text"))
    assert resp.status_code == 409
    assert resp.json()["error"]["details"]["context_id"] == first.json()["context_id"]
    # The request's transaction survived the failed insert.
    assert (await authenticated_client.get(f"/api/v1/projects/{pid}/contexts")).json()["total"] == 1


def test_the_migrations_frozen_copy_matches_the_app() -> None:
    path = Path(__file__).parents[2] / "alembic" / "versions" / "0011_capture_fingerprint.py"
    spec = importlib.util.spec_from_file_location("m0011", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for args in [("p1", URL, "a  b"), ("p2", "", "x"), ("p3", URL + "#f", " y "), ("p4", URL, "  ")]:
        assert module._fingerprint(*args) == capture_fingerprint(*args)
