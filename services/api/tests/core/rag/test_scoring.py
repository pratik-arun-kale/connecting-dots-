"""
tests/core/rag/test_scoring.py
─────────────────────────────────
Unit tests for the Part 4 conversation scoring bonuses in pipeline.py —
pure functions, no model loads, no retrieval.
"""
from __future__ import annotations

from app.core.rag.pipeline import (
    _chunk_count_bonus,
    _filter_positive_chunks,
    _metadata_match_bonus,
    _title_match_bonus,
)


class TestTitleMatchBonus:
    def test_exact_substring_match_scores_highest(self):
        assert _title_match_bonus("RAG", "RAG - RAG Chunking for Complex Data") == 1.5

    def test_fuzzy_word_match_scores_lower_than_exact(self):
        # "redis" is not a *substring* of "reddis" (extra 'd' breaks the
        # contiguous match) but is a close fuzzy match — exercises the fuzzy
        # branch specifically, not the exact-substring shortcut.
        bonus = _title_match_bonus("Redis", "Reddis Setup Notes")
        assert 0.0 < bonus < 1.5

    def test_no_match_scores_zero(self):
        assert _title_match_bonus("RAG", "NVIDIA Monopoly Explained") == 0.0

    def test_empty_title_or_topic_scores_zero(self):
        assert _title_match_bonus("RAG", "") == 0.0
        assert _title_match_bonus("", "RAG Chunking") == 0.0

    def test_case_insensitive(self):
        assert _title_match_bonus("rag", "RAG Chunking for Complex Data") == 1.5


class TestMetadataMatchBonus:
    def test_exact_platform_match(self):
        assert _metadata_match_bonus("chatgpt", {"platform": "chatgpt"}) == 0.3

    def test_no_match_scores_zero(self):
        assert _metadata_match_bonus("RAG", {"platform": "chatgpt"}) == 0.0

    def test_missing_platform_scores_zero(self):
        assert _metadata_match_bonus("RAG", {}) == 0.0


class TestChunkCountBonus:
    def test_single_chunk_gets_no_bonus(self):
        assert _chunk_count_bonus(1) == 0.0

    def test_bonus_grows_with_more_chunks(self):
        assert _chunk_count_bonus(2) < _chunk_count_bonus(3) < _chunk_count_bonus(4)

    def test_bonus_is_capped(self):
        assert _chunk_count_bonus(100) == 0.3
        assert _chunk_count_bonus(1000) == 0.3

    def test_zero_chunks_does_not_go_negative(self):
        assert _chunk_count_bonus(0) == 0.0


class TestFilterPositiveChunks:
    """Regression tests for the bug found in Phase 5 live testing: unrelated
    conversations with negative reranker scores (e.g. rank 4-5 of a widened
    multi-candidate merge) were leaking into search results."""

    def test_drops_negative_score_chunks(self):
        reranked = [
            {"chunk_id": "a", "reranker_score": 3.0},
            {"chunk_id": "b", "reranker_score": -8.4},
        ]
        result = _filter_positive_chunks(reranked)
        assert [r["chunk_id"] for r in result] == ["a"]

    def test_drops_zero_score_chunks(self):
        reranked = [{"chunk_id": "a", "reranker_score": 0.0}]
        assert _filter_positive_chunks(reranked) == []

    def test_keeps_all_positive_chunks(self):
        reranked = [{"chunk_id": "a", "reranker_score": 1.0}, {"chunk_id": "b", "reranker_score": 0.5}]
        result = _filter_positive_chunks(reranked)
        assert len(result) == 2

    def test_empty_input(self):
        assert _filter_positive_chunks([]) == []
