"""
tests/core/rag/test_vocabulary.py
────────────────────────────────────
Unit tests for the dynamic per-project vocabulary (Part 1): extraction,
storage (JSON file + in-memory cache), duplicate handling, and merging with
the protected technical-term dictionary. Storage is redirected to a temp
directory — no real project data, no model loads, no DB.
"""
from __future__ import annotations

import uuid

import pytest

from app.core.rag import vocabulary


@pytest.fixture(autouse=True)
def _isolated_vocab_storage(pgvector_db):
    """Vocabularies live in the test database's project_vocabulary table;
    pgvector_db empties it (and the in-memory cache) after each test."""
    yield


def _p(name: str) -> str:
    """A fixed project id (a UUID, like every real one) for a readable name."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"test-project:{name}"))


def _stored(project_id: str):
    """The project's vocabulary row as stored, or None."""
    from sqlalchemy import text

    from app.core.rag import index_db

    with index_db.engine().connect() as conn:
        return conn.execute(
            text("SELECT entries FROM project_vocabulary WHERE project_id = :p"), {"p": project_id}
        ).scalar_one_or_none()


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
            _p("proj-1"), self._raw(title="LangGraph Notes", content="Using LangGraph with Qdrant.")
        )
        vocab = vocabulary._load_vocab(_p("proj-1"))
        assert "langgraph" in vocab
        assert vocab["langgraph"].canonical == "LangGraph"

    def test_duplicate_mentions_increment_count_not_new_entries(self):
        vocabulary.update_vocabulary_from_context(
            _p("proj-2"), self._raw(content="LangGraph is great. I love LangGraph. LangGraph forever.", platform="")
        )
        vocab = vocabulary._load_vocab(_p("proj-2"))
        assert len(vocab) == 1  # one entry, not three — platform="" suppresses the metadata term
        assert vocab["langgraph"].count == 3

    def test_canonical_casing_is_majority_vote(self):
        # "Zenith" (not in the protected dictionary) so the entry is actually
        # learned rather than skipped as already-protected.
        vocabulary.update_vocabulary_from_context(_p("proj-3"), self._raw(content="Zenith Zenith Zenith", platform=""))
        vocabulary.update_vocabulary_from_context(_p("proj-3"), self._raw(content="zenith zenith", platform=""))
        vocab = vocabulary._load_vocab(_p("proj-3"))
        assert vocab["zenith"].canonical == "Zenith"

    def test_delete_vocabulary_forgets_row_and_cache(self):
        pid = _p("proj-del")
        vocabulary.update_vocabulary_from_context(pid, self._raw(content="Using LangGraph daily.", platform=""))
        assert _stored(pid) is not None

        vocabulary.delete_vocabulary(pid)

        assert _stored(pid) is None
        assert vocabulary._load_vocab(pid) == {}

    def test_a_vocabulary_survives_a_restart(self):
        """Stored in Postgres, not in this process: a fresh cache reads it back."""
        pid = _p("proj-restart")
        vocabulary.update_vocabulary_from_context(pid, self._raw(content="Using LangGraph daily.", platform=""))
        vocabulary.clear_cache()
        assert vocabulary._load_vocab(pid)["langgraph"].canonical == "LangGraph"

    def test_delete_vocabulary_of_unknown_project_is_a_no_op(self):
        vocabulary.delete_vocabulary(_p("never-learned-anything"))

    def test_protected_terms_are_not_relearned(self):
        vocabulary.update_vocabulary_from_context(_p("proj-4"), self._raw(title="RAG basics"))
        vocab = vocabulary._load_vocab(_p("proj-4"))
        assert "rag" not in vocab

    def test_persists_across_cache_clear(self):
        vocabulary.update_vocabulary_from_context(_p("proj-5"), self._raw(title="Qdrant Setup"))
        vocabulary._cache.clear()
        vocab = vocabulary._load_vocab(_p("proj-5"))
        assert "qdrant" in vocab

    def test_metadata_platform_is_recorded(self):
        # "gemini" isn't in the protected dictionary (unlike "claude"), so it's
        # actually learned rather than skipped.
        vocabulary.update_vocabulary_from_context(_p("proj-6"), self._raw(platform="gemini"))
        vocab = vocabulary._load_vocab(_p("proj-6"))
        assert "gemini" in vocab
        assert vocab["gemini"].kind == "metadata"

    def test_frequent_lowercase_word_is_promoted(self):
        content = "budgeting budgeting budgeting budgeting is important"
        vocabulary.update_vocabulary_from_context(_p("proj-7"), self._raw(content=content, platform=""))
        vocab = vocabulary._load_vocab(_p("proj-7"))
        assert "budgeting" in vocab

    def test_infrequent_lowercase_word_is_not_promoted(self):
        raw = self._raw(content="budgeting is mentioned once", platform="")
        vocabulary.update_vocabulary_from_context(_p("proj-8"), raw)
        vocab = vocabulary._load_vocab(_p("proj-8"))
        assert "budgeting" not in vocab

    def test_empty_context_processes_nothing(self):
        # platform="" (falsy) as well as empty title/content — the one case
        # with genuinely nothing to extract, not even the metadata term.
        n = vocabulary.update_vocabulary_from_context(_p("proj-9"), self._raw(platform=""))
        assert n == 0


class TestMergedVocabulary:
    def test_protected_dictionary_is_preserved(self):
        merged = vocabulary.get_merged_vocabulary(_p("proj-10"))
        assert merged["rag"] == "RAG"
        assert merged["fastapi"] == "FastAPI"

    def test_learned_terms_are_added(self):
        vocabulary.update_vocabulary_from_context(
            _p("proj-11"), {"title": "Qdrant Setup", "platform": "chatgpt", "messages": []}
        )
        merged = vocabulary.get_merged_vocabulary(_p("proj-11"))
        assert merged.get("qdrant") == "Qdrant"

    def test_protected_terms_win_on_collision(self):
        vocab = vocabulary._load_vocab(_p("proj-12"))
        vocab["rag"] = vocabulary.VocabEntry()
        vocab["rag"].add("ragged", "content", "topic")
        merged = vocabulary.get_merged_vocabulary(_p("proj-12"))
        assert merged["rag"] == "RAG"

    def test_get_all_terms_includes_protected_and_learned(self):
        vocabulary.update_vocabulary_from_context(
            _p("proj-13"), {"title": "Qdrant", "platform": "chatgpt", "messages": []}
        )
        canonicals = {t for t, _, _ in vocabulary.get_all_terms(_p("proj-13"))}
        assert "Qdrant" in canonicals
        assert "RAG" in canonicals  # protected terms always included

    def test_vocabulary_is_isolated_per_project(self):
        vocabulary.update_vocabulary_from_context(
            _p("proj-14a"), {"title": "Zenith Tool", "platform": "chatgpt", "messages": []}
        )
        merged_a = vocabulary.get_merged_vocabulary(_p("proj-14a"))
        merged_b = vocabulary.get_merged_vocabulary(_p("proj-14b"))
        assert "zenith" in merged_a
        assert "zenith" not in merged_b


class TestCorrectAgainstVocabulary:
    def test_corrects_typo_against_merged_vocab(self):
        vocabulary.update_vocabulary_from_context(
            _p("proj-15"), {"title": "Qdrant Setup", "platform": "chatgpt", "messages": []}
        )
        merged = vocabulary.get_merged_vocabulary(_p("proj-15"))
        assert vocabulary.correct_against_vocabulary("Qdrent", merged) == "Qdrant"

    def test_exact_matches_are_never_modified(self):
        vocabulary.update_vocabulary_from_context(
            _p("proj-16"), {"title": "Qdrant Setup", "platform": "chatgpt", "messages": []}
        )
        merged = vocabulary.get_merged_vocabulary(_p("proj-16"))
        assert vocabulary.correct_against_vocabulary("Qdrant", merged) == "Qdrant"

    def test_unknown_words_are_not_touched(self):
        merged = vocabulary.get_merged_vocabulary(_p("proj-17"))
        assert vocabulary.correct_against_vocabulary("banana", merged) == "banana"


class TestMergeSplitVocabularyTerms:
    def test_merges_split_learned_term(self):
        vocabulary.update_vocabulary_from_context(
            _p("proj-18"), {"title": "LangGraph Notes", "platform": "chatgpt",
                        "messages": [{"role": "user", "content": "Using LangGraph again"}]}
        )
        merged = vocabulary.get_merged_vocabulary(_p("proj-18"))
        result = vocabulary.merge_split_vocabulary_terms("Lang Grap", merged)
        corrected = vocabulary.correct_against_vocabulary(result, merged)
        assert corrected == "LangGraph"

    def test_leaves_unrelated_word_pairs_alone(self):
        merged = vocabulary.get_merged_vocabulary(_p("proj-19"))
        assert vocabulary.merge_split_vocabulary_terms("hello world", merged) == "hello world"
