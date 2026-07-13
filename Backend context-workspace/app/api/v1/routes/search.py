"""
app/api/v1/routes/search.py
─────────────────────────────
Conversation search.

POST /search/conversations – find which captured conversations discussed a topic.
Reuses the existing hybrid RAG retrieval pipeline (BM25 + vector + reranker);
does NOT invoke Ollama or generate an AI answer.
"""

from fastapi import APIRouter, status

from app.dependencies import RagServiceDep
from app.schemas.search import ConversationSearchRequest, ConversationSearchResponse

router = APIRouter(prefix="/search", tags=["Search"])


@router.post(
    "/conversations",
    response_model=ConversationSearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Search captured conversations by topic (retrieval only, no answer generation)",
)
async def search_conversations(
    payload: ConversationSearchRequest,
    rag_service: RagServiceDep,
) -> ConversationSearchResponse:
    result = await rag_service.search_conversations(
        payload.project_id, payload.query, payload.top_k
    )
    return ConversationSearchResponse(**result)
