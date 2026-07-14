"""
tests/core/rag/test_vocabulary.py
────────────────────────────────────
Unit tests for the dynamic per-project vocabulary (Part 1): extraction,
storage (JSON file + in-memory cache), duplicate handling, and merging with
the protected technical-term dictionary. Storage is redirected to a temp
directory — no real project data, no model loads, no DB.
"""
from __future__ import annotations

import pytest

from app.core.rag import vocabulary


@pytest.fixture(autouse=True)
def _isolated_vocab_storage(tmp_path, monkeypatch):
    """Redirect vocabulary storage to a temp dir and clear the in-memory
    cache before/after each test so tests never see each other's data."""
    monkeypatch.setattr(vocabulary, "VOCAB_DIR", tmp_path)
    vocabulary._cache.clear()
    yield
    vocabulary._cache.clear()


class TestExtractCandidateTerms:
    def test_extracts_camel_case(self):
        found = {t for t, _ in vocabulary.extract_candidate_terms("We used FastAPI and ChromaDB today.")}
        assert "FastAPI" in found
        assert "ChromaDB" in found

    def test_extracts_allcaps_acronyms(self):
        found = {t for t, _ in vocabulary.extract_candidate_terms("The RAG pipeline uses CUDA.")}
        assert "RAG" in found
        assert "CUDA" in found

    def test_extracts_titlecase_phrases(self):
        found = {t for t, _ in vocabulary.extract_candidate_terms("Context Vault Architecture is documented.")}
        assert "Context Vault Architecture" in found

    def test_extracts_mid_sentence_single_word_proper_noun(self):
        found = {t for t, _ in vocabulary.extract_candidate_terms("How do I use LangGraph with Qdrant today?")}
        assert "Qdrant" in found  # single-capital word, mid-sentence -> proper noun signal

    def test_does_not_extract_sentence_initial_single_word_by_default(self):
        # "Today" is sentence-initial and only mentioned once — shouldn't be
        # promoted just because English capitalizes the first word of a sentence.
        found = {t for t, _ in vocabulary.extract_candidate_terms("Today was a normal day.")}
        assert "Today" not in found

    def test_repeated_sentence_initial_word_is_still_extracted(self):
        text = "Docker. Docker is useful. Docker helps a lot."
        # "Docker" is protected/technology-cased anyway (all-titlecase, single
        # hump) but repetition alone should still count as a signal here.
        found = {t for t, _ in vocabulary.extract_candidate_terms("Zenith. Zenith is our tool. Zenith helps.")}
        assert "Zenith" in found

    def test_allow_sentence_initial_for_titles(self):
        found = {t for t, _ in vocabulary.extract_candidate_terms("Zenith Setup Guide", allow_sentence_initial=True)}
        assert "Zenith" in found

    def test_ignores_plain_lowercase_text(self):
        assert vocabulary.extract_candidate_terms("this is just a normal sentence") == []

    def test_ignores_common_sentence_starters(self):
        found = {t for t, _ in vocabulary.extract_candidate_terms("However, this works. However it does.")}
        assert "However" not in found


class TestUpdateVocabularyFromContext:
    def _raw(self, title="", content="", platform="chatgpt"):
        return {"title": title, "platform": platform, "messages": [{"role": "user", "content": content}]}

    def test_new_terms_are_learned(self):
        vocabulary.update_vocabulary_from_context(
            "proj-1", self._raw(title="LangGraph Notes", content="Using LangGraph with Qdrant.")
        )
        vocab = vocabulary._load_vocab("proj-1")
        assert "langgraph" in vocab
        assert vocab["langgraph"].canonical == "LangGraph"

    def test_duplicate_mentions_increment_count_not_new_entries(self):
        vocabulary.update_vocabulary_from_context(
            "proj-2", self._raw(content="LangGraph is great. I love LangGraph. LangGraph forever.", platform="")
        )
        vocab = vocabulary._load_vocab("proj-2")
        assert len(vocab) == 1  # one entry, not three — platform="" suppresses the metadata term
        assert vocab["langgraph"].count == 3

    def test_canonical_casing_is_majority_vote(self):
        # "Zenith" (not in the protected dictionary) so the entry is actually
        # learned rather than skipped as already-protected.
        vocabulary.update_vocabulary_from_context("proj-3", self._raw(content="Zenith Zenith Zenith", platform=""))
        vocabulary.update_vocabulary_from_context("proj-3", self._raw(content="zenith zenith", platform=""))
        vocab = vocabulary._load_vocab("proj-3")
        assert vocab["zenith"].canonical == "Zenith"

    def test_protected_terms_are_not_relearned(self):
        vocabulary.update_vocabulary_from_context("proj-4", self._raw(title="RAG basics"))
        vocab = vocabulary._load_vocab("proj-4")
        assert "rag" not in vocab

    def test_persists_across_cache_clear(self):
        vocabulary.update_vocabulary_from_context("proj-5", self._raw(title="Qdrant Setup"))
        vocabulary._cache.clear()
        vocab = vocabulary._load_vocab("proj-5")
        assert "qdrant" in vocab

    def test_metadata_platform_is_recorded(self):
        # "gemini" isn't in the protected dictionary (unlike "claude"), so it's
        # actually learned rather than skipped.
        vocabulary.update_vocabulary_from_context("proj-6", self._raw(platform="gemini"))
        vocab = vocabulary._load_vocab("proj-6")
        assert "gemini" in vocab
        assert vocab["gemini"].kind == "metadata"

    def test_frequent_lowercase_word_is_promoted(self):
        content = "budgeting budgeting budgeting budgeting is important"
        vocabulary.update_vocabulary_from_context("proj-7", self._raw(content=content, platform=""))
        vocab = vocabulary._load_vocab("proj-7")
        assert "budgeting" in vocab

    def test_infrequent_lowercase_word_is_not_promoted(self):
        vocabulary.update_vocabulary_from_context("proj-8", self._raw(content="budgeting is mentioned once", platform=""))
        vocab = vocabulary._load_vocab("proj-8")
        assert "budgeting" not in vocab

    def test_empty_context_processes_nothing(self):
        # platform="" (falsy) as well as empty title/content — the one case
        # with genuinely nothing to extract, not even the metadata term.
        n = vocabulary.update_vocabulary_from_context("proj-9", self._raw(platform=""))
        assert n == 0


class TestMergedVocabulary:
    def test_protected_dictionary_is_preserved(self):
        merged = vocabulary.get_merged_vocabulary("proj-10")
        assert merged["rag"] == "RAG"
        assert merged["fastapi"] == "FastAPI"

    def test_learned_terms_are_added(self):
        vocabulary.update_vocabulary_from_context(
            "proj-11", {"title": "Qdrant Setup", "platform": "chatgpt", "messages": []}
        )
        merged = vocabulary.get_merged_vocabulary("proj-11")
        assert merged.get("qdrant") == "Qdrant"

    def test_protected_terms_win_on_collision(self):
        vocab = vocabulary._load_vocab("proj-12")
        vocab["rag"] = vocabulary.VocabEntry()
        vocab["rag"].add("ragged", "content", "topic")
        merged = vocabulary.get_merged_vocabulary("proj-12")
        assert merged["rag"] == "RAG"

    def test_get_all_terms_includes_protected_and_learned(self):
        vocabulary.update_vocabulary_from_context(
            "proj-13", {"title": "Qdrant", "platform": "chatgpt", "messages": []}
        )
        canonicals = {t for t, _, _ in vocabulary.get_all_terms("proj-13")}
        assert "Qdrant" in canonicals
        assert "RAG" in canonicals  # protected terms always included

    def test_vocabulary_is_isolated_per_project(self):
        vocabulary.update_vocabulary_from_context(
            "proj-14a", {"title": "Zenith Tool", "platform": "chatgpt", "messages": []}
        )
        merged_a = vocabulary.get_merged_vocabulary("proj-14a")
        merged_b = vocabulary.get_merged_vocabulary("proj-14b")
        assert "zenith" in merged_a
        assert "zenith" not in merged_b


class TestCorrectAgainstVocabulary:
    def test_corrects_typo_against_merged_vocab(self):
        vocabulary.update_vocabulary_from_context(
            "proj-15", {"title": "Qdrant Setup", "platform": "chatgpt", "messages": []}
        )
        merged = vocabulary.get_merged_vocabulary("proj-15")
        assert vocabulary.correct_against_vocabulary("Qdrent", merged) == "Qdrant"

    def test_exact_matches_are_never_modified(self):
        vocabulary.update_vocabulary_from_context(
            "proj-16", {"title": "Qdrant Setup", "platform": "chatgpt", "messages": []}
        )
        merged = vocabulary.get_merged_vocabulary("proj-16")
        assert vocabulary.correct_against_vocabulary("Qdrant", merged) == "Qdrant"

    def test_unknown_words_are_not_touched(self):
        merged = vocabulary.get_merged_vocabulary("proj-17")
        assert vocabulary.correct_against_vocabulary("banana", merged) == "banana"


class TestMergeSplitVocabularyTerms:
    def test_merges_split_learned_term(self):
        vocabulary.update_vocabulary_from_context(
            "proj-18", {"title": "LangGraph Notes", "platform": "chatgpt",
                        "messages": [{"role": "user", "content": "Using LangGraph again"}]}
        )
        merged = vocabulary.get_merged_vocabulary("proj-18")
        result = vocabulary.merge_split_vocabulary_terms("Lang Grap", merged)
        corrected = vocabulary.correct_against_vocabulary(result, merged)
        assert corrected == "LangGraph"

    def test_leaves_unrelated_word_pairs_alone(self):
        merged = vocabulary.get_merged_vocabulary("proj-19")
        assert vocabulary.merge_split_vocabulary_terms("hello world", merged) == "hello world"
