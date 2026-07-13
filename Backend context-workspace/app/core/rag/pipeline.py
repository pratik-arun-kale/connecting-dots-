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

from app.core.rag import embedder, vector_store
from app.core.rag.ollama_generator import generate_answer

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


# ── Conversation search (retrieval only — no answer generation) ─────────────

def search_conversations(
    project_id: str, query: str, top_k: int = 10
) -> Dict[str, Any]:
    """
    Find which captured conversations discussed a topic.

    Calls _retrieve() with its default arguments — i.e. the exact same candidate
    set (BM25 + vector + RRF fusion + cross-encoder reranking + corrective
    retrieval, same rerank_top_k) that run_query() (Ask AI) uses — then groups
    those chunk-level hits by their parent conversation (context_id) instead of
    generating an AI answer. Conversation Search never sees a chunk Ask AI
    wouldn't also have used as a source.

    Also applies the same LOW-confidence cutoff run_query() uses: when the
    reranker can't find anything actually relevant, every candidate's score is
    deeply negative noise (e.g. -10 to -11) rather than a real match, and
    without this gate they were being surfaced as if they were top hits.

    Groups over reranked[:3] — the exact same slice run_query()'s citations
    loop reads from — not the full reranked list. Even when overall confidence
    is HIGH, rank 4-5 of the reranked list can still be a much weaker, off-topic
    chunk from a different conversation (the reranker always fills every slot
    it's asked for); Ask AI never cites those, so Conversation Search shouldn't
    surface them as a "matching" conversation either.
    This function is CPU-bound and should be called via asyncio.to_thread().
    """
    retrieval = _retrieve(project_id, query)
    reranked = retrieval["reranked"][:3]

    if retrieval["chunks_indexed"] == 0 or retrieval["confidence"] == "LOW" or not reranked:
        return {
            "query_used": retrieval["query_used"],
            "corrective_triggered": retrieval["corrective_triggered"],
            "chunks_indexed": retrieval["chunks_indexed"],
            "total_conversations": 0,
            "conversations": [],
        }

    conversations: Dict[str, Dict[str, Any]] = {}
    for r in reranked:
        meta = r["metadata"]
        ctx_id = meta.get("context_id", "")
        if not ctx_id:
            continue
        score = r.get("reranker_score", 0.0)
        entry = conversations.get(ctx_id)
        if entry is None:
            entry = {
                "conversation_id": ctx_id,
                "title": meta.get("title", ""),
                "chat_url": meta.get("chat_url", ""),
                "provider": meta.get("platform", "unknown"),
                "relevance_score": score,
                "summary": None,  # no conversation-level summary exists today
                "_snippets": [],
            }
            conversations[ctx_id] = entry
        else:
            # Aggregate score across chunks belonging to the same conversation:
            # the conversation's relevance is its single best-matching chunk.
            entry["relevance_score"] = max(entry["relevance_score"], score)
        entry["_snippets"].append((score, r["text"][:400]))

    results: List[Dict[str, Any]] = []
    for entry in conversations.values():
        snippets_sorted = sorted(entry.pop("_snippets"), key=lambda s: s[0], reverse=True)
        entry["top_relevant_snippets"] = [text for _, text in snippets_sorted[:3]]
        results.append(entry)

    results.sort(key=lambda c: c["relevance_score"], reverse=True)

    return {
        "query_used": retrieval["query_used"],
        "corrective_triggered": retrieval["corrective_triggered"],
        "chunks_indexed": retrieval["chunks_indexed"],
        "total_conversations": len(results),
        "conversations": results[:top_k],
    }
