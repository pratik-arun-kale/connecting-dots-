"""
app/core/rag/topic_extractor.py
───────────────────────────────────
Topic-centric query understanding (redesign of conversation-search intent
detection). Deterministic, no LLM.

THE PROBLEM WITH THE PREVIOUS APPROACH (query_normalizer._CONVERSATION_SEARCH_PATTERNS):
that extractor matches SENTENCE SHAPES — 3 regex templates for "aux+subject+
verb", "which chat contains X", and "imperative search command". Any phrasing
outside those 3 templates is invisible to it, regardless of how well individual
words get spell-corrected: fuzzy-correcting "disussed" -> "discussed" only
helps if the sentence still has the shape a template expects. "remember RAG",
"rag discussion", "tell me the rag chat" all mean the same thing as "where did
I discuss RAG" but use none of the 3 recognized shapes, so they fall straight
through with the full sentence unextracted (see the audit demonstration in the
conversation this module was introduced in — 7 of 8 non-template phrasings
failed to extract).

THE FIX: stop matching sentence shapes. Work at the word level instead —
tokenize, spell-correct every token, drop stop-words and intent-words, and
whatever tokens remain (in original order) ARE the topic. This has no
knowledge of grammar or word order, so it doesn't matter whether the topic
word appears after "discuss", after "remember", after "chat about", or with
no verb at all ("rag discussion") — none of that structure is inspected.

Pipeline:
  1. tokenize                (reuses query_normalizer._WORD_RE)
  2. lowercase                (for matching only — original casing is restored
                                on output via the vocabulary's canonical form)
  3. spell-correct each token (against intent/stop words AND the technical
                                vocabulary — protected + this project's learned
                                terms, reusing query_normalizer._closest_vocab_match)
  4. remove stop-words
  5. remove intent-words
  reconstruct whatever remains, in original order, as the topic.

The old regex-template extractor in query_normalizer.py is NOT removed — it
still runs as one of several candidates in query_candidates.py, so a query
that happens to fit a template still gets that extra signal. But this module
is now the PRIMARY mechanism: it's the highest-weighted candidate, and it's
the one used as the reranking query for the merged candidate pool.
"""
from __future__ import annotations

import re
from typing import Dict, Optional

from app.core.rag.query_normalizer import (
    _TECHNICAL_TERMS_LOWER,
    _WORD_RE,
    _closest_vocab_match,
)

# ── Generic English stop-words ────────────────────────────────────────────────
# Grammatical connective tissue — never carries topic meaning regardless of context.
_STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "to", "of", "in", "on", "at", "by", "for", "with", "from", "and", "or",
    "but", "if", "so", "that", "this", "these", "those", "it", "its", "as",
    "than", "then", "there", "here", "any", "some", "ever", "please", "can",
    "could", "would", "should", "will", "just", "stuff", "thing", "things",
    "one", "lets", "let", "see",
}

# ── Intent words (per spec) — carry SEARCH INTENT, not topic meaning ────────
# Expanded with obvious inflections of the spec's own list so "discussing",
# "talked", "conversations" etc. are recognized without needing new entries
# every time a verb tense shows up.
_INTENT_WORDS = {
    "where", "when", "which", "what", "who", "how",
    "did", "do", "does", "doing", "done",
    "have", "has", "had",
    "about", "regarding", "concerning",
    "chat", "chats", "conversation", "conversations", "convo", "convos",
    "discuss", "discussed", "discussion", "discussing", "discusses",
    "remember", "recall", "recalled",
    "show", "showed", "showing",
    "find", "found", "finding",
    "search", "searched", "searching",
    "look", "looked", "looking",
    "talk", "talked", "talking", "talks",
    "tell", "told", "telling",
    "mention", "mentioned", "mentions", "mentioning",
    "cover", "covered", "covering", "covers",
    "contain", "contains", "containing",
    "bring", "brought", "raise", "raised",
    "me", "my", "mine", "we", "us", "our", "ours",
    "i", "you", "your", "yours",
}

# Everything checked for removal after spell-correction.
_REMOVAL_VOCAB = _STOP_WORDS | _INTENT_WORDS
_REMOVAL_LOOKUP: Dict[str, str] = {w: w for w in _REMOVAL_VOCAB}


def _spell_correct_token(token: str, vocab_map: Optional[Dict[str, str]]) -> str:
    """
    Fuzzy-correct one token against two vocabularies:
      - the removal vocabulary (fixes typos of intent/stop words, e.g.
        "disussed" -> "discussed", so removal in step 4/5 still catches them)
      - the technical vocabulary, protected + this project's learned terms
        (fixes topic-word typos, e.g. "RAGG" -> "RAG")
    Deliberately canonicalizes on an EXACT technical-term match too (not just
    near-misses) — unlike query_normalizer.correct_technical_terms, which
    preserves a user's already-correct casing. Here the goal is a single
    consistent retrieval string across every phrasing of the same topic
    ("RAG" and "rag" must produce the identical topic string), so casing is
    always normalized to the vocabulary's canonical form for recognized terms.
    Tokens not close to anything known keep their original casing untouched.
    """
    lower = token.lower()
    if lower in _REMOVAL_VOCAB:
        return lower  # will be dropped in the removal step; casing doesn't matter

    intent_match = _closest_vocab_match(lower, _REMOVAL_LOOKUP)
    if intent_match:
        return intent_match

    if vocab_map:
        tech_match = _closest_vocab_match(token, vocab_map)
        if tech_match:
            return tech_match

    return token


def extract_topic(query: str, vocab_map: Optional[Dict[str, str]] = None) -> str:
    """
    Topic-centric extraction — the primary conversation-search query-
    understanding mechanism (see module docstring).

    `vocab_map` is the merged {lowercase: canonical} technical vocabulary
    (protected dictionary + this project's learned vocabulary — see
    vocabulary.get_merged_vocabulary). Pass None to use only the static
    protected dictionary (e.g. when no project context is available).

    Falls back to the spell-corrected token list (not empty string) if
    removal would strip everything — a query that's ALL intent words with no
    topic ("did we discuss") is better searched as-is than as nothing.
    """
    if vocab_map is None:
        vocab_map = dict(_TECHNICAL_TERMS_LOWER)

    tokens = _WORD_RE.findall(query)
    if not tokens:
        return query.strip()

    corrected = [_spell_correct_token(t, vocab_map) for t in tokens]
    kept = [t for t in corrected if t.lower() not in _REMOVAL_VOCAB]

    if not kept:
        kept = corrected

    return " ".join(kept)
