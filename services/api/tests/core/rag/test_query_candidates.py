"""
tests/core/rag/test_query_candidates.py
──────────────────────────────────────────
Unit tests for multi-candidate query generation (Part 2). No model loads —
this only exercises the candidate-generation logic, not retrieval.
"""
from __future__ import annotations

import pytest

from app.core.rag import vocabulary
from app.core.rag.query_candidates import generate_query_candidates


@pytest.fixture(autouse=True)
def _isolated_vocab_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(vocabulary, "VOCAB_DIR", tmp_path)
    vocabulary._cache.clear()
    yield
    vocabulary._cache.clear()


class TestCandidateGenerationWithoutProject:
    def test_matches_the_worked_example(self):
        """The task's worked example: 'Where did I discussedddd RAGG?'. The
        old spell_corrected fallback and the new topic_centric primary both
        land on "RAG" for this query, so they dedupe into ONE entry — the
        winning label/weight is topic_centric's (1.1), since it's the higher
        of the two and is added last."""
        candidates = generate_query_candidates("Where did I discussedddd RAGG?")
        labels = [c.label for c in candidates]
        assert labels == ["original", "normalized", "extracted_topic", "topic_centric"]
        by_label = {c.label: c.query for c in candidates}
        assert by_label["original"] == "Where did I discussedddd RAGG?"
        assert by_label["normalized"] == "Where did I discussedd RAGG?"
        assert by_label["extracted_topic"] == "RAGG"
        assert by_label["topic_centric"] == "RAG"

    def test_weights_increase_with_correction_confidence(self):
        # Needs a query that's genuinely distinct at every stage — "normalized"
        # gets deduped away if letter-collapse/punctuation cleanup is a no-op.
        candidates = generate_query_candidates("Where did I discussedddd RAGG??")
        by_label = {c.label: c.weight for c in candidates}
        assert (
            by_label["original"]
            < by_label["normalized"]
            < by_label["extracted_topic"]
            < by_label["topic_centric"]
        )

    def test_topic_centric_is_the_highest_weighted_candidate(self):
        candidates = generate_query_candidates("Where did I discussedddd RAGG??")
        assert max(candidates, key=lambda c: c.weight).label == "topic_centric"

    def test_bare_topic_query_still_produces_candidates(self):
        candidates = generate_query_candidates("RAGG")
        assert any(c.query == "RAG" for c in candidates)

    def test_already_clean_query_gets_the_highest_weight_not_the_lowest(self):
        # Regression test: "RAG" collapses to the same string at every stage
        # (original == normalized == extracted_topic == spell_corrected ==
        # topic_centric). The dedup must keep the HIGHEST weight reached
        # (1.1, topic_centric) and relabel accordingly — not the first-seen
        # weight (0.6, original) — otherwise an already-clean query gets its
        # reranker score unfairly discounted downstream.
        candidates = generate_query_candidates("RAG")
        assert len(candidates) == 1
        assert candidates[0].query == "RAG"
        assert candidates[0].label == "topic_centric"
        assert candidates[0].weight == 1.1

    def test_no_vocab_corrected_candidate_without_project_id(self):
        candidates = generate_query_candidates("Where did I discuss RAG?")
        assert all(c.label != "vocab_corrected" for c in candidates)

    def test_duplicate_candidate_strings_are_deduped(self):
        # A simple bare correct topic collapses several stages to the same string.
        candidates = generate_query_candidates("RAG")
        queries = [c.query for c in candidates]
        assert len(queries) == len(set(queries))


class TestCandidateGenerationWithProject:
    def test_vocab_corrected_candidate_uses_learned_vocabulary(self):
        vocabulary.update_vocabulary_from_context(
            "proj-1",
            {
                "title": "LangGraph Notes",
                "platform": "chatgpt",
                "messages": [{"role": "user", "content": "Using LangGraph again today"}],
            },
        )
        candidates = generate_query_candidates("Lang Grap", project_id="proj-1")
        by_label = {c.label: c.query for c in candidates}
        assert by_label.get("vocab_corrected") == "LangGraph"

    def test_falls_back_gracefully_with_no_learned_vocabulary(self):
        # No vocabulary has been indexed for this project — should not error,
        # and vocab_corrected should just equal spell_corrected (deduped away).
        candidates = generate_query_candidates("Where did I discuss RAG?", project_id="empty-proj")
        assert any(c.query == "RAG" for c in candidates)
