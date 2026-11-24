"""
app/services/rag_service.py
────────────────────────────
RagService — indexes captured contexts into the search index (Postgres) and handles RAG queries.

Both public methods are async; CPU-heavy work is offloaded to a thread pool
via asyncio.to_thread() so the FastAPI event loop is never blocked.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import Any

from app.core.logging import get_logger
from app.core.rag import chunker, embedder, pipeline, vector_store, vocabulary
from app.models.context import Context

logger = get_logger(__name__)


def raw_content_for_index(context: Context) -> dict[str, Any]:
    """What to index for a context as it stands now, in the raw_content shape
    chunker.chunk_context() expects. Notes (platform "note") are indexed from
    content_md, where edits land — their raw_content is only the first-save
    snapshot (for a dashboard note, the words typed before the first
    autosave). Conversations keep their captured messages. Either way the
    reader's own title wins, so a search for it finds the note."""
    raw = context.raw_content or {}
    if context.platform == "note" and context.content_md:
        messages: list = [{"role": "user", "content": context.content_md, "timestamp": None, "index": 0}]
    else:
        messages = raw.get("messages", [])
    return {
        "title": context.user_title or context.title or raw.get("title", ""),
        "platform": context.platform or raw.get("platform", "unknown"),
        "chat_url": context.chat_url or raw.get("chat_url", ""),
        "messages": messages,
        "metadata": raw.get("metadata", {}),
    }


class RagService:
    # ── Indexing ──────────────────────────────────────────────────────────────

    async def index_context(
        self,
        context_id: uuid.UUID,
        session_id: uuid.UUID,
        project_id: uuid.UUID,
        raw_content: dict[str, Any],
    ) -> None:
        """
        Chunk + embed + upsert a captured context into the project's search index.
        The CPU work runs in a worker thread, so the event loop keeps serving.
        """
        await asyncio.to_thread(
            self._index_sync,
            str(context_id),
            str(session_id),
            str(project_id),
            raw_content,
        )

    async def reindex_context(
        self,
        context_id: uuid.UUID,
        session_id: uuid.UUID,
        project_id: uuid.UUID,
        raw_content: dict[str, Any],
    ) -> None:
        """
        Replace a context's chunks with ones built from `raw_content`, now.
        Called inside a request (ContextService.bring_index_up_to_date, before
        a search); a burst of autosaves needs no coalescing here because edits
        only mark the context stale and the next search indexes it once.
        """
        await asyncio.to_thread(
            self._reindex_sync, str(context_id), str(session_id), str(project_id), raw_content
        )

    def _reindex_sync(
        self,
        context_id: str,
        session_id: str,
        project_id: str,
        raw_content: dict[str, Any],
    ) -> None:
        # Delete first: chunk ids are positional (<context>__m<i>__c<j>), so
        # upserting a shorter text would leave the old tail chunks behind.
        vector_store.delete_context_chunks(project_id, context_id)
        self._index_sync(context_id, session_id, project_id, raw_content)

    def _index_sync(
        self,
        context_id: str,
        session_id: str,
        project_id: str,
        raw_content: dict[str, Any],
    ) -> None:
        chunks = chunker.chunk_context(context_id, session_id, project_id, raw_content)
        if not chunks:
            logger.warning("rag_index_empty", context_id=context_id, project_id=project_id)
            return

        texts = [c["text"] for c in chunks]
        embeddings = embedder.embed_texts(texts)

        enriched = [
            {
                "id": c["id"],
                "text": c["text"],
                "embedding": emb,
                "metadata": c["metadata"],
            }
            for c, emb in zip(chunks, embeddings, strict=False)
        ]
        vector_store.upsert_chunks(project_id, enriched)

        logger.info(
            "rag_indexed",
            context_id=context_id,
            project_id=project_id,
            chunks=len(enriched),
        )

        # Learned vocabulary (Part 1): extract terms from this context's title
        # + message text and merge into the project's vocabulary. Runs in the
        # same background thread as indexing — no extra request-path latency,
        # no additional DB queries (writes a small JSON file, see vocabulary.py).
        vocabulary.update_vocabulary_from_context(project_id, raw_content)

    # ── Querying ──────────────────────────────────────────────────────────────

    async def query_project(
        self, project_id: uuid.UUID, question: str
    ) -> dict[str, Any]:
        """Run the full RAG pipeline against a project's captured contexts."""
        result = await asyncio.to_thread(
            pipeline.run_query, str(project_id), question
        )
        logger.info(
            "rag_query_complete",
            project_id=str(project_id),
            confidence=result.get("confidence"),
            chunks_indexed=result.get("chunks_indexed"),
            corrective=result.get("corrective_triggered"),
        )
        return result

    async def search_conversations(
        self, project_id: uuid.UUID, query: str, top_k: int = 10
    ) -> dict[str, Any]:
        """
        Find which captured conversations discussed a topic — retrieval only,
        no Ollama / answer generation. Reuses the same hybrid retrieval core
        as query_project(), grouped by conversation instead of a synthesized answer.
        """
        result = await asyncio.to_thread(
            pipeline.search_conversations, str(project_id), query, top_k
        )
        logger.info(
            "conversation_search_complete",
            project_id=str(project_id),
            conversations_found=len(result.get("conversations", [])),
            total_conversations=result.get("total_conversations"),
            chunks_indexed=result.get("chunks_indexed"),
        )
        return result

    # ── Utility ───────────────────────────────────────────────────────────────

    def chunks_indexed(self, project_id: uuid.UUID) -> int:
        """Return how many chunks are indexed for a project (synchronous, cheap)."""
        return vector_store.chunk_count(str(project_id))
