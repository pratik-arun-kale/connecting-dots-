"""
app/core/rag/suggestions.py
──────────────────────────────
"Did you mean?" suggestions for conversation search (Part 3) — used only when
retrieval (multi-candidate hybrid search, then the fuzzy-title fallback) still
finds nothing. No LLM: combines Levenshtein fuzzy matching against the merged
vocabulary (protected + learned, see vocabulary.py) and indexed conversation
titles, with semantic similarity via the existing embedding model + vector
store — reused exactly as the main retrieval pipeline uses them, not
reimplemented.
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.core.rag import embedder, vector_store, vocabulary
from app.core.rag.query_normalizer import _max_edit_distance, levenshtein_distance

MAX_TOPIC_SUGGESTIONS = 5
MAX_TECHNOLOGY_SUGGESTIONS = 5
MAX_TITLE_SUGGESTIONS = 5
# Term suggestions (closest_topics/closest_technologies) use NO extra slack
# beyond auto-correction's own edit-distance cutoff — short technology names
# ("Redis", "React") are close enough to each other in edit-distance space
# that any extra permissiveness produces confidently-wrong suggestions (e.g.
# "Reddis" -> "React" at slack=2, observed in testing). A term either looks
# like a typo of something known, or it doesn't.
TERM_SUGGESTION_SLACK = 0
# Titles are much longer strings, so a couple of extra edit-distance units
# matters far less relatively — kept permissive since a suggestion here is a
# whole conversation the user reviews, not a single-word claim.
TITLE_SUGGESTION_SLACK = 2
# vector_store.retrieve's score is 1/(1+cosine_distance) — below this floor
# the match is too weak to present as "related" (see vector_store.py).
SEMANTIC_SIMILARITY_FLOOR = 0.35


def _closest_terms(topic: str, project_id: str, kind: str, limit: int) -> List[str]:
    """Rank every known term of the given kind ('technology' or 'topic') by
    edit distance to `topic`, closest first, ties broken by frequency."""
    topic_lower = topic.lower()
    scored = []
    for canonical, count, term_kind in vocabulary.get_all_terms(project_id):
        if term_kind != kind or canonical.lower() == topic_lower:
            continue
        dist = levenshtein_distance(topic_lower, canonical.lower())
        if dist <= _max_edit_distance(canonical) + TERM_SUGGESTION_SLACK:
            scored.append((dist, -count, canonical))
    scored.sort()
    # De-dupe while preserving best-first order (same canonical can appear
    # once per kind already, but guard against case variants slipping through)
    ordered: List[str] = []
    seen_lower: set = set()
    for _, _, canonical in scored:
        if canonical.lower() not in seen_lower:
            seen_lower.add(canonical.lower())
            ordered.append(canonical)
        if len(ordered) >= limit:
            break
    return ordered


def _closest_titles(project_id: str, topic: str, limit: int) -> List[Dict[str, Any]]:
    """
    Fuzzy (lexical) title matching plus semantic similarity, reusing the exact
    embed_query + vector_store.retrieve calls the main pipeline already uses —
    no separate embedding infrastructure for suggestions.
    """
    all_chunks = vector_store.get_all_chunks(project_id)
    matches: Dict[str, Dict[str, Any]] = {}
    topic_lower = topic.lower()

    for chunk in all_chunks:
        meta = chunk["metadata"]
        title = meta.get("title", "")
        ctx_id = meta.get("context_id", "")
        if not title or not ctx_id or ctx_id in matches:
            continue
        words = title.lower().split()
        best = min((levenshtein_distance(topic_lower, w) for w in words), default=99)
        if best <= _max_edit_distance(topic_lower) + TITLE_SUGGESTION_SLACK:
            matches[ctx_id] = {"title": title, "conversation_id": ctx_id, "match_type": "fuzzy_title"}

    if len(matches) < limit and all_chunks:
        vec_results = vector_store.retrieve(project_id, embedder.embed_query(topic), top_k=limit)
        for r in vec_results:
            if r["score"] < SEMANTIC_SIMILARITY_FLOOR:
                continue
            meta = r["metadata"]
            ctx_id = meta.get("context_id", "")
            title = meta.get("title", "")
            if title and ctx_id and ctx_id not in matches:
                matches[ctx_id] = {"title": title, "conversation_id": ctx_id, "match_type": "semantic"}

    return list(matches.values())[:limit]


def generate_suggestions(project_id: str, topic: str) -> Dict[str, Any]:
    """
    Returns:
      {
        "closest_topics": [...],        # fuzzy vocab matches, kind="topic"
        "closest_technologies": [...],  # fuzzy vocab matches, kind="technology"
        "related_conversations": [{"title", "conversation_id", "match_type"}],
      }
    Called only when retrieval (multi-candidate hybrid search + the fuzzy-
    title fallback) found nothing — gives the user actionable next steps
    instead of a bare "no results" message. "closest_projects" (cross-project
    name matching) is layered in at the service/route layer instead of here,
    since it needs the Postgres project list, which this CPU-bound module
    deliberately has no async DB access to (kept sync, matching the rest of
    pipeline.py — see RagService.search_conversations for that layer).
    """
    return {
        "closest_topics": _closest_terms(topic, project_id, "topic", MAX_TOPIC_SUGGESTIONS),
        "closest_technologies": _closest_terms(topic, project_id, "technology", MAX_TECHNOLOGY_SUGGESTIONS),
        "related_conversations": _closest_titles(project_id, topic, MAX_TITLE_SUGGESTIONS),
    }
