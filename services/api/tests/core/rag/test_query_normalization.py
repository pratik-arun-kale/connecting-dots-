"""
tests/core/rag/test_query_normalization.py
────────────────────────────────────────────
Unit tests for normalize_conversation_search_query() — the deterministic,
regex + Levenshtein-fuzzy-matching layer that reduces conversation-search
meta-questions and typo'd queries down to their bare, corrected topic before
retrieval. No LLM, no network, no fixtures — pure function tests.
"""

from __future__ import annotations

import pytest

from app.core.rag.query_normalizer import (
    correct_technical_terms,
    levenshtein_distance,
    normalize_conversation_search_query,
)

# ── Phase 4 required test matrix: every variation must normalize to the ────
# ── same bare topic as the topic itself, for each of the four topics. ──────

TOPICS = ["RAG", "FastAPI", "NVIDIA", "ChromaDB", "Redis"]


def _phrase_variations(topic: str) -> list[str]:
    return [
        topic,
        f"Where did I discuss {topic}?",
        f"Where did I discussedddd {topic}?",
        f"Did I discuss {topic}",
        f"Whre did I discuss {topic}",
        f"Find chats about {topic}",
        f"Search conversations for {topic}",
    ]


@pytest.mark.parametrize("topic", TOPICS)
def test_all_phrase_variations_normalize_to_same_topic(topic: str) -> None:
    results = {normalize_conversation_search_query(q) for q in _phrase_variations(topic)}
    # Case may differ ("rag" vs "RAG") but there must be exactly one
    # case-insensitive result across every phrasing of the same topic.
    assert len({r.lower() for r in results}) == 1
    assert next(iter(results)).lower() == topic.lower()


@pytest.mark.parametrize(
    "query, expected_topic",
    [
        ("RAG", "RAG"),
        ("rag", "rag"),
        ("RAGG", "RAG"),
        ("raag", "RAG"),
        ("FastAPII", "FastAPI"),
        ("Fast APi", "FastAPI"),
        ("Nvidai", "NVIDIA"),
        ("NVIDA", "NVIDIA"),
        ("ChromDB", "ChromaDB"),
        ("Chroma DB", "ChromaDB"),
        ("Reddis", "Redis"),
    ],
)
def test_bare_topic_typo_correction(query: str, expected_topic: str) -> None:
    assert normalize_conversation_search_query(query) == expected_topic


@pytest.mark.parametrize(
    "query",
    [
        "Where did I discuss RAG?",
        "Did I discuss RAG?",
        "Did we discuss RAG?",
        "Have I discussed RAG?",
        "Which chat contains RAG?",
        "Find conversations about RAG",
        "Search conversations for RAG",
        "Show chats about RAG",
        "When did I discuss RAG?",
    ],
)
def test_known_phrase_variations_extract_bare_topic(query: str) -> None:
    assert normalize_conversation_search_query(query) == "RAG"


@pytest.mark.parametrize(
    "query, expected_topic",
    [
        ("Where did I discussedddd RAG?", "RAG"),  # repeated-letter typo in verb
        ("Where did i discused rag", "rag"),  # missing letter in verb
        ("Whre did I discuss RAG", "RAG"),  # missing letter in interrogative
        ("Did I discussedddd RAG", "RAG"),  # no interrogative + repeated letters
    ],
)
def test_typo_tolerant_phrase_detection(query: str, expected_topic: str) -> None:
    assert normalize_conversation_search_query(query) == expected_topic


def test_repeated_letter_collapse_does_not_break_legitimate_double_letters() -> None:
    # "discussed" itself has a legitimate double 's' — must survive untouched
    # when it's already spelled correctly.
    assert normalize_conversation_search_query("Did I discuss RAG") == "RAG"


class TestTechnicalTermProtection:
    """Exact technical-term spellings must never be altered."""

    @pytest.mark.parametrize(
        "term",
        [
            "FastAPI", "ChromaDB", "CUDA", "RAG", "Ollama", "Redis",
            "PostgreSQL", "TypeScript", "OpenAI", "NVIDIA",
        ],
    )
    def test_exact_technical_terms_are_never_modified(self, term: str) -> None:
        assert correct_technical_terms(term) == term
        assert normalize_conversation_search_query(term) == term

    def test_unknown_words_are_never_force_corrected(self) -> None:
        # Not close to any known technical term — must pass through untouched.
        assert correct_technical_terms("kubernetes-operator-pattern") == "kubernetes-operator-pattern"
        assert normalize_conversation_search_query("blueberry muffins") == "blueberry muffins"


class TestLevenshteinDistance:
    def test_identical_strings(self) -> None:
        assert levenshtein_distance("rag", "rag") == 0

    def test_single_insertion(self) -> None:
        assert levenshtein_distance("rag", "ragg") == 1

    def test_single_deletion(self) -> None:
        assert levenshtein_distance("chromadb", "chromdb") == 1

    def test_empty_strings(self) -> None:
        assert levenshtein_distance("", "abc") == 3
        assert levenshtein_distance("abc", "") == 3


def test_non_matching_queries_are_left_unchanged() -> None:
    query = "Summarize the main topics from my conversations"
    assert normalize_conversation_search_query(query) == query


def test_whitespace_and_punctuation_cleanup() -> None:
    assert normalize_conversation_search_query("   RAG   ") == "RAG"
    assert normalize_conversation_search_query("Did I discuss RAG???") == "RAG"
    assert normalize_conversation_search_query("Did I discuss RAG!!!") == "RAG"
