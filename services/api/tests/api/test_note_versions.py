"""
tests/api/test_note_versions.py
────────────────────────────────
Every edit bumps a note's `version`. An edit sent with If-Match of an older
version is refused (409 edit_conflict, current version in details) instead
of overwriting what another tab saved in the meantime.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient


async def _note(client: AsyncClient) -> dict:
    project = await client.post("/api/v1/projects", json={"name": "Versions"})
    pid = project.json()["id"]
    resp = await client.post(
        f"/api/v1/projects/{pid}/capture",
        json={
            "idempotency_key": "version-test-note",
            "platform": "note",
            "chat_url": "",
            "captured_at": "2026-11-17T00:00:00Z",
            "title": "t",
            "messages": [{"role": "user", "content": "first draft", "timestamp": None, "index": 0}],
            "kind": "written",
        },
    )
    assert resp.status_code == 200, resp.text
    note = await client.get(f"/api/v1/contexts/detail/{resp.json()['context_id']}")
    return note.json()


async def _patch(client: AsyncClient, note_id: str, body: dict, if_match: str | None = None):
    headers = {"If-Match": if_match} if if_match is not None else {}
    return await client.patch(f"/api/v1/contexts/detail/{note_id}", json=body, headers=headers)


@pytest.mark.asyncio
async def test_a_new_note_is_version_1_and_each_edit_bumps_it(authenticated_client: AsyncClient) -> None:
    note = await _note(authenticated_client)
    assert note["version"] == 1

    first = await _patch(authenticated_client, note["id"], {"content_md": "second draft"}, "1")
    assert first.status_code == 200, first.text
    assert first.json()["version"] == 2

    second = await _patch(authenticated_client, note["id"], {"user_title": "Named"}, "2")
    assert second.json()["version"] == 3


@pytest.mark.asyncio
async def test_an_edit_based_on_an_old_version_is_refused(authenticated_client: AsyncClient) -> None:
    """Tab A and tab B both opened version 1. A saves; B's save must not
    silently replace A's text."""
    note = await _note(authenticated_client)
    tab_a = await _patch(authenticated_client, note["id"], {"content_md": "A's text"}, "1")
    assert tab_a.status_code == 200

    tab_b = await _patch(authenticated_client, note["id"], {"content_md": "B's text"}, "1")
    assert tab_b.status_code == 409
    error = tab_b.json()["error"]
    assert error["code"] == "edit_conflict"
    assert error["details"]["version"] == 2

    current = await authenticated_client.get(f"/api/v1/contexts/detail/{note['id']}")
    assert current.json()["content_md"] == "A's text"
    assert current.json()["version"] == 2


@pytest.mark.asyncio
async def test_keep_mine_resends_with_the_current_version(authenticated_client: AsyncClient) -> None:
    note = await _note(authenticated_client)
    await _patch(authenticated_client, note["id"], {"content_md": "A's text"}, "1")
    conflict = await _patch(authenticated_client, note["id"], {"content_md": "B's text"}, "1")
    current_version = conflict.json()["error"]["details"]["version"]

    resolved = await _patch(authenticated_client, note["id"], {"content_md": "B's text"}, str(current_version))
    assert resolved.status_code == 200
    assert resolved.json()["content_md"] == "B's text"


@pytest.mark.asyncio
@pytest.mark.parametrize("header", ['"1"', 'W/"1"', " 1 "])
async def test_quoted_and_weak_etag_forms_are_accepted(authenticated_client: AsyncClient, header: str) -> None:
    note = await _note(authenticated_client)
    resp = await _patch(authenticated_client, note["id"], {"content_md": "x"}, header)
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_without_if_match_an_edit_still_applies(authenticated_client: AsyncClient) -> None:
    """Clients that don't send If-Match (the annotation box, older builds)
    keep working, and still bump the version so an open editor notices."""
    note = await _note(authenticated_client)
    resp = await _patch(authenticated_client, note["id"], {"user_note": "an annotation"})
    assert resp.status_code == 200
    assert resp.json()["version"] == 2
    stale_editor = await _patch(authenticated_client, note["id"], {"content_md": "editor text"}, "1")
    assert stale_editor.status_code == 409


@pytest.mark.asyncio
async def test_a_malformed_if_match_is_422(authenticated_client: AsyncClient) -> None:
    note = await _note(authenticated_client)
    resp = await _patch(authenticated_client, note["id"], {"content_md": "x"}, "abc")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_another_users_note_is_still_404_not_409(
    authenticated_client: AsyncClient, second_authenticated_client: AsyncClient
) -> None:
    note = await _note(authenticated_client)
    resp = await _patch(second_authenticated_client, note["id"], {"content_md": "x"}, "99")
    assert resp.status_code == 404
