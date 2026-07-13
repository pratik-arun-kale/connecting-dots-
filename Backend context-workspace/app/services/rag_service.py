"""
app/services/rag_service.py
────────────────────────────
RagService — indexes captured contexts into ChromaDB and handles RAG queries.

Both public methods are async; CPU-heavy work is offloaded to a thread pool
via asyncio.to_thread() so the FastAPI event loop is never blocked.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import Any, Dict

from app.core.logging import get_logger
from app.core.rag import chunker, embedder, pipeline, vector_store

logger = get_logger(__name__)


class RagService:
    # ── Indexing ──────────────────────────────────────────────────────────────

    async def index_context(
        self,
        context_id: uuid.UUID,
        session_id: uuid.UUID,
        project_id: uuid.UUID,
        raw_content: Dict[str, Any],
    ) -> None:
        """
        Chunk + embed + upsert a captured context into the project's ChromaDB collection.
        Runs in a background thread — never call from the hot request path directly.
        """
        await asyncio.to_thread(
            self._index_sync,
            str(context_id),
            str(session_id),
            str(project_id),
            raw_content,
        )

    def _index_sync(
        self,
        context_id: str,
        session_id: str,
        project_id: str,
        raw_content: Dict[str, Any],
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
            for c, emb in zip(chunks, embeddings)
        ]
        vector_store.upsert_chunks(project_id, enriched)

        logger.info(
            "rag_indexed",
            context_id=context_id,
            project_id=project_id,
            chunks=len(enriched),
        )

    # ── Querying ──────────────────────────────────────────────────────────────

    async def query_project(
        self, project_id: uuid.UUID, question: str
    ) -> Dict[str, Any]:
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
    ) -> Dict[str, Any]:
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
