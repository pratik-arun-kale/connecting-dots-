"""
app/core/rag/vocabulary.py
─────────────────────────────
Dynamic, per-project vocabulary learned automatically from indexed
conversations — merged with the static protected technical-term dictionary
in query_normalizer.py (that dictionary is never modified or removed; this
module only adds to it). Used by:
  - query_candidates.py  (candidate 5: fuzzy-correct against learned vocab)
  - suggestions.py        ("did you mean" topic/technology suggestions)

Storage: one JSON file per project under data/vocabulary/{project_id}.json —
the same on-disk convention vector_store.py already uses for ChromaDB
(data/chromadb/), loaded lazily and cached in-memory per project_id so
repeated searches never hit disk twice for the same project.

Update trigger: called from RagService._index_sync() immediately after
chunking, once per captured context — see the "how it is updated" note in
extract_terms_from_context()'s docstring.
"""
from __future__ import annotations

import json
import re
import threading
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Tuple

from app.core.logging import get_logger
from app.core.rag.query_normalizer import (
    _TECHNICAL_TERMS_LOWER,
    _WORD_RE,
    _closest_vocab_match,
    _max_edit_distance,
)

logger = get_logger(__name__)

# Stored at Backend context-workspace/data/vocabulary/ — mirrors vector_store.py's
# CHROMA_DIR convention (parents[3] = Backend context-workspace/).
VOCAB_DIR = Path(__file__).resolve().parents[3] / "data" / "vocabulary"

# A learned term needs at least this many occurrences before it's trusted
# enough to use as an auto-CORRECTION target (candidate 5). Kept at 1 (i.e.
# every extracted term is immediately trusted) because the confidence signal
# here is the EXTRACTION PATTERN, not frequency — CamelCase/ALLCAPS/TitleCase-
# phrase/mid-sentence-proper-noun are already conservative enough that a
# single occurrence is meaningful. Plain lowercase "frequent word" promotion
# has its own separate, stricter gate (FREQUENT_WORD_THRESHOLD) applied at
# extraction time — this constant exists as a single tuning knob if the
# pattern-based extractors ever turn out too noisy in practice.
MIN_OCCURRENCES_FOR_CORRECTION = 1

# Frequency threshold for promoting a lowercase, non-capitalized word to
# vocabulary status purely from repetition ("frequently occurring important
# words" per the spec) — capitalized/CamelCase/ALLCAPS words are promoted
# immediately regardless of count since casing itself is a strong signal.
FREQUENT_WORD_THRESHOLD = 4

_STOPWORDS = {
    "the", "and", "for", "are", "but", "not", "you", "your", "with", "this",
    "that", "have", "has", "was", "were", "will", "can", "could", "should",
    "would", "from", "they", "them", "their", "what", "when", "where",
    "which", "who", "how", "why", "then", "than", "into", "over", "also",
    "just", "like", "some", "more", "most", "such", "only", "very", "each",
    "about", "these", "those", "here", "there", "been", "being", "does",
    "did", "doing", "because", "while", "after", "before", "during",
}

_cache_lock = threading.Lock()
_cache: Dict[str, Dict[str, "VocabEntry"]] = {}  # project_id -> {lower_term: entry}


# ── Vocabulary entry: canonical casing by majority vote, source tracking ────


class VocabEntry:
    """
    One learned vocabulary term. `count` is the total number of times any
    casing variant of this term was seen; `canonical_counts` tallies each
    distinct casing so the canonical form is a majority vote (stable against
    a single stray lowercase/uppercase mention). `sources` and `kind` drive
    the "closest technologies" vs "closest topics" split in suggestions.py.
    """

    __slots__ = ("canonical_counts", "count", "sources", "kind")

    def __init__(self) -> None:
        self.canonical_counts: Counter = Counter()
        self.count: int = 0
        self.sources: set = set()
        self.kind: str = "topic"  # "technology" | "topic" | "metadata"

    def add(self, canonical: str, source: str, kind: str) -> None:
        self.canonical_counts[canonical] += 1
        self.count += 1
        self.sources.add(source)
        # "technology" is sticky — once a term looks like a technology
        # (ALLCAPS/CamelCase), later plain-word mentions don't downgrade it.
        if kind == "technology" or self.kind != "technology":
            self.kind = kind

    @property
    def canonical(self) -> str:
        return self.canonical_counts.most_common(1)[0][0]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "canonical_counts": dict(self.canonical_counts),
            "count": self.count,
            "sources": sorted(self.sources),
            "kind": self.kind,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "VocabEntry":
        entry = cls()
        entry.canonical_counts = Counter(d.get("canonical_counts", {}))
        entry.count = d.get("count", 0)
        entry.sources = set(d.get("sources", []))
        entry.kind = d.get("kind", "topic")
        return entry


# ── Extraction — deterministic patterns, no LLM ──────────────────────────────

# CamelCase / PascalCase multi-hump identifiers: FastAPI, ChromaDB, LangGraph
_CAMEL_CASE_RE = re.compile(r"\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b")
# ALLCAPS acronyms, 2-6 letters: RAG, CUDA, SQL, API (bounded to avoid shouty sentences)
_ALLCAPS_RE = re.compile(r"\b[A-Z]{2,6}\b")
# Title-Case phrases, 1-4 words: "Context Vault", "Chrome Extension", "Claude Code"
_TITLECASE_PHRASE_RE = re.compile(r"\b[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){0,3}\b")


_SINGLE_PROPER_NOUN_RE = re.compile(r"\b[A-Z][a-z0-9]{2,}\b")
_COMMON_SENTENCE_STARTERS = {
    "the", "this", "that", "these", "those", "however", "therefore",
    "additionally", "also", "note", "example", "first", "second", "third",
    "finally", "overall", "here", "there", "today", "yesterday", "tomorrow",
    "because", "since", "while", "although", "when", "where", "how", "what",
    "why", "who", "which", "you", "your", "we", "our", "it", "its", "let",
    "yes", "okay", "sure", "great", "thanks", "please", "instead", "after",
    "before", "then", "now", "one", "two", "three", "each", "some", "many",
}


def _sentence_initial_positions(text: str) -> set:
    """Character offsets where a new sentence starts (index 0, or right after
    '. ' / '! ' / '? '). Used to distinguish "capitalized because it's the
    first word of a sentence" from "capitalized because it's a proper noun"."""
    positions = {0}
    for m in re.finditer(r"[.!?]\s+", text):
        positions.add(m.end())
    return positions


def _single_word_proper_nouns(text: str, allow_sentence_initial: bool) -> List[str]:
    """
    Single Titlecase words (one capital, rest lowercase — "Qdrant", not
    "FastAPI" which the CamelCase pattern already handles) that are either not
    at a sentence boundary (so ordinary English capitalization rules don't
    explain them — a strong proper-noun signal) or repeat 2+ times anywhere in
    the text (repetition is itself a signal, even if every occurrence happened
    to be sentence-initial). `allow_sentence_initial=True` (used for titles,
    which aren't real sentences) skips the position check entirely.
    """
    if not text:
        return []
    sentence_starts = _sentence_initial_positions(text)
    counts: Counter = Counter()
    positions_by_word: Dict[str, List[int]] = {}
    for m in _SINGLE_PROPER_NOUN_RE.finditer(text):
        word = m.group(0)
        if word.lower() in _COMMON_SENTENCE_STARTERS:
            continue
        counts[word] += 1
        positions_by_word.setdefault(word, []).append(m.start())

    found: List[str] = []
    for word, count in counts.items():
        starts = positions_by_word[word]
        only_sentence_initial = all(s in sentence_starts for s in starts)
        if allow_sentence_initial or not only_sentence_initial or count >= 2:
            found.append(word)
    return found


def extract_candidate_terms(
    text: str, allow_sentence_initial: bool = False
) -> List[Tuple[str, str]]:
    """Returns (term, kind) pairs found in `text` via pattern matching only.
    `allow_sentence_initial` relaxes the single-word proper-noun check for
    titles, which aren't sentences — every capitalized word in a short title
    is presumably meaningful, unlike prose where sentence-initial capitals
    are just grammar."""
    if not text:
        return []
    found: List[Tuple[str, str]] = []
    for m in _CAMEL_CASE_RE.findall(text):
        found.append((m, "technology"))
    for m in _ALLCAPS_RE.findall(text):
        found.append((m, "technology"))
    for m in _TITLECASE_PHRASE_RE.findall(text):
        # Skip single-word title-case matches — handled separately below with
        # the sentence-position heuristic, which plain findall() can't apply.
        if " " in m:
            found.append((m, "topic"))
    for word in _single_word_proper_nouns(text, allow_sentence_initial):
        found.append((word, "topic"))
    return found


def extract_terms_from_context(raw_content: Dict[str, Any]) -> List[Tuple[str, str, str]]:
    """
    Returns (term, source, kind) triples extracted from one captured context's
    title, message content, and platform metadata.

    How it is updated: this is called once per captured context, from
    RagService._index_sync(), right after chunk_context() — i.e. every time a
    conversation is indexed (new capture), its title and message text are
    scanned for vocabulary terms automatically. There is no separate "rebuild
    vocabulary" job; the vocabulary grows incrementally, one context at a time,
    for as long as the extension keeps capturing conversations.
    """
    terms: List[Tuple[str, str, str]] = []

    title = raw_content.get("title", "") or ""
    for term, kind in extract_candidate_terms(title, allow_sentence_initial=True):
        terms.append((term, "title", kind))

    messages: List[Dict] = raw_content.get("messages", [])
    combined_text = " ".join((m.get("content", "") or "") for m in messages)
    for term, kind in extract_candidate_terms(combined_text):
        terms.append((term, "content", kind))

    # Frequently occurring important words — plain words (not already caught
    # by the casing-based patterns above) that repeat often enough within this
    # context to be worth remembering, e.g. a recurring project/company name
    # that's written in lowercase throughout.
    words = re.findall(r"[A-Za-z][A-Za-z0-9]{3,}", combined_text)
    freq = Counter(w for w in words if w.lower() not in _STOPWORDS)
    for word, count in freq.items():
        if count >= FREQUENT_WORD_THRESHOLD:
            terms.append((word, "frequent", "topic"))

    platform = raw_content.get("platform")
    if platform and platform != "unknown":
        terms.append((platform, "metadata", "metadata"))

    return terms


# ── Storage: JSON file per project + in-memory cache ─────────────────────────


def _vocab_path(project_id: str) -> Path:
    VOCAB_DIR.mkdir(parents=True, exist_ok=True)
    return VOCAB_DIR / f"{project_id}.json"


def _load_vocab(project_id: str) -> Dict[str, VocabEntry]:
    with _cache_lock:
        cached = _cache.get(project_id)
    if cached is not None:
        return cached

    path = _vocab_path(project_id)
    vocab: Dict[str, VocabEntry] = {}
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            vocab = {k: VocabEntry.from_dict(v) for k, v in raw.items()}
        except Exception:
            logger.warning("vocabulary_load_failed", project_id=project_id)

    with _cache_lock:
        _cache[project_id] = vocab
    return vocab


def _save_vocab(project_id: str, vocab: Dict[str, VocabEntry]) -> None:
    path = _vocab_path(project_id)
    data = {k: v.to_dict() for k, v in vocab.items()}
    path.write_text(json.dumps(data), encoding="utf-8")
    with _cache_lock:
        _cache[project_id] = vocab


def update_vocabulary_from_context(project_id: str, raw_content: Dict[str, Any]) -> int:
    """
    Extracts vocabulary terms from a captured context and merges them into
    the project's learned vocabulary. Called from RagService._index_sync()
    once per indexed context (see extract_terms_from_context's docstring).

    How duplicates are handled: terms are keyed by lowercase form, so "RAG"
    seen 40 times across 40 chunks is ONE dict entry whose `count` increments
    each time (not 40 rows) — canonical casing is a majority vote over every
    casing variant seen (`canonical_counts`), so one stray "rag" mention among
    many "RAG" mentions can't flip the canonical form. Re-indexing the same
    context again (idempotent replays) just increments counts further, which
    is harmless — it doesn't create duplicate vocabulary entries or double the
    dictionary size, it only reinforces confidence in terms already known.

    Returns the number of (term, source, kind) triples processed.
    """
    terms = extract_terms_from_context(raw_content)
    if not terms:
        return 0

    vocab = _load_vocab(project_id)
    for term, source, kind in terms:
        term = term.strip()
        if len(term) < 2:
            continue
        key = term.lower()
        if key in _TECHNICAL_TERMS_LOWER:
            continue  # already in the protected dictionary — nothing to learn
        entry = vocab.setdefault(key, VocabEntry())
        entry.add(term, source, kind)

    _save_vocab(project_id, vocab)
    logger.info(
        "vocabulary_updated",
        project_id=project_id,
        terms_processed=len(terms),
        vocab_size=len(vocab),
    )
    return len(terms)


# ── Merged lookup surface: protected dictionary + learned vocabulary ───────


def get_merged_vocabulary(project_id: str) -> Dict[str, str]:
    """
    Protected terms (query_normalizer._TECHNICAL_TERMS_LOWER) + this project's
    learned vocabulary, as a flat {lowercase: canonical} map ready for fuzzy
    correction. Protected terms always win on key collision — never let noisy
    learned data re-case a curated protected term. Learned terms below
    MIN_OCCURRENCES_FOR_CORRECTION are excluded here (too little evidence to
    trust as an auto-correction target) but are still available via
    get_all_terms() for suggestions, where a single-mention project-specific
    name is still worth surfacing as a "did you mean".
    """
    merged: Dict[str, str] = dict(_TECHNICAL_TERMS_LOWER)
    for key, entry in _load_vocab(project_id).items():
        if key in merged or entry.count < MIN_OCCURRENCES_FOR_CORRECTION:
            continue
        merged[key] = entry.canonical
    return merged


def get_all_terms(project_id: str) -> List[Tuple[str, int, str]]:
    """All known terms for this project — protected (infinite implied count)
    + every learned term regardless of frequency — as (canonical, count, kind)
    triples. Used by suggestions.py, not by auto-correction."""
    terms: List[Tuple[str, int, str]] = [(t, 999, "technology") for t in _TECHNICAL_TERMS_LOWER.values()]
    for entry in _load_vocab(project_id).values():
        terms.append((entry.canonical, entry.count, entry.kind))
    return terms


def correct_against_vocabulary(text: str, vocab_map: Dict[str, str]) -> str:
    """
    Word-by-word fuzzy correction against an arbitrary {lower: canonical} map
    — same exact-match short-circuit as query_normalizer.correct_technical_terms,
    just parameterized over the merged (protected + learned) vocabulary instead
    of only the static list. Reuses _closest_vocab_match / _WORD_RE from
    query_normalizer rather than reimplementing word-splitting or distance logic.
    """
    def _replace(match: "re.Match[str]") -> str:
        word = match.group(0)
        if word.lower() in vocab_map:
            return word
        corrected = _closest_vocab_match(word, vocab_map)
        return corrected if corrected else word

    return _WORD_RE.sub(_replace, text)


def merge_split_vocabulary_terms(text: str, vocab_map: Dict[str, str]) -> str:
    """
    Same bigram-concatenation trick as
    query_normalizer._merge_split_technical_terms ("Fast APi" -> "FastAPI"),
    parameterized over the merged (protected + learned) vocabulary instead of
    only the static list. This is what lets "Lang Grap" correct to "LangGraph"
    once LangGraph has actually been learned from indexed conversations —
    the static-only version could never know about a project-specific term.
    """
    words = text.split(" ")
    merged: List[str] = []
    i = 0
    while i < len(words):
        if i + 1 < len(words):
            w1, w2 = words[i], words[i + 1]
            trailing = re.sub(r"^[A-Za-z0-9']*", "", w2)
            candidate = re.sub(r"[^A-Za-z0-9]", "", w1 + w2)
            canonical = None
            if candidate and candidate.lower() in vocab_map:
                canonical = vocab_map[candidate.lower()]
            elif candidate:
                canonical = _closest_vocab_match(candidate, vocab_map)
            if canonical:
                merged.append(canonical + trailing)
                i += 2
                continue
        merged.append(words[i])
        i += 1
    return " ".join(merged)
