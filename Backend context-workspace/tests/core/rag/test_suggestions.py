"""
tests/core/rag/test_suggestions.py
──────────────────────────────────────
Unit tests for "did you mean" suggestions (Part 3). vector_store and embedder
are monkeypatched so these tests never load the real embedding model.
"""
from __future__ import annotations

import pytest

from app.core.rag import suggestions, vocabulary


@pytest.fixture(autouse=True)
def _isolated_vocab_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(vocabulary, "VOCAB_DIR", tmp_path)
    vocabulary._cache.clear()
    yield
    vocabulary._cache.clear()


FAKE_CHUNKS = [
    {
        "chunk_id": "ctx-1__m0__c0",
        "text": "Some content about retrieval augmented generation.",
        "metadata": {"context_id": "ctx-1", "title": "RAG Chunking Deep Dive", "platform": "chatgpt"},
    },
    {
        "chunk_id": "ctx-2__m0__c0",
        "text": "NVIDIA dominates the GPU market.",
        "metadata": {"context_id": "ctx-2", "title": "NVIDIA Monopoly Explained", "platform": "chatgpt"},
    },
]


@pytest.fixture
def fake_vector_store(monkeypatch):
    monkeypatch.setattr(suggestions.vector_store, "get_all_chunks", lambda project_id: FAKE_CHUNKS)
    monkeypatch.setattr(suggestions.vector_store, "retrieve", lambda project_id, emb, top_k=10: [])
    monkeypatch.setattr(suggestions.embedder, "embed_query", lambda q: [0.0] * 384)
    yield


class TestClosestTitles:
    def test_fuzzy_title_match(self, fake_vector_store):
        results = suggestions._closest_titles("proj-1", "NVIDA", limit=5)
        titles = {r["title"] for r in results}
        assert "NVIDIA Monopoly Explained" in titles

    def test_no_match_returns_empty(self, fake_vector_store):
        results = suggestions._closest_titles("proj-1", "completely-unrelated-zzz", limit=5)
        assert results == []

    def test_match_type_is_fuzzy_title(self, fake_vector_store):
        results = suggestions._closest_titles("proj-1", "NVIDA", limit=5)
        assert all(r["match_type"] in ("fuzzy_title", "semantic") for r in results)


class TestClosestTerms:
    def test_finds_close_protected_term(self, fake_vector_store):
        topics = suggestions._closest_terms("RAGG", "proj-1", "technology", limit=5)
        assert "RAG" in topics

    def test_excludes_exact_match(self, fake_vector_store):
        topics = suggestions._closest_terms("RAG", "proj-1", "technology", limit=5)
        assert "RAG" not in topics  # exact match isn't a "suggestion" for itself

    def test_does_not_suggest_unrelated_short_terms(self, fake_vector_store):
        # Regression test (Phase 5 live testing): with slack=2 this incorrectly
        # suggested "React" and "NVIDIA" for "Reddis" — a typo of "Redis".
        # Zero slack means a term must be within auto-correction's own
        # edit-distance threshold, not a generous "close enough to browse" one.
        topics = suggestions._closest_terms("Reddis", "proj-1", "technology", limit=5)
        assert "React" not in topics
        assert "NVIDIA" not in topics

    def test_finds_learned_topic_term(self, fake_vector_store):
        vocabulary.update_vocabulary_from_context(
            "proj-2", {"title": "Zenith Tool Overview", "platform": "chatgpt", "messages": []}
        )
        topics = suggestions._closest_terms("Zenit", "proj-2", "topic", limit=5)
        assert any("Zenith" in t for t in topics)


class TestGenerateSuggestions:
    def test_returns_all_three_categories(self, fake_vector_store):
        result = suggestions.generate_suggestions("proj-1", "NVIDA")
        assert "closest_topics" in result
        assert "closest_technologies" in result
        assert "related_conversations" in result

    def test_related_conversations_reflect_fuzzy_title_match(self, fake_vector_store):
        result = suggestions.generate_suggestions("proj-1", "NVIDA")
        titles = {c["title"] for c in result["related_conversations"]}
        assert "NVIDIA Monopoly Explained" in titles
