"""
app/schemas/search.py
───────────────────────
Request / response schemas for POST /search/conversations.

Retrieval-only conversation search: reuses the hybrid RAG retrieval core
(BM25 + vector + cross-encoder reranking, see app.core.rag.pipeline) but
groups chunk-level hits by their parent conversation instead of generating
an AI answer.
"""
from __future__ import annotations

import uuid

from pydantic import Field

from app.schemas.base import AppBaseModel


class ConversationSearchRequest(AppBaseModel):
    project_id: uuid.UUID = Field(..., description="Project whose captured conversations to search")
    query: str = Field(..., min_length=3, max_length=1000, description="Topic to search for, e.g. 'ChromaDB'")
    top_k: int = Field(default=10, ge=1, le=50, description="Max number of conversations to return")


class ConversationSearchResult(AppBaseModel):
    conversation_id: str
    title: str
    chat_url: str
    provider: str
    relevance_score: float
    summary: str | None = None  # not yet generated anywhere in the pipeline
    top_relevant_snippets: list[str]


class ConversationSearchResponse(AppBaseModel):
    query_used: str                  # may differ from query if corrective retrieval fired
    corrective_triggered: bool
    chunks_indexed: int
    total_conversations: int         # total distinct conversations matched (before top_k trim)
    conversations: list[ConversationSearchResult]
