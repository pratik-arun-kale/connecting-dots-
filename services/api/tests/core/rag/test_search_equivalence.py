"""
tests/core/rag/test_search_equivalence.py
──────────────────────────────────────────
Search and Ask AI give the same results with the index in Postgres as they
did with ChromaDB: the same ids in the same order, scores within 1e-5. The
baseline (fixtures/search_baseline.json) was recorded with ChromaDB, before
the switch; see search_equivalence.py.

Uses the real embedding model and reranker (downloaded on first use, about
100 MB), so it takes a minute. Needs pgvector, like every search index test.
"""

from __future__ import annotations

import json

import pytest

from app.core.settings import settings
from tests.core.rag import search_equivalence

pytestmark = pytest.mark.usefixtures("pgvector_db")


def test_search_and_ask_ai_match_the_chromadb_baseline(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openai_api_key", None)  # Ask AI's answer text isn't compared
    baseline = json.loads(search_equivalence.BASELINE.read_text(encoding="utf-8"))

    search_equivalence.index_corpus()
    now = search_equivalence.run_queries()

    problems = search_equivalence.compare(baseline, now, tol=1e-5)
    assert not problems, "\n".join(problems[:20])
