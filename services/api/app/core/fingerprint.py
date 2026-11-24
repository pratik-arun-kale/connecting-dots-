"""
app/core/fingerprint.py
────────────────────────
The content fingerprint that makes a capture a duplicate: the same text
from the same page, saved into the same project. Whitespace is normalised
(a re-selection rarely matches byte for byte); case and punctuation are not.

Including the project id makes the hash unique across all users, so one
unique index on contexts.content_hash is enough (projects have one owner).

Migration 0011 holds a frozen copy of this function to backfill existing
rows; if this ever changes, add a migration that recomputes the hashes.
"""
from __future__ import annotations

import hashlib
import uuid
from urllib.parse import urldefrag


def capture_fingerprint(project_id: uuid.UUID | str, chat_url: str | None, content_md: str | None) -> str | None:
    text = " ".join((content_md or "").split())
    if not text:
        return None
    url = urldefrag((chat_url or "").strip())[0]
    return hashlib.sha256(f"{project_id}\n{url}\n{text}".encode()).hexdigest()
