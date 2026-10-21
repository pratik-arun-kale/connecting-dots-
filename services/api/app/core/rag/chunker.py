"""
Structure-aware chunker for captured conversation messages.

Parsing order (applied per message):
  1. ``` / ~~~ fences       → entire block as one "code" chunk (cap: CODE_WORD_CAP words)
  2. Markdown tables         → entire table as one "table" chunk (requires |---| separator)
  3. Everything else         → sliding-window "prose" chunks (PROSE_CHUNK_SIZE / OVERLAP)

Each chunk carries a chunk_type: "code" | "table" | "prose" metadata field so
retrieval and the LLM prompt can filter or weight by structural type.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

PROSE_CHUNK_SIZE = 200      # words per prose chunk
PROSE_CHUNK_OVERLAP = 40    # word overlap between consecutive prose chunks
CODE_WORD_CAP = 450         # ≈ 600 tokens — truncate code blocks beyond this


# ── Prose sliding-window splitter ─────────────────────────────────────────────

def _split_prose(text: str) -> List[str]:
    words = text.split()
    if not words:
        return []
    if len(words) <= PROSE_CHUNK_SIZE:
        return [text.strip()]
    chunks: List[str] = []
    start = 0
    while start < len(words):
        end = min(start + PROSE_CHUNK_SIZE, len(words))
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start = end - PROSE_CHUNK_OVERLAP
    return chunks


# ── Structural detectors ──────────────────────────────────────────────────────

def _is_table_row(line: str) -> bool:
    s = line.strip()
    return s.startswith("|") and s.endswith("|") and len(s) > 2


def _is_table_separator(line: str) -> bool:
    return bool(re.match(r"^\s*\|[\s\-:|]+\|\s*$", line))


# ── Structure-aware block parser ──────────────────────────────────────────────

def _parse_blocks(text: str) -> List[Tuple[str, str]]:
    """
    Split *text* into (content, chunk_type) pairs.

    chunk_type is one of: "code" | "table" | "prose"

    Prose blocks are further split by the sliding window before being returned,
    so each tuple is already an indexable unit.
    """
    lines = text.splitlines(keepends=True)
    blocks: List[Tuple[str, str]] = []
    prose_buf: List[str] = []

    def flush_prose() -> None:
        if not prose_buf:
            return
        prose_text = "".join(prose_buf).strip()
        prose_buf.clear()
        for chunk in _split_prose(prose_text):
            if chunk.strip():
                blocks.append((chunk, "prose"))

    i = 0
    while i < len(lines):
        raw = lines[i]
        stripped = raw.strip()

        # ── Code fence ────────────────────────────────────────────────────────
        if stripped.startswith("```") or stripped.startswith("~~~"):
            flush_prose()
            fence = "```" if stripped.startswith("```") else "~~~"
            code_lines: List[str] = [raw]
            i += 1
            while i < len(lines):
                code_lines.append(lines[i])
                cl = lines[i].strip()
                # Closing fence: starts with same marker and isn't the opening line
                if cl != stripped and cl.startswith(fence):
                    i += 1
                    break
                i += 1
            code_text = "".join(code_lines).strip()
            # Cap oversized code blocks so the LLM prompt stays manageable
            words = code_text.split()
            if len(words) > CODE_WORD_CAP:
                code_text = " ".join(words[:CODE_WORD_CAP]) + "\n... [truncated]"
            if code_text:
                blocks.append((code_text, "code"))
            continue

        # ── Markdown table ────────────────────────────────────────────────────
        # Only treat as a table if the very next line is a |---| separator,
        # which is the canonical GFM table format.
        if (
            _is_table_row(stripped)
            and i + 1 < len(lines)
            and _is_table_separator(lines[i + 1])
        ):
            flush_prose()
            table_lines: List[str] = []
            while i < len(lines) and (
                _is_table_row(lines[i].strip()) or _is_table_separator(lines[i].strip())
            ):
                table_lines.append(lines[i])
                i += 1
            table_text = "".join(table_lines).strip()
            if table_text:
                blocks.append((table_text, "table"))
            continue

        # ── Prose ─────────────────────────────────────────────────────────────
        prose_buf.append(raw)
        i += 1

    flush_prose()
    return blocks


# ── Public API ────────────────────────────────────────────────────────────────

def chunk_context(
    context_id: str,
    session_id: str,
    project_id: str,
    raw_content: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Convert a captured context's raw_content into flat indexable chunks.

    Each message is parsed into code / table / prose blocks before chunking,
    so code fences and tables are never split mid-structure. Metadata includes
    chunk_type so the retrieval layer can filter or weight by structural type.
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

    def _build_chunks(
        blocks: List[Tuple[str, str]],
        role: str,
        msg_idx: int,
        id_prefix: str,
        prepend_title: bool,
    ) -> None:
        for chunk_idx, (chunk_text, chunk_type) in enumerate(blocks):
            # Prepend conversation title to the very first chunk for recall on title queries
            if prepend_title and chunk_idx == 0 and title:
                chunk_text = f"[{title}] {chunk_text}"

            chunk_id = f"{id_prefix}__c{chunk_idx}"
            chunks.append(
                {
                    "id": chunk_id,
                    "text": chunk_text,
                    "metadata": {
                        **base_meta,
                        "message_role": role,
                        "message_index": msg_idx,
                        "chunk_index": chunk_idx,
                        "chunk_type": chunk_type,
                    },
                }
            )

    if messages:
        for msg_idx, msg in enumerate(messages):
            role: str = msg.get("role", "unknown")
            content: str = (msg.get("content", "") or "").strip()
            if not content:
                continue
            blocks = _parse_blocks(content)
            _build_chunks(
                blocks,
                role=role,
                msg_idx=msg_idx,
                id_prefix=f"{context_id}__m{msg_idx}",
                prepend_title=(msg_idx == 0),
            )
    else:
        # Fallback: index raw body text when no structured messages are present
        body: str = (
            raw_content.get("body", "") or raw_content.get("text", "") or ""
        ).strip()
        if body:
            blocks = _parse_blocks(body)
            _build_chunks(
                blocks,
                role="unknown",
                msg_idx=0,
                id_prefix=f"{context_id}__body",
                prepend_title=True,
            )

    return chunks
