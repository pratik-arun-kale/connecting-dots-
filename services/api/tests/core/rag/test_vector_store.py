"""
tests/core/rag/test_vector_store.py
──────────────────────────────────────
Unit tests for deleting RAG data in app/core/rag/vector_store.py. The
ChromaDB client is pointed at a temp directory — never the real
data/chromadb — and no embedding model is loaded (vectors are given).
"""
from __future__ import annotations

import chromadb
import pytest

from app.core.rag import vector_store

PROJECT = "11111111-2222-3333-4444-555555555555"


@pytest.fixture(autouse=True)
def _temp_chroma(tmp_path, monkeypatch):
    monkeypatch.setattr(vector_store, "_client", chromadb.PersistentClient(path=str(tmp_path)))


def _collection_names() -> set[str]:
    return {getattr(c, "name", c) for c in vector_store._get_client().list_collections()}


def _add_chunk(context_id: str, chunk_id: str) -> None:
    vector_store.get_collection(PROJECT).add(
        ids=[chunk_id],
        embeddings=[[0.1, 0.2, 0.3]],
        documents=["text"],
        metadatas=[{"context_id": context_id}],
    )


def test_delete_project_collection_drops_it():
    _add_chunk("ctx-1", "ctx-1__m0__c0")
    assert vector_store.chunk_count(PROJECT) == 1

    vector_store.delete_project_collection(PROJECT)

    assert vector_store._collection_name(PROJECT) not in _collection_names()


def test_delete_project_collection_without_one_is_a_no_op():
    vector_store.delete_project_collection(PROJECT)
    assert vector_store._collection_name(PROJECT) not in _collection_names()


def test_delete_context_chunks_keeps_other_contexts():
    _add_chunk("ctx-1", "ctx-1__m0__c0")
    _add_chunk("ctx-2", "ctx-2__m0__c0")

    vector_store.delete_context_chunks(PROJECT, "ctx-1")

    assert vector_store.get_collection(PROJECT).get()["ids"] == ["ctx-2__m0__c0"]
