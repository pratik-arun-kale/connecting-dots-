"""
app/core/rag/query_normalizer.py
───────────────────────────────────
Deterministic, LLM-free preprocessing for "Search Previous Conversations"
queries. No network calls, no external NLP libraries — plain regex and a
self-contained Levenshtein-distance fuzzy matcher.

Pipeline (see normalize_conversation_search_query docstring for the full
rationale):
  1. trim whitespace, collapse repeated punctuation
  2. collapse repeated letters ("discussedddd" -> "discussedd")
  3. merge accidentally-split technical terms ("Fast APi" -> "FastAPI")
  4. fuzzy-correct intent-phrase keywords ("discused"/"whre" -> "discuss"/"where")
     so the phrase-detection regex below can still recognize typo'd phrasing
  5. detect conversation-search intent and extract the bare topic
  6. fuzzy-correct the extracted (or, if no phrase matched, the whole) topic
     against a protected list of technical terms — exact matches are left
     completely untouched; only near-miss typos get corrected
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional

# ── Levenshtein distance — small, dependency-free fuzzy matcher ─────────────


def levenshtein_distance(a: str, b: str) -> int:
    """Classic edit distance (insertions/deletions/substitutions), O(len(a)*len(b))."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i] + [0] * len(b)
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr[j] = min(
                prev[j] + 1,       # deletion
                curr[j - 1] + 1,   # insertion
                prev[j - 1] + cost,  # substitution
            )
        prev = curr
    return prev[-1]


def _max_edit_distance(term: str) -> int:
    """How many character-level mistakes we tolerate, scaled to word length —
    short words need a tight leash (1-2 chars off a 3-letter word is a
    different word entirely) while longer words can absorb more typos."""
    length = len(term)
    if length <= 4:
        return 1
    if length <= 8:
        return 2
    return 3


def _closest_vocab_match(word: str, vocabulary: Dict[str, str]) -> Optional[str]:
    """
    Return the vocabulary's canonical form if `word` is an exact or close
    match, else None. `vocabulary` maps lowercase-term -> canonical-form.
    Terms of length <= 2 (e.g. "i", "we", "on") are exact-match only — fuzzy
    matching 1-2 letter words is how a real word like "AI" would get
    mangled into "i" by accident, so short vocabulary entries never fuzzy-match.
    """
    lower = word.lower()
    if lower in vocabulary:
        return vocabulary[lower]

    best_term: Optional[str] = None
    best_dist: Optional[int] = None
    for vocab_lower, canonical in vocabulary.items():
        if len(vocab_lower) <= 2:
            continue  # exact-match only, see docstring
        dist = levenshtein_distance(lower, vocab_lower)
        if dist <= _max_edit_distance(vocab_lower) and (best_dist is None or dist < best_dist):
            best_dist = dist
            best_term = canonical
    return best_term


_WORD_RE = re.compile(r"[A-Za-z0-9]+(?:'[A-Za-z]+)?")


# ── Step 1-2: whitespace, punctuation, repeated-letter cleanup ──────────────


def _clean_whitespace_and_punctuation(text: str) -> str:
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    # collapse runs of 2+ identical punctuation marks: "RAG??" -> "RAG?"
    text = re.sub(r"([!?.,;:])\1+", r"\1", text)
    return text


def _collapse_repeated_letters(text: str) -> str:
    """
    Collapse any run of 3+ identical letters down to 2 — "discussedddd" (4 d's)
    -> "discussedd" (2 d's), "hellooooo" -> "helloo". Stops at 2 (not 1) because
    English has plenty of legitimate double letters ("committee", "book",
    "discussed" itself has a double 's') that a collapse-to-1 rule would break.
    Anything still off by one letter after this (e.g. "discussedd" vs
    "discussed", "RAGG" which only has 2 repeats and isn't touched at all) is
    caught by the fuzzy-matching steps below instead.
    """
    return re.sub(r"([A-Za-z])\1{2,}", r"\1\1", text)


# ── Step 3: protected technical vocabulary ───────────────────────────────────
# Canonical casing for common technical terms that must never be "incorrectly
# modified". An exact match (any case) always passes through byte-for-byte
# unchanged; only a near-miss typo gets corrected TO this exact casing.

_TECHNICAL_TERMS = [
    "FastAPI", "ChromaDB", "CUDA", "RAG", "Ollama", "Redis", "PostgreSQL",
    "TypeScript", "OpenAI", "NVIDIA", "Docker", "Kubernetes", "MongoDB",
    "GraphQL", "JavaScript", "Python", "React", "Next.js", "Anthropic",
    "Claude", "BM25", "SQL", "JSON", "YAML", "AWS", "GCP",
]
_TECHNICAL_TERMS_LOWER: Dict[str, str] = {t.lower(): t for t in _TECHNICAL_TERMS}


def correct_technical_terms(text: str) -> str:
    """
    Word-by-word fuzzy correction against the protected technical-term list.
    "RAG" (exact) -> "RAG" unchanged. "RAGG"/"raag" (near-miss) -> "RAG".
    Anything not close to a known term (including any topic word we've never
    heard of) is left completely alone — this never invents a correction.
    """
    def _replace(match: "re.Match[str]") -> str:
        word = match.group(0)
        if word.lower() in _TECHNICAL_TERMS_LOWER:
            return word  # already correct (whatever case the user typed) — no-op
        corrected = _closest_vocab_match(word, _TECHNICAL_TERMS_LOWER)
        return corrected if corrected else word

    return _WORD_RE.sub(_replace, text)


def _merge_split_technical_terms(text: str) -> str:
    """
    Some technical terms get accidentally typed with a stray space
    ("Fast APi" for "FastAPI"). Try concatenating each adjacent word pair and
    check it against the technical-term list before falling back to per-word
    correction, which would otherwise leave "Fast" and "APi" both untouched
    (neither one alone is close enough to "FastAPI" to fuzzy-match).
    """
    words = text.split(" ")
    merged: List[str] = []
    i = 0
    while i < len(words):
        if i + 1 < len(words):
            w1, w2 = words[i], words[i + 1]
            trailing = re.sub(r"^[A-Za-z0-9']*", "", w2)  # keep e.g. trailing "?"
            candidate = re.sub(r"[^A-Za-z0-9]", "", w1 + w2)
            canonical = None
            if candidate.lower() in _TECHNICAL_TERMS_LOWER:
                canonical = _TECHNICAL_TERMS_LOWER[candidate.lower()]
            elif candidate:
                canonical = _closest_vocab_match(candidate, _TECHNICAL_TERMS_LOWER)
            if canonical:
                merged.append(canonical + trailing)
                i += 2
                continue
        merged.append(words[i])
        i += 1
    return " ".join(merged)


# ── Step 4-5: intent-phrase detection with typo tolerance ───────────────────
# Keywords the phrase patterns below key off of. Fuzzy-correcting individual
# words against this vocabulary BEFORE running the intent regexes is what
# makes phrase detection typo-tolerant — the regexes themselves only ever see
# the corrected literal words, so they don't need to change at all.

_INTENT_KEYWORDS = [
    "where", "when", "which", "what", "did", "have", "has",
    "discuss", "discussed", "talk", "talked", "mention", "mentioned",
    "cover", "covered", "bring", "raise", "raised", "chat", "chats",
    "conversation", "conversations", "contains", "contain", "mentions",
    "discusses", "covers", "find", "search", "show", "list", "about",
    "regarding", "ever", "did",
]
_INTENT_VOCAB: Dict[str, str] = {w: w for w in _INTENT_KEYWORDS}


def _fuzzy_correct_intent_words(text: str) -> str:
    """
    Word-by-word fuzzy correction against the intent-keyword vocabulary only
    ("discused" -> "discuss", "whre" -> "where"). Words not close to any
    intent keyword — including the actual search topic — are left untouched.
    """
    def _replace(match: "re.Match[str]") -> str:
        word = match.group(0)
        corrected = _closest_vocab_match(word, _INTENT_VOCAB)
        return corrected if corrected else word

    return _WORD_RE.sub(_replace, text)


_CONVERSATION_SEARCH_PATTERNS: List[re.Pattern] = [
    # [interrogative]? + auxiliary(did/have/has) + subject(i/we) + verb + topic.
    # Interrogative prefix is OPTIONAL — "Did I discuss X?" has none at all.
    re.compile(
        r"^(?:(?:where|when|in which \w+|which \w+)\s+)?"
        r"(?:did|have|has)\s+(?:i|we)\s+(?:ever\s+)?"
        r"(?:discuss(?:ed)?|talk(?:ed)? about|mention(?:ed)?|cover(?:ed)?|bring(?:ed)? up|raise(?:d)?)"
        r"\s+(?:about\s+)?(.+?)[\?\.!]*$",
        re.IGNORECASE,
    ),
    # "which/what chat/conversation contains/has/mentions X"
    re.compile(
        r"^(?:which|what)\s+(?:chat|conversation)s?\s+"
        r"(?:contains?|has|have|mentions?|discusses?|covers?)\s+(.+?)[\?\.!]*$",
        re.IGNORECASE,
    ),
    # "find/search/show/list [for] [me] conversations/chats about/for/on/regarding X"
    re.compile(
        r"^(?:find|search|show|list)\s+(?:for\s+)?(?:me\s+)?(?:conversations?|chats?)\s+"
        r"(?:about|for|on|regarding|discussing)\s+(.+?)[\?\.!]*$",
        re.IGNORECASE,
    ),
]


def normalize_conversation_search_query(query: str) -> str:
    """
    Full normalization pipeline for conversation-search queries — deterministic,
    no LLM. Reduces meta-questions ("Where did I discussedddd RAG?") and
    misspelled bare topics ("RAGG") down to the clean topic ("RAG").

    Why this works when the naive version doesn't: intent-phrase regexes are
    literal-string matches, so a single misspelled keyword ("discussedddd")
    used to make the whole pattern fail silently, letting the full noisy
    sentence fall straight through to the cross-encoder reranker — which
    scores full sentences far below bare topics against the same passage.
    Fuzzy-correcting the phrase's own keywords (step 4) before the regex ever
    runs means a typo in "discuss" no longer breaks intent detection, and
    fuzzy-correcting the extracted topic against a protected technical-term
    list (step 6) fixes the topic itself without ever touching words that
    aren't obviously typos of something we recognize.
    """
    cleaned = _clean_whitespace_and_punctuation(query)
    cleaned = _collapse_repeated_letters(cleaned)
    cleaned = _merge_split_technical_terms(cleaned)
    intent_ready = _fuzzy_correct_intent_words(cleaned)

    for pattern in _CONVERSATION_SEARCH_PATTERNS:
        match = pattern.match(intent_ready)
        if match:
            topic = match.group(1).strip().strip("?.! ").strip()
            if topic:
                return correct_technical_terms(topic)

    # No conversation-search phrasing detected — the whole cleaned query IS
    # the topic (e.g. a bare "RAGG"). Still worth a technical-term typo pass.
    return correct_technical_terms(cleaned)
