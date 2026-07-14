"""
Full hybrid RAG query pipeline — runs synchronously (call via asyncio.to_thread).

Flow:
  question
    → query transform (typo/acronym/synonym)
    → BM25 retrieval   (rank-bm25, built fresh from all project chunks)
    → vector retrieval (ChromaDB cosine similarity)
    → RRF fusion
    → cross-encoder reranking
    → confidence grading (HIGH / MEDIUM / LOW)
    → corrective retrieval on LOW/MEDIUM  (synonym expansion or simplification)
    → answer assembly (top reranked chunk text)
    → citations
"""
from __future__ import annotations

import re
import threading
from typing import Any, Dict, List, Tuple

from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder

from app.core.logging import get_logger
from app.core.rag import embedder, vector_store
from app.core.rag.ollama_generator import generate_answer
from app.core.rag.query_candidates import QueryCandidate, generate_query_candidates
from app.core.rag.query_normalizer import _max_edit_distance, levenshtein_distance

logger = get_logger(__name__)

# ── Reranker singleton ─────────────────────────────────────────────────────────

_RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
_reranker_lock: threading.Lock = threading.Lock()
_reranker: CrossEncoder | None = None


def _get_reranker() -> CrossEncoder:
    global _reranker
    if _reranker is None:
        with _reranker_lock:
            if _reranker is None:
                _reranker = CrossEncoder(_RERANKER_MODEL)
    return _reranker


# ── Tokenisation ───────────────────────────────────────────────────────────────

def _tokenize(text: str) -> List[str]:
    return [t for t in re.findall(r"\b\w+\b", text.lower()) if len(t) > 1]


# ── BM25 retrieval ─────────────────────────────────────────────────────────────

def _bm25_retrieve(chunks: List[Dict], query: str, top_k: int = 10) -> List[Dict]:
    if not chunks:
        return []
    tokenized_docs = [_tokenize(c["text"]) for c in chunks]
    bm25 = BM25Okapi(tokenized_docs)
    scores = bm25.get_scores(_tokenize(query))
    ranked = sorted(
        [
            {
                "chunk_id": c["chunk_id"],
                "score": float(s),
                "rank": 0,
                "text": c["text"],
                "metadata": c["metadata"],
            }
            for c, s in zip(chunks, scores)
        ],
        key=lambda x: x["score"],
        reverse=True,
    )[:top_k]
    for i, r in enumerate(ranked, 1):
        r["rank"] = i
    return ranked


# ── Reciprocal Rank Fusion ────────────────────────────────────────────────────

def _rrf(
    bm25_results: List[Dict],
    vector_results: List[Dict],
    top_k: int = 20,
    k: int = 60,
) -> List[Dict]:
    scores: Dict[str, Dict] = {}
    for r in bm25_results:
        cid = r["chunk_id"]
        scores.setdefault(
            cid,
            {
                "chunk_id": cid,
                "text": r["text"],
                "metadata": r["metadata"],
                "bm25_rank": r["rank"],
                "vector_rank": None,
                "rrf_score": 0.0,
            },
        )
        scores[cid]["rrf_score"] += 1.0 / (k + r["rank"])

    for r in vector_results:
        cid = r["chunk_id"]
        e = scores.setdefault(
            cid,
            {
                "chunk_id": cid,
                "text": r["text"],
                "metadata": r["metadata"],
                "bm25_rank": None,
                "vector_rank": r["rank"],
                "rrf_score": 0.0,
            },
        )
        e["vector_rank"] = r["rank"]
        e["rrf_score"] += 1.0 / (k + r["rank"])

    fused = sorted(scores.values(), key=lambda x: x["rrf_score"], reverse=True)[:top_k]
    for i, f in enumerate(fused, 1):
        f["fused_rank"] = i
    return fused


# ── Cross-encoder reranking ───────────────────────────────────────────────────

def _rerank(query: str, candidates: List[Dict], top_k: int = 5) -> List[Dict]:
    if not candidates:
        return []
    reranker = _get_reranker()
    pairs = [(query, c["text"]) for c in candidates]
    scores = reranker.predict(pairs)
    ranked = sorted(
        [{**c, "reranker_score": float(s)} for c, s in zip(candidates, scores)],
        key=lambda x: x["reranker_score"],
        reverse=True,
    )[:top_k]
    for i, r in enumerate(ranked, 1):
        r["reranked_rank"] = i
    return ranked


# ── Confidence grading ────────────────────────────────────────────────────────

def _grade(reranked: List[Dict]) -> Tuple[float, str, bool]:
    """Returns (top_score, confidence_level, needs_corrective_retrieval)."""
    if not reranked:
        return 0.0, "LOW", True

    top = reranked[0].get("reranker_score", 0.0)
    second = reranked[1].get("reranker_score", -999.0) if len(reranked) > 1 else -999.0
    margin = top - second
    bm25_rank: int = reranked[0].get("bm25_rank") or 999
    vector_rank: int = reranked[0].get("vector_rank") or 999

    if top > 2.0 and margin > 5.0:
        confidence = "HIGH"
    elif top > 0.0:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    # Upgrade: MEDIUM → HIGH when both retrieval methods agree
    if confidence == "MEDIUM" and bm25_rank <= 10 and vector_rank <= 10 and top > 1.0:
        confidence = "HIGH"
    # Downgrade: HIGH → MEDIUM when neither method retrieved it directly
    elif confidence == "HIGH" and bm25_rank > 10 and vector_rank > 10:
        confidence = "MEDIUM"

    # Corrective retrieval is warranted when top result is below threshold or ambiguous
    needs_corrective = confidence != "HIGH" and (top < 0.0 or margin < 1.0)
    return top, confidence, needs_corrective


# ── Query transformation (lightweight, no LLM) ───────────────────────────────

_SYNONYM_MAP: Dict[str, List[str]] = {
    "remote": ["telework", "work from home", "distributed"],
    "expense": ["reimbursement", "spending", "cost"],
    "leave": ["vacation", "time off", "absence", "holiday"],
    "security": ["safety", "compliance", "risk"],
    "approval": ["authorization", "permission", "sign-off"],
}

_STOP_WORDS = {
    "is", "are", "was", "were", "be", "been", "the", "a", "an",
    "how", "what", "when", "where", "why", "which", "who",
    "does", "do", "did", "for", "to", "of", "in", "at", "by",
    "on", "with", "from", "this", "that",
}


def _expand_query(query: str) -> str:
    tokens = re.findall(r"\b\w+\b", query.lower())
    extra: List[str] = []
    for t in tokens:
        if t in _SYNONYM_MAP:
            extra.extend(_SYNONYM_MAP[t])
    return (query + " " + " ".join(extra)).strip() if extra else query


def _simplify_query(query: str) -> str:
    tokens = re.findall(r"\b\w+\b", query.lower())
    return " ".join(t for t in tokens if t not in _STOP_WORDS and len(t) > 2)


# ── Shared retrieval core ─────────────────────────────────────────────────────
# BM25 + vector + RRF fusion + cross-encoder reranking + corrective retrieval.
# Used by both run_query() (QA, generates an answer) and search_conversations()
# (conversation search, no answer generation) so this logic is defined once.

def _retrieve(
    project_id: str, question: str, rerank_top_k: int = 5
) -> Dict[str, Any]:
    """
    Run the full hybrid retrieval pipeline against a project's captured contexts.
    This function is CPU-bound and should be called via asyncio.to_thread().
    """
    all_chunks = vector_store.get_all_chunks(project_id)
    if not all_chunks:
        return {
            "reranked": [],
            "confidence": "LOW",
            "query_used": question,
            "corrective_triggered": False,
            "top_reranker_score": 0.0,
            "chunks_indexed": 0,
        }

    def _full_retrieval(q: str) -> Tuple[List, List, List, List]:
        bm25_r = _bm25_retrieve(all_chunks, q)
        vec_r = vector_store.retrieve(project_id, embedder.embed_query(q))
        fused = _rrf(bm25_r, vec_r)
        reranked = _rerank(q, fused, top_k=rerank_top_k)
        return bm25_r, vec_r, fused, reranked

    bm25_results, vector_results, fused, reranked = _full_retrieval(question)
    top_score, confidence, needs_corrective = _grade(reranked)
    query_used = question
    corrective_triggered = False

    # Corrective retrieval — try synonym expansion then simplification
    if needs_corrective:
        for strategy_fn in (_expand_query, _simplify_query):
            alt_q = strategy_fn(question)
            if not alt_q.strip() or alt_q.strip() == question.strip():
                continue
            _, _, _, alt_reranked = _full_retrieval(alt_q)
            alt_score, alt_conf, _ = _grade(alt_reranked)
            if alt_score > top_score:
                reranked = alt_reranked
                top_score = alt_score
                confidence = alt_conf
                query_used = alt_q
                corrective_triggered = True
                break

    return {
        "reranked": reranked,
        "confidence": confidence,
        "query_used": query_used,
        "corrective_triggered": corrective_triggered,
        "top_reranker_score": float(top_score),
        "chunks_indexed": len(all_chunks),
    }


# ── Multi-candidate retrieval (Part 2 — used only by search_conversations) ──
# Fans a query out into several reformulations (see query_candidates.py),
# runs BM25 + vector + RRF fusion for EACH one, merges + dedupes the fused
# chunk pools by chunk_id, then reranks the merged pool exactly ONCE. This
# reuses the exact same low-level primitives _retrieve() itself calls
# (_bm25_retrieve, vector_store.retrieve, _rrf, _rerank, _grade) — it does not
# reimplement retrieval, it just orchestrates those primitives differently:
# fan-out-then-merge instead of one-query-in-one-query-out. Calling _retrieve()
# N times would rerank N times, which the task explicitly says not to do
# ("Run the reranker once on the merged candidates").

def _retrieve_multi_candidate(
    project_id: str, candidates: List[QueryCandidate], rerank_top_k: int = 8
) -> Dict[str, Any]:
    all_chunks = vector_store.get_all_chunks(project_id)
    if not all_chunks or not candidates:
        return {
            "reranked": [],
            "confidence": "LOW",
            "query_used": candidates[-1].query if candidates else "",
            "top_reranker_score": 0.0,
            "chunks_indexed": len(all_chunks),
            "candidate_chunks": {},
            "merged_chunk_count": 0,
        }

    candidate_chunks: Dict[str, List[str]] = {}
    merged: Dict[str, Dict[str, Any]] = {}  # chunk_id -> fused entry + candidate_weight/matched_by

    for cand in candidates:
        bm25_r = _bm25_retrieve(all_chunks, cand.query)
        vec_r = vector_store.retrieve(project_id, embedder.embed_query(cand.query))
        fused = _rrf(bm25_r, vec_r)
        candidate_chunks[cand.label] = [f["chunk_id"] for f in fused]

        for f in fused:
            cid = f["chunk_id"]
            existing = merged.get(cid)
            if existing is None:
                entry = dict(f)
                entry["candidate_weight"] = cand.weight
                entry["matched_by"] = [cand.label]
                merged[cid] = entry
            else:
                existing["matched_by"].append(cand.label)
                existing["candidate_weight"] = max(existing["candidate_weight"], cand.weight)
                if f["rrf_score"] > existing["rrf_score"]:
                    existing["rrf_score"] = f["rrf_score"]
                    existing["bm25_rank"] = f["bm25_rank"] if f["bm25_rank"] is not None else existing["bm25_rank"]
                    existing["vector_rank"] = f["vector_rank"] if f["vector_rank"] is not None else existing["vector_rank"]

    merged_list = sorted(merged.values(), key=lambda x: x["rrf_score"], reverse=True)[:20]

    # Rerank once, using the highest-weighted candidate as the query text —
    # the closest available proxy for "what the user actually meant". Not
    # just candidates[-1]: query_candidates dedupes identical strings in
    # place (updating the existing entry's weight/label rather than moving it
    # to the end), so the highest-weight candidate isn't guaranteed to be
    # positionally last. Ties prefer the LAST-added of the tied candidates
    # (the `>=` below), which is the more-refined one by construction.
    primary_candidate = candidates[0]
    for c in candidates:
        if c.weight >= primary_candidate.weight:
            primary_candidate = c
    primary_query = primary_candidate.query
    reranked = _rerank(primary_query, merged_list, top_k=rerank_top_k)
    top_score, confidence, _ = _grade(reranked)

    return {
        "reranked": reranked,
        "confidence": confidence,
        "query_used": primary_query,
        "top_reranker_score": float(top_score),
        "chunks_indexed": len(all_chunks),
        "candidate_chunks": candidate_chunks,
        "merged_chunk_count": len(merged_list),
    }


# ── Main pipeline (QA — generates an answer) ─────────────────────────────────

def run_query(project_id: str, question: str) -> Dict[str, Any]:
    """
    Run the full hybrid RAG pipeline against a project's captured contexts.
    This function is CPU-bound and should be called via asyncio.to_thread().
    """
    retrieval = _retrieve(project_id, question, rerank_top_k=5)

    if retrieval["chunks_indexed"] == 0:
        return {
            "answer": (
                "No context has been captured for this project yet. "
                "Open ChatGPT, Claude, Gemini, or Perplexity in your browser and click "
                "'Capture Context' in the extension popup first."
            ),
            "confidence": "LOW",
            "citations": [],
            "query_used": question,
            "corrective_triggered": False,
            "top_reranker_score": 0.0,
            "chunks_indexed": 0,
        }

    reranked = retrieval["reranked"]
    confidence = retrieval["confidence"]

    # Generate answer — Ollama LLM for HIGH/MEDIUM, static message for LOW
    if confidence == "LOW" or not reranked:
        answer_text = (
            "I couldn't find sufficiently relevant information in your captured conversations. "
            "Try capturing more context or rephrasing your question."
        )
        citations: List[Dict] = []
    else:
        answer_text = generate_answer(question, reranked)
        seen_ctx: set = set()
        citations = []
        for r in reranked[:3]:
            ctx_id = r["metadata"].get("context_id", "")
            if ctx_id and ctx_id not in seen_ctx:
                seen_ctx.add(ctx_id)
                citations.append(
                    {
                        "context_id": ctx_id,
                        "chunk_id": r["chunk_id"],
                        "platform": r["metadata"].get("platform", "unknown"),
                        "title": r["metadata"].get("title", ""),
                        "chat_url": r["metadata"].get("chat_url", ""),
                        "excerpt": r["text"][:400],
                        "reranker_score": r.get("reranker_score", 0.0),
                    }
                )

    return {
        "answer": answer_text,
        "confidence": confidence,
        "citations": citations,
        "query_used": retrieval["query_used"],
        "corrective_triggered": retrieval["corrective_triggered"],
        "top_reranker_score": retrieval["top_reranker_score"],
        "chunks_indexed": retrieval["chunks_indexed"],
    }


# ── Conversation search: fuzzy title fallback (Phase 3) ──────────────────────

def _fuzzy_match_conversations_by_title(project_id: str, topic: str) -> List[Dict[str, Any]]:
    """
    Last-resort fallback for when the normalized query still comes back with
    LOW confidence from the hybrid pipeline (a genuinely novel typo the
    correction step in query_normalizer didn't recognize). Fuzzy-matches the
    topic word-by-word against every indexed conversation's title using the
    same Levenshtein distance as query normalization — titles are cheap to
    scan (one per conversation, already present in chunk metadata) so this
    doesn't need its own index or embedding call.
    """
    all_chunks = vector_store.get_all_chunks(project_id)
    seen: Dict[str, Dict[str, Any]] = {}
    topic_lower = topic.lower()
    max_dist = _max_edit_distance(topic_lower)

    for chunk in all_chunks:
        meta = chunk["metadata"]
        ctx_id = meta.get("context_id", "")
        if not ctx_id or ctx_id in seen:
            continue
        title_words = re.findall(r"[A-Za-z0-9]+", meta.get("title", "").lower())
        if not title_words:
            continue
        best_dist = min(levenshtein_distance(topic_lower, w) for w in title_words)
        if best_dist <= max_dist:
            seen[ctx_id] = {
                "conversation_id": ctx_id,
                "title": meta.get("title", ""),
                "chat_url": meta.get("chat_url", ""),
                "provider": meta.get("platform", "unknown"),
                # Fixed score, not reranker-comparable — flags this as a
                # title-fuzzy-match result rather than a real retrieval score.
                "relevance_score": 0.5,
                "summary": None,
                "top_relevant_snippets": [chunk["text"][:400]],
            }
    return list(seen.values())


# ── Conversation search (retrieval only — no answer generation) ─────────────

def _title_match_bonus(topic: str, title: str) -> float:
    """Part 4 scoring factor. A conversation whose TITLE contains the topic is
    about that topic with near-certainty — a much stronger signal than any
    single chunk's semantic similarity, so this is the largest bonus. Exact
    substring match scores higher than a fuzzy word match (typo'd titles are
    rarer and less certain)."""
    if not title or not topic:
        return 0.0
    topic_lower, title_lower = topic.lower(), title.lower()
    if topic_lower in title_lower:
        return 1.5
    title_words = re.findall(r"[A-Za-z0-9]+", title_lower)
    if any(levenshtein_distance(topic_lower, w) <= _max_edit_distance(topic_lower) for w in title_words):
        return 0.75
    return 0.0


def _metadata_match_bonus(topic: str, meta: Dict[str, Any]) -> float:
    """Part 4 scoring factor. Small reward when the topic matches structured
    metadata (platform) rather than just free text — a real but much weaker
    signal than a title match, hence the smaller, capped bonus."""
    topic_lower = topic.lower()
    platform = str(meta.get("platform", "")).lower()
    if platform and (topic_lower == platform or topic_lower in platform):
        return 0.3
    return 0.0


def _chunk_count_bonus(num_chunks: int) -> float:
    """Part 4 scoring factor. Small, capped reward for multiple independent
    matching chunks (possibly found via different candidates) corroborating
    the same conversation. Capped and diminishing so one conversation with
    many mediocre chunks still can't out-rank a single excellent match
    elsewhere — this only breaks ties, it never dominates the reranker score."""
    return min(0.05 * max(num_chunks - 1, 0), 0.3)


def _filter_positive_chunks(reranked: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Widening to top-5 (vs run_query's top-3) gives multi-candidate retrieval
    room to surface more than one genuinely distinct conversation — but rank
    4-5 can still be a much weaker, unrelated conversation's chunk that only
    made the merged pool because *some* candidate query pulled it in. A
    reranker_score <= 0 means the cross-encoder judged it irrelevant to the
    query it was scored against, so it's noise, not a real match — drop it
    before grouping rather than let it show up as a false-positive result
    with a visibly negative score.
    """
    return [r for r in reranked if r.get("reranker_score", 0.0) > 0]


def search_conversations(
    project_id: str, query: str, top_k: int = 10
) -> Dict[str, Any]:
    """
    Find which captured conversations discussed a topic — multi-candidate
    hybrid retrieval (Part 2: several reformulations of the query are each
    retrieved via the same BM25+vector+RRF primitives _retrieve() itself uses,
    merged, deduped, and reranked exactly once), scored with reranker score +
    title/metadata/chunk-count bonuses (Part 4), with a fuzzy-title fallback
    and "did you mean" suggestions (Part 3) when nothing is found.

    Full stage trace is logged at every step: original query -> candidate
    queries -> retrieved chunks per candidate -> merged chunks -> final
    conversations (search structlog for "conversation_search_*_trace").

    Ask AI (run_query) is untouched — it still calls the single-query
    _retrieve() exactly as before. This multi-candidate path is exclusive to
    conversation search, so nothing here can affect Ask AI's behavior.
    This function is CPU-bound and should be called via asyncio.to_thread().
    """
    candidates = generate_query_candidates(query, project_id)
    logger.info(
        "conversation_search_candidates_trace",
        original_query=query,
        candidates=[{"label": c.label, "query": c.query, "weight": c.weight} for c in candidates],
    )

    retrieval = _retrieve_multi_candidate(project_id, candidates)
    reranked = _filter_positive_chunks(retrieval["reranked"][:5])
    normalized_query = retrieval["query_used"]  # most-corrected candidate — used for fallback/suggestions/bonuses
    logger.info(
        "conversation_search_retrieval_trace",
        retrieval_query=retrieval["query_used"],
        confidence=retrieval["confidence"],
        chunks_indexed=retrieval["chunks_indexed"],
        candidate_chunks=retrieval.get("candidate_chunks", {}),
        merged_chunk_count=retrieval.get("merged_chunk_count", 0),
        retrieved_chunks=[
            {
                "chunk_id": r["chunk_id"],
                "context_id": r["metadata"].get("context_id", ""),
                "title": r["metadata"].get("title", ""),
                "reranker_score": r.get("reranker_score", 0.0),
                "matched_by": r.get("matched_by", []),
            }
            for r in reranked
        ],
    )

    if retrieval["chunks_indexed"] == 0 or retrieval["confidence"] == "LOW" or not reranked:
        fuzzy_matches: List[Dict[str, Any]] = []
        if retrieval["chunks_indexed"] > 0:
            fuzzy_matches = _fuzzy_match_conversations_by_title(project_id, normalized_query)

        suggestions_payload: Dict[str, Any] | None = None
        if not fuzzy_matches and retrieval["chunks_indexed"] > 0:
            from app.core.rag import suggestions as suggestions_module  # lazy: only needed on the rare no-results path

            suggestions_payload = suggestions_module.generate_suggestions(project_id, normalized_query)

        logger.info(
            "conversation_search_final_trace",
            original_query=query,
            normalized_query=normalized_query,
            fuzzy_title_fallback_used=bool(fuzzy_matches),
            suggestions_generated=suggestions_payload is not None,
            final_conversations=[
                {"title": c["title"], "relevance_score": c["relevance_score"]} for c in fuzzy_matches
            ],
        )
        return {
            "query_used": retrieval["query_used"],
            "corrective_triggered": False,
            "chunks_indexed": retrieval["chunks_indexed"],
            "total_conversations": len(fuzzy_matches),
            "conversations": fuzzy_matches[:top_k],
            "candidate_queries": [{"label": c.label, "query": c.query, "weight": c.weight} for c in candidates],
            "suggestions": suggestions_payload,
        }

    conversations: Dict[str, Dict[str, Any]] = {}
    for r in reranked:
        meta = r["metadata"]
        ctx_id = meta.get("context_id", "")
        if not ctx_id:
            continue
        # Part 4 scoring: reranker score scaled by which candidate(s) found this
        # chunk — a chunk only the noisy "original" candidate surfaced is
        # discounted relative to one the clean "spell_corrected" candidate confirmed.
        candidate_weight = r.get("candidate_weight", 1.0)
        chunk_score = r.get("reranker_score", 0.0) * candidate_weight
        entry = conversations.get(ctx_id)
        if entry is None:
            entry = {
                "conversation_id": ctx_id,
                "title": meta.get("title", ""),
                "chat_url": meta.get("chat_url", ""),
                "provider": meta.get("platform", "unknown"),
                "relevance_score": chunk_score,
                "summary": None,  # no conversation-level summary exists today
                "_snippets": [],
                "_meta": meta,
            }
            conversations[ctx_id] = entry
        else:
            # Aggregate score across chunks belonging to the same conversation:
            # the conversation's relevance is its single best-matching chunk.
            entry["relevance_score"] = max(entry["relevance_score"], chunk_score)
        entry["_snippets"].append((chunk_score, r["text"][:400]))

    results: List[Dict[str, Any]] = []
    for entry in conversations.values():
        snippets_sorted = sorted(entry.pop("_snippets"), key=lambda s: s[0], reverse=True)
        entry["top_relevant_snippets"] = [text for _, text in snippets_sorted[:3]]
        meta = entry.pop("_meta")
        entry["relevance_score"] += (
            _title_match_bonus(normalized_query, entry["title"])
            + _metadata_match_bonus(normalized_query, meta)
            + _chunk_count_bonus(len(snippets_sorted))
        )
        results.append(entry)

    results.sort(key=lambda c: c["relevance_score"], reverse=True)

    logger.info(
        "conversation_search_final_trace",
        original_query=query,
        normalized_query=normalized_query,
        final_conversations=[
            {"title": c["title"], "relevance_score": c["relevance_score"]} for c in results[:top_k]
        ],
    )

    return {
        "query_used": retrieval["query_used"],
        "corrective_triggered": False,
        "chunks_indexed": retrieval["chunks_indexed"],
        "total_conversations": len(results),
        "conversations": results[:top_k],
        "candidate_queries": [{"label": c.label, "query": c.query, "weight": c.weight} for c in candidates],
        "suggestions": None,
    }
