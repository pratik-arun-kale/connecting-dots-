"""
app/core/rag/query_candidates.py
───────────────────────────────────
Multi-candidate query generation for conversation search (Part 2, extended
with topic-centric extraction). This module does NOT reimplement any
normalization logic — it orchestrates existing helpers from
query_normalizer.py, topic_extractor.py, and vocabulary.py into an ordered
list of retrieval candidates instead of collapsing straight to one final
string.

PRIMARY vs FALLBACK: topic_extractor.extract_topic() (word-level: tokenize,
spell-correct, strip stop/intent words) is now the primary query-understanding
mechanism — it doesn't care about sentence shape, so it handles any phrasing.
The old query_normalizer sentence-template regexes (_CONVERSATION_SEARCH_PATTERNS)
are kept as an additional candidate, not removed — see that module's docstring
for why they alone aren't enough (they only recognize 3 fixed template shapes).
"""
from __future__ import annotations

from typing import List, NamedTuple, Optional

from app.core.rag import query_normalizer as qn
from app.core.rag import vocabulary
from app.core.rag.topic_extractor import extract_topic


class QueryCandidate(NamedTuple):
    label: str
    query: str
    weight: float  # candidate-query-weight factor used in final scoring (Part 4)


def generate_query_candidates(
    query: str, project_id: Optional[str] = None
) -> List[QueryCandidate]:
    """
    Build an ordered set of retrieval candidates for one user query:

      1. original           (0.6)  — exactly what the user typed
      2. normalized          (0.75) — whitespace/punctuation/letter-collapse
                                      cleanup only, no extraction yet
      3. extracted_topic      (0.9)  — FALLBACK: old sentence-template regex
                                      extraction (query_normalizer), only added
                                      if one of the 3 templates actually matched
      4. spell_corrected       (1.0)  — FALLBACK path's spelling correction
                                      against the protected dictionary
      5. vocab_corrected        (1.0)  — same, against this project's learned
                                      vocabulary too (only with project_id)
      6. topic_centric           (1.1)  — PRIMARY: word-level tokenize / spell-
                                      correct / stop-word+intent-word removal
                                      (topic_extractor.extract_topic). Works
                                      regardless of sentence shape, so it's the
                                      highest-weighted candidate and — because
                                      it's appended last — the one used as the
                                      reranking query for the merged pool.

    Duplicate candidate strings are deduped (case-sensitive); on a duplicate,
    both the label AND weight are updated to the higher-weighted source, so
    the trace reflects which mechanism actually earned the confidence and an
    already-clean query isn't discounted just because a low-weight stage
    happened to produce the same string first.
    """
    candidates: List[QueryCandidate] = []
    seen: dict = {}  # query string -> index into `candidates`

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

    # ── Fallback: old sentence-template regex extraction ────────────────────
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

    vocab_map: Optional[dict] = None
    if project_id:
        vocab_map = vocabulary.get_merged_vocabulary(project_id)
        vocab_ready = vocabulary.merge_split_vocabulary_terms(base_for_correction, vocab_map)
        vocab_corrected = vocabulary.correct_against_vocabulary(vocab_ready, vocab_map)
        _add("vocab_corrected", vocab_corrected, 1.0)

    # ── Primary: topic-centric, sentence-shape-agnostic extraction ──────────
    topic_centric = extract_topic(cleaned, vocab_map)
    _add("topic_centric", topic_centric, 1.1)

    return candidates
