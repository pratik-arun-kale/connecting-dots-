"""
tests/core/rag/test_vector_store.py
──────────────────────────────────────
app/core/rag/vector_store.py against the test Postgres (context_chunks).
No embedding model: vectors are given. Skipped where the test database has
no pgvector (see tests/conftest.py); CI always has it.
"""
from __future__ import annotations

import math
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.core.rag import index_db, vector_store

PROJECT = "11111111-2222-3333-4444-555555555555"
OTHER = "99999999-2222-3333-4444-555555555555"

pytestmark = pytest.mark.usefixtures("pgvector_db")


def _ctx(name: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"ctx:{name}"))


def _vec(*head: float) -> list[float]:
    """384 numbers starting with `head`, the rest zero."""
    return list(head) + [0.0] * (384 - len(head))


def _chunk(context: str, i: int, vector: list[float], body: str = "text") -> dict:
    return {
        "id": f"{context}__m0__c{i}",
        "text": body,
        "embedding": vector,
        "metadata": {"context_id": context, "title": "T", "platform": "chatgpt", "chunk_index": i},
    }


def test_retrieve_ranks_by_cosine_similarity_with_the_old_score():
    a, b = _ctx("a"), _ctx("b")
    vector_store.upsert_chunks(PROJECT, [_chunk(a, 0, _vec(1.0, 0.0)), _chunk(b, 0, _vec(1.0, 1.0))])

    hits = vector_store.retrieve(PROJECT, _vec(1.0, 0.0), top_k=10)

    assert [h["chunk_id"] for h in hits] == [f"{a}__m0__c0", f"{b}__m0__c0"]
    assert [h["rank"] for h in hits] == [1, 2]
    # score = 1 / (1 + cosine distance), as with ChromaDB
    assert hits[0]["score"] == pytest.approx(1.0)
    assert hits[1]["score"] == pytest.approx(1.0 / (1.0 + (1.0 - 1.0 / math.sqrt(2))))
    assert hits[0]["metadata"]["chunk_index"] == 0 and hits[0]["text"] == "text"


def test_retrieve_only_sees_its_own_project_and_respects_top_k():
    mine, theirs = _ctx("mine"), _ctx("theirs")
    vector_store.upsert_chunks(PROJECT, [_chunk(mine, i, _vec(1.0, i)) for i in range(3)])
    vector_store.upsert_chunks(OTHER, [_chunk(theirs, 0, _vec(1.0, 0.0))])

    hits = vector_store.retrieve(PROJECT, _vec(1.0, 0.0), top_k=2)

    assert [h["chunk_id"] for h in hits] == [f"{mine}__m0__c0", f"{mine}__m0__c1"]
    assert vector_store.retrieve(PROJECT.replace("1", "7"), _vec(1.0), top_k=5) == []


def test_get_all_chunks_keeps_the_order_they_were_first_stored_in():
    a, b = _ctx("first"), _ctx("second")
    vector_store.upsert_chunks(PROJECT, [_chunk(b, 0, _vec(1.0)), _chunk(a, 0, _vec(1.0))])
    vector_store.upsert_chunks(PROJECT, [_chunk(b, 0, _vec(0.5), body="edited")])  # update keeps its place

    chunks = vector_store.get_all_chunks(PROJECT)

    assert [c["chunk_id"] for c in chunks] == [f"{b}__m0__c0", f"{a}__m0__c0"]
    assert chunks[0]["text"] == "edited"
    assert vector_store.chunk_count(PROJECT) == 2


def test_delete_project_collection_removes_only_that_project():
    vector_store.upsert_chunks(PROJECT, [_chunk(_ctx("p"), 0, _vec(1.0))])
    vector_store.upsert_chunks(OTHER, [_chunk(_ctx("o"), 0, _vec(1.0))])

    vector_store.delete_project_collection(PROJECT)

    assert vector_store.chunk_count(PROJECT) == 0
    assert vector_store.chunk_count(OTHER) == 1


def test_delete_project_collection_without_chunks_is_a_no_op():
    vector_store.delete_project_collection(PROJECT)
    assert vector_store.chunk_count(PROJECT) == 0


def test_delete_context_chunks_keeps_other_contexts():
    one, two = _ctx("one"), _ctx("two")
    vector_store.upsert_chunks(
        PROJECT, [_chunk(one, 0, _vec(1.0)), _chunk(one, 1, _vec(1.0)), _chunk(two, 0, _vec(1.0))]
    )

    vector_store.delete_context_chunks(PROJECT, one)

    assert [c["chunk_id"] for c in vector_store.get_all_chunks(PROJECT)] == [f"{two}__m0__c0"]


def test_delete_orphans_removes_only_old_chunks_of_missing_notes():
    gone = _ctx("gone")
    vector_store.upsert_chunks(PROJECT, [_chunk(gone, 0, _vec(1.0))])

    assert vector_store.delete_orphans(older_than=timedelta(hours=1)) == 0  # too new: its request may still commit
    with index_db.engine().begin() as conn:
        conn.execute(text("UPDATE context_chunks SET created_at = created_at - interval '2 hours'"))
    assert vector_store.delete_orphans(older_than=timedelta(hours=1)) == 1
    assert vector_store.chunk_count(PROJECT) == 0
