"""
tests/core/rag/test_topic_extractor.py
──────────────────────────────────────────
Unit tests for the topic-centric query understanding pipeline (redesign of
conversation-search intent detection). No model loads — pure string logic.
"""
from __future__ import annotations

from app.core.rag.topic_extractor import extract_topic


class TestEquivalenceClass:
    """All of these should collapse to the identical topic string, regardless
    of sentence shape, casing, or minor typos — the whole point of the
    redesign (see topic_extractor.py module docstring)."""

    EQUIVALENT_QUERIES = [
        "RAG",
        "rag",
        "Where did I discuss RAG",
        "Where did I discussedddd RAG",
        "where i disussed about rag",
        "did we ever discuss rag",
        "rag discussion",
        "show rag chats",
        "find rag conversation",
        "remember rag",
        "tell me the rag chat",
        "search rag",
    ]

    def test_all_equivalent_phrasings_produce_the_same_topic(self):
        results = {q: extract_topic(q) for q in self.EQUIVALENT_QUERIES}
        assert len(set(results.values())) == 1, results

    def test_the_shared_topic_is_the_canonical_rag(self):
        assert extract_topic("rag discussion") == "RAG"
        assert extract_topic("RAG") == "RAG"


class TestMultiWordTopics:
    def test_multi_word_topic_survives_intact(self):
        assert extract_topic("where did we discuss postgres indexing") == "PostgreSQL indexing"

    def test_order_of_remaining_tokens_is_preserved(self):
        # "and" is a stop-word and gets stripped along with "show"/"me"/"chats".
        assert extract_topic("show me kubernetes and docker chats") == "Kubernetes Docker"


class TestStopWordAndIntentWordRemoval:
    def test_removes_generic_stop_words(self):
        assert extract_topic("the RAG and the chunking") == "RAG chunking"

    def test_removes_intent_words_regardless_of_position(self):
        assert extract_topic("RAG discussion please") == "RAG"
        assert extract_topic("please tell me about RAG") == "RAG"

    def test_removes_pronouns(self):
        assert extract_topic("did we ever discuss our RAG setup") == "RAG setup"


class TestSpellCorrection:
    def test_corrects_typo_of_intent_word_before_removal(self):
        # "disussed" is a typo of "discussed" — must still be recognized as an
        # intent word and removed, not kept as a leftover "topic" token.
        assert extract_topic("where i disussed about RAG") == "RAG"

    def test_corrects_typo_of_technical_term(self):
        assert extract_topic("tell me about ragg") == "RAG"

    def test_leaves_unknown_words_untouched(self):
        # A word that isn't close to any intent/stop/technical term should
        # pass through unchanged rather than being silently dropped or altered.
        assert extract_topic("discuss zephyrnetics") == "zephyrnetics"


class TestCasingCanonicalization:
    def test_exact_match_still_canonicalizes_casing(self):
        # Deliberate divergence from query_normalizer.correct_technical_terms:
        # here, even an exact-but-wrong-case match is canonicalized, so "RAG"
        # and "rag" are byte-identical after extraction.
        assert extract_topic("RAG") == extract_topic("rag") == "RAG"


class TestFallbackWhenEverythingIsRemoved:
    def test_all_intent_words_falls_back_to_corrected_tokens_not_empty(self):
        # "did we discuss" is 100% intent/stop words with no topic left. Falling
        # back to the corrected (but unfiltered) tokens beats returning "".
        result = extract_topic("did we discuss")
        assert result != ""
        assert result.strip() != ""

    def test_empty_query_returns_stripped_original(self):
        assert extract_topic("   ") == ""


class TestVocabMapOverride:
    def test_custom_vocab_map_is_used_for_technical_term_correction(self):
        vocab_map = {"langgraph": "LangGraph"}
        assert extract_topic("tell me about lang grap", vocab_map=vocab_map) in (
            "lang grap",
            "LangGraph grap",
        )
        # A near-miss single-token typo against the custom vocab corrects cleanly.
        assert extract_topic("discuss langgrap", vocab_map=vocab_map) == "LangGraph"

    def test_none_vocab_map_defaults_to_protected_technical_terms(self):
        assert extract_topic("discuss ragg", vocab_map=None) == "RAG"
