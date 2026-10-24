"""
tests/services/test_rag_reindex.py
───────────────────────────────────
Unit tests for re-indexing after an edit (app/services/rag_service.py):
what text gets indexed, and how bursts of autosaves are coalesced.
No DB, no vector store — _reindex_sync is replaced by a recorder.
"""
from __future__ import annotations

import asyncio
import uuid

import pytest

from app.models.context import Context
from app.services.rag_service import RagService, raw_content_for_index

SESSION_ID = uuid.uuid4()
PROJECT_ID = uuid.uuid4()


def _context(**fields) -> Context:
    defaults = dict(
        platform="note",
        title="[Note] first words",
        user_title=None,
        chat_url="",
        content_md=None,
        raw_content={
            "title": "[Note] first words",
            "platform": "note",
            "chat_url": "",
            "messages": [{"role": "user", "content": "first words", "timestamp": None, "index": 0}],
            "metadata": {"source": "dashboard-note"},
        },
    )
    return Context(**{**defaults, **fields})


class TestRawContentForIndex:
    def test_note_is_indexed_from_its_edited_body(self):
        raw = raw_content_for_index(_context(content_md="first words, then the rest of the note"))
        assert [m["content"] for m in raw["messages"]] == ["first words, then the rest of the note"]

    def test_note_without_content_md_falls_back_to_captured_messages(self):
        raw = raw_content_for_index(_context(content_md=None))
        assert [m["content"] for m in raw["messages"]] == ["first words"]

    def test_conversation_keeps_its_captured_messages(self):
        messages = [
            {"role": "user", "content": "What is RRF?", "timestamp": None, "index": 0},
            {"role": "assistant", "content": "Reciprocal rank fusion…", "timestamp": None, "index": 1},
        ]
        context = _context(
            platform="claude",
            title="RRF chat",
            chat_url="https://claude.ai/chat/1",
            content_md="What is RRF?\n\nReciprocal rank fusion…",
            raw_content={"title": "RRF chat", "platform": "claude", "messages": messages},
        )
        raw = raw_content_for_index(context)
        assert raw["messages"] == messages
        assert raw["platform"] == "claude"
        assert raw["chat_url"] == "https://claude.ai/chat/1"

    def test_readers_own_title_wins(self):
        raw = raw_content_for_index(_context(user_title="Interview prep"))
        assert raw["title"] == "Interview prep"

    def test_automatic_title_when_reader_has_none(self):
        raw = raw_content_for_index(_context())
        assert raw["title"] == "[Note] first words"


class TestReindexCoalescing:
    @pytest.fixture
    def synced(self, monkeypatch) -> list[tuple]:
        calls: list[tuple] = []
        monkeypatch.setattr(RagService, "_reindex_sync", lambda self, *args: calls.append(args))
        return calls

    async def test_a_burst_of_edits_reindexes_once_with_the_latest_content(self, synced):
        service = RagService()
        context_id = uuid.uuid4()
        await asyncio.gather(
            service.reindex_context(context_id, SESSION_ID, PROJECT_ID, {"v": 1}, delay=0.05),
            service.reindex_context(context_id, SESSION_ID, PROJECT_ID, {"v": 2}, delay=0.05),
            service.reindex_context(context_id, SESSION_ID, PROJECT_ID, {"v": 3}, delay=0.05),
        )
        assert synced == [(str(context_id), str(SESSION_ID), str(PROJECT_ID), {"v": 3})]

    async def test_different_contexts_are_not_coalesced(self, synced):
        service = RagService()
        a, b = uuid.uuid4(), uuid.uuid4()
        await asyncio.gather(
            service.reindex_context(a, SESSION_ID, PROJECT_ID, {"v": "a"}, delay=0.05),
            service.reindex_context(b, SESSION_ID, PROJECT_ID, {"v": "b"}, delay=0.05),
        )
        assert sorted(call[0] for call in synced) == sorted([str(a), str(b)])

    async def test_edits_far_apart_each_reindex(self, synced):
        service = RagService()
        context_id = uuid.uuid4()
        await service.reindex_context(context_id, SESSION_ID, PROJECT_ID, {"v": 1}, delay=0.01)
        await service.reindex_context(context_id, SESSION_ID, PROJECT_ID, {"v": 2}, delay=0.01)
        assert [call[3] for call in synced] == [{"v": 1}, {"v": 2}]
