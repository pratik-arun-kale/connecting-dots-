"""
app/schemas/rag.py
───────────────────
Request / Response schemas for the POST /projects/{id}/query endpoint.
"""
from __future__ import annotations

from pydantic import Field

from app.schemas.base import AppBaseModel


class RagQueryRequest(AppBaseModel):
    question: str = Field(..., min_length=3, max_length=1000, description="Natural language question about captured contexts")


class RagCitation(AppBaseModel):
    context_id: str
    chunk_id: str
    platform: str
    title: str
    chat_url: str
    excerpt: str
    reranker_score: float


class RagQueryResponse(AppBaseModel):
    answer: str
    confidence: str                  # "HIGH" | "MEDIUM" | "LOW"
    citations: list[RagCitation]
    query_used: str                  # may differ from question if corrective retrieval fired
    corrective_triggered: bool
    top_reranker_score: float = 0.0
    chunks_indexed: int = 0
