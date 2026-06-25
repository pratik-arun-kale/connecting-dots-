"""Chunk captured conversation messages into indexable text units."""
from __future__ import annotations

from typing import Any, Dict, List

CHUNK_SIZE = 200    # word-token approximation
CHUNK_OVERLAP = 40


def _split_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    tokens = text.split()
    if len(tokens) <= chunk_size:
        return [text] if text.strip() else []
    chunks: List[str] = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunks.append(" ".join(tokens[start:end]))
        if end == len(tokens):
            break
        start = end - overlap
    return chunks


def chunk_context(
    context_id: str,
    session_id: str,
    project_id: str,
    raw_content: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Convert a captured context's raw_content into flat indexable chunks.

    Each message becomes one or more chunks (split if > CHUNK_SIZE words).
    Metadata carries context_id, session_id, project_id, role, platform, etc.
    so query results can be traced back to the original context card.
    """
    chunks: List[Dict[str, Any]] = []
    messages: List[Dict] = raw_content.get("messages", [])
    title: str = raw_content.get("title", "") or ""
    platform: str = raw_content.get("platform", "unknown") or "unknown"
    chat_url: str = raw_content.get("chat_url", "") or ""

    base_meta = {
        "context_id": context_id,
        "session_id": session_id,
        "project_id": project_id,
        "platform": platform,
        "chat_url": chat_url,
        "title": title,
    }

    if messages:
        for msg_idx, msg in enumerate(messages):
            role: str = msg.get("role", "unknown")
            content: str = (msg.get("content", "") or "").strip()
            if not content:
                continue

            text_chunks = _split_text(content)
            for chunk_idx, chunk_text in enumerate(text_chunks):
                # Prepend conversation title to the very first chunk for better recall
                if msg_idx == 0 and chunk_idx == 0 and title:
                    chunk_text = f"[{title}] {chunk_text}"

                chunk_id = f"{context_id}__m{msg_idx}__c{chunk_idx}"
                chunks.append(
                    {
                        "id": chunk_id,
                        "text": chunk_text,
                        "metadata": {
                            **base_meta,
                            "message_role": role,
                            "message_index": msg_idx,
                            "chunk_index": chunk_idx,
                        },
                    }
                )
    else:
        # Fallback: index raw body text when no structured messages present
        body: str = (
            raw_content.get("body", "")
            or raw_content.get("text", "")
            or ""
        )
        if body.strip():
            for i, chunk_text in enumerate(_split_text(body)):
                chunk_id = f"{context_id}__body__{i}"
                chunks.append(
                    {
                        "id": chunk_id,
                        "text": chunk_text,
                        "metadata": {
                            **base_meta,
                            "message_role": "unknown",
                            "message_index": 0,
                            "chunk_index": i,
                        },
                    }
                )

    return chunks
