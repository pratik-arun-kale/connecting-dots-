"""
scripts/compare_query_understanding.py
──────────────────────────────────────────
Diagnostic-only script (not part of the application). Compares the OLD
regex/sentence-template-primary candidate generation against the NEW
topic-centric-primary candidate generation, both driving the real
search_conversations() retrieval pipeline (BM25 + vector + RRF + cross-encoder
rerank) against the live test project's captured conversations.

Run from the `Backend context-workspace` directory so `app` resolves and the
same .env/config the live server uses is picked up:
    python scripts/compare_query_understanding.py
"""
from __future__ import annotations

import json
import sys
from typing import Dict, List, Optional

sys.path.insert(0, ".")

from app.core.rag import pipeline
from app.core.rag import query_candidates as qc
from app.core.rag import query_normalizer as qn
from app.core.rag import vocabulary
from app.core.rag.query_candidates import QueryCandidate

PROJECT_ID = "630c2dc6-bac4-4f50-b1e1-1cf6c514b4ad"


def old_generate_query_candidates(query: str, project_id: Optional[str] = None) -> List[QueryCandidate]:
    """Reproduces pre-redesign candidate generation: everything EXCEPT the
    topic_centric step. Reuses the exact same underlying primitives
    (qn.*, vocabulary.*) that query_candidates.py itself calls, so this is a
    faithful reconstruction of "current implementation" before this session's
    change, not a reimplementation that could drift from it."""
    candidates: List[QueryCandidate] = []
    seen: dict = {}

    def _add(label: str, text: str, weight: float) -> None:
        text = text.strip()
        if not text:
            return
        existing_idx = seen.get(text)
        if existing_idx is None:
            seen[text] = len(candidates)
            candidates.append(QueryCandidate(label, text, weight))
        elif weight > candidates[existing_idx].weight:
            candidates[existing_idx] = QueryCandidate(label, text, weight)

    _add("original", query, 0.6)

    cleaned = qn._clean_whitespace_and_punctuation(query)
    cleaned = qn._collapse_repeated_letters(cleaned)
    cleaned = qn._merge_split_technical_terms(cleaned)
    _add("normalized", cleaned, 0.75)

    intent_ready = qn._fuzzy_correct_intent_words(cleaned)
    extracted_topic: Optional[str] = None
    for pattern in qn._CONVERSATION_SEARCH_PATTERNS:
        match = pattern.match(intent_ready)
        if match:
            topic = match.group(1).strip().strip("?.! ").strip()
            if topic:
                extracted_topic = topic
                break
    if extracted_topic:
        _add("extracted_topic", extracted_topic, 0.9)

    base_for_correction = extracted_topic if extracted_topic else cleaned
    spell_corrected = qn.correct_technical_terms(base_for_correction)
    _add("spell_corrected", spell_corrected, 1.0)

    if project_id:
        vocab_map = vocabulary.get_merged_vocabulary(project_id)
        vocab_ready = vocabulary.merge_split_vocabulary_terms(base_for_correction, vocab_map)
        vocab_corrected = vocabulary.correct_against_vocabulary(vocab_ready, vocab_map)
        _add("vocab_corrected", vocab_corrected, 1.0)

    return candidates


# ── Ground truth: 54 realistic queries (typos, missing grammar, casual wording) ──
RAG_TITLE = "RAG - RAG Chunking for Complex Data"
NVIDIA_TITLE = "NVIDIA Monopoly Explained"
VAULT_TITLE = "Context Vault Architecture with LangGraph"

QUERIES: List[Dict[str, str]] = [
    # RAG (18)
    {"q": "RAG", "expect": RAG_TITLE},
    {"q": "rag", "expect": RAG_TITLE},
    {"q": "Where did I discuss RAG", "expect": RAG_TITLE},
    {"q": "Where did I discussedddd RAG", "expect": RAG_TITLE},
    {"q": "where i disussed about rag", "expect": RAG_TITLE},
    {"q": "did we ever discuss rag", "expect": RAG_TITLE},
    {"q": "rag discussion", "expect": RAG_TITLE},
    {"q": "show rag chats", "expect": RAG_TITLE},
    {"q": "find rag conversation", "expect": RAG_TITLE},
    {"q": "remember rag", "expect": RAG_TITLE},
    {"q": "tell me the rag chat", "expect": RAG_TITLE},
    {"q": "search rag", "expect": RAG_TITLE},
    {"q": "wut about tht rag stuff", "expect": RAG_TITLE},
    {"q": "rag chunking", "expect": RAG_TITLE},
    {"q": "did we talk rag chunking", "expect": RAG_TITLE},
    {"q": "rag convo", "expect": RAG_TITLE},
    {"q": "lets see the rag one", "expect": RAG_TITLE},
    {"q": "any chat bout rag", "expect": RAG_TITLE},
    # NVIDIA (18)
    {"q": "NVIDIA", "expect": NVIDIA_TITLE},
    {"q": "nvidia", "expect": NVIDIA_TITLE},
    {"q": "Where did I discuss NVIDIA", "expect": NVIDIA_TITLE},
    {"q": "where i disussed about nvidia", "expect": NVIDIA_TITLE},
    {"q": "did we ever discuss nvidia", "expect": NVIDIA_TITLE},
    {"q": "nvidia discussion", "expect": NVIDIA_TITLE},
    {"q": "show nvidia chats", "expect": NVIDIA_TITLE},
    {"q": "find nvidia conversation", "expect": NVIDIA_TITLE},
    {"q": "remember nvidia", "expect": NVIDIA_TITLE},
    {"q": "tell me the nvidia chat", "expect": NVIDIA_TITLE},
    {"q": "search nvidia", "expect": NVIDIA_TITLE},
    {"q": "nvidai monopoly", "expect": NVIDIA_TITLE},
    {"q": "did we talk about nvidai", "expect": NVIDIA_TITLE},
    {"q": "nvidia monoply explained", "expect": NVIDIA_TITLE},
    {"q": "show me the nvidea chat", "expect": NVIDIA_TITLE},
    {"q": "any convo on nvidia", "expect": NVIDIA_TITLE},
    {"q": "wut about nvidia stuff", "expect": NVIDIA_TITLE},
    {"q": "lets see the nvidia one", "expect": NVIDIA_TITLE},
    # Context Vault / LangGraph (18)
    {"q": "context vault", "expect": VAULT_TITLE},
    {"q": "Context Vault", "expect": VAULT_TITLE},
    {"q": "Where did I discuss context vault", "expect": VAULT_TITLE},
    {"q": "where i disussed about context vault", "expect": VAULT_TITLE},
    {"q": "did we ever discuss langgraph", "expect": VAULT_TITLE},
    {"q": "langgraph discussion", "expect": VAULT_TITLE},
    {"q": "show context vault chats", "expect": VAULT_TITLE},
    {"q": "find langgraph conversation", "expect": VAULT_TITLE},
    {"q": "remember context vault", "expect": VAULT_TITLE},
    {"q": "tell me the langgraph chat", "expect": VAULT_TITLE},
    {"q": "search context vault", "expect": VAULT_TITLE},
    {"q": "contxt vault", "expect": VAULT_TITLE},
    {"q": "lang grap architecture", "expect": VAULT_TITLE},
    {"q": "did we talk about context vualt", "expect": VAULT_TITLE},
    {"q": "show me the langraph chat", "expect": VAULT_TITLE},
    {"q": "any convo on context vault", "expect": VAULT_TITLE},
    {"q": "wut about langgraph stuff", "expect": VAULT_TITLE},
    {"q": "lets see the context vault one", "expect": VAULT_TITLE},
]


def evaluate(label: str) -> Dict[str, object]:
    hits = 0
    precisions: List[float] = []
    recalls: List[float] = []
    rows: List[Dict[str, object]] = []

    for item in QUERIES:
        query, expected = item["q"], item["expect"]
        result = pipeline.search_conversations(PROJECT_ID, query)
        returned_titles = [c["title"] for c in result["conversations"]]
        correct = 1 if expected in returned_titles else 0
        total_returned = len(returned_titles)
        precision = (1 if correct else 0) / total_returned if total_returned else 0.0
        recall = 1.0 if correct else 0.0  # exactly 1 relevant doc per query

        hits += correct
        precisions.append(precision)
        recalls.append(recall)
        rows.append({
            "query": query,
            "expected": expected,
            "returned": returned_titles,
            "hit": bool(correct),
            "query_used": result["query_used"],
        })

    n = len(QUERIES)
    return {
        "label": label,
        "success_rate": hits / n,
        "precision": sum(precisions) / n,
        "recall": sum(recalls) / n,
        "rows": rows,
    }


def main() -> None:
    print(f"Running OLD system ({len(QUERIES)} queries)...", file=sys.stderr)
    pipeline.generate_query_candidates = old_generate_query_candidates
    old_results = evaluate("old (regex-primary)")

    print(f"Running NEW system ({len(QUERIES)} queries)...", file=sys.stderr)
    pipeline.generate_query_candidates = qc.generate_query_candidates
    new_results = evaluate("new (topic-centric-primary)")

    print(json.dumps({"old": old_results, "new": new_results}, indent=2))


if __name__ == "__main__":
    main()
