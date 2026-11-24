"""
tests/core/rag/test_search_logs.py
───────────────────────────────────
Conversation search logs how it ranked, never what someone searched for or
the titles of their conversations. Retrieval is stubbed: only the log events
around it are under test.
"""

from __future__ import annotations

import pytest
from structlog.testing import capture_logs

from app.core.rag import pipeline
from app.core.rag.query_candidates import QueryCandidate

QUERY = "zanzibar honeymoon budget"
TITLE = "Private trip planning with Alex"


def _retrieval(confidence: str, reranked: list[dict]) -> dict:
    return {
        "reranked": reranked,
        "query_used": QUERY,
        "confidence": confidence,
        "chunks_indexed": 3,
        "candidate_chunks": {"original": ["ch-1"]},
        "merged_chunk_count": 1,
    }


@pytest.fixture
def stub_candidates(monkeypatch):
    monkeypatch.setattr(
        pipeline,
        "generate_query_candidates",
        lambda query, project_id: [QueryCandidate(label="original", query=query, weight=1.0)],
    )


def _logged_text(events: list[dict]) -> str:
    return repr(events).lower()


def test_a_found_conversation_is_logged_by_id_and_score(monkeypatch, stub_candidates) -> None:
    chunk = {
        "chunk_id": "ch-1",
        "text": f"{QUERY} notes",
        "reranker_score": 4.2,
        "matched_by": ["original"],
        "metadata": {"context_id": "ctx-1", "title": TITLE, "platform": "chatgpt"},
    }
    monkeypatch.setattr(
        pipeline, "_retrieve_multi_candidate", lambda project_id, candidates: _retrieval("HIGH", [chunk])
    )

    with capture_logs() as events:
        result = pipeline.search_conversations("proj-1", QUERY)

    assert result["conversations"][0]["title"] == TITLE  # the response itself is unchanged
    traces = [e for e in events if e["event"].startswith("conversation_search_")]
    assert {e["event"] for e in traces} == {
        "conversation_search_candidates_trace",
        "conversation_search_retrieval_trace",
        "conversation_search_final_trace",
    }
    text = _logged_text(events)
    assert "zanzibar" not in text
    assert "alex" not in text
    final = next(e for e in traces if e["event"] == "conversation_search_final_trace")
    assert final["query_length"] == len(QUERY)
    assert final["final_conversations"][0]["conversation_id"] == "ctx-1"


def test_the_no_results_path_logs_no_query_either(monkeypatch, stub_candidates) -> None:
    monkeypatch.setattr(pipeline, "_retrieve_multi_candidate", lambda project_id, candidates: _retrieval("LOW", []))
    monkeypatch.setattr(
        pipeline,
        "_fuzzy_match_conversations_by_title",
        lambda project_id, topic: [{"conversation_id": "ctx-9", "title": TITLE, "relevance_score": 0.5}],
    )

    with capture_logs() as events:
        pipeline.search_conversations("proj-1", QUERY)

    text = _logged_text(events)
    assert "zanzibar" not in text
    assert "alex" not in text
