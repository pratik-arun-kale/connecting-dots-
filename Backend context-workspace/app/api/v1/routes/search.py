"""
app/api/v1/routes/search.py
─────────────────────────────
Conversation search.

POST /search/conversations – find which captured conversations discussed a topic.
Reuses the existing hybrid RAG retrieval pipeline (BM25 + vector + reranker);
does NOT invoke Ollama or generate an AI answer.
"""

from fastapi import APIRouter, status

from app.core.rag.query_normalizer import _max_edit_distance, levenshtein_distance
from app.dependencies import ProjectServiceDep, RagServiceDep
from app.schemas.search import ConversationSearchRequest, ConversationSearchResponse

router = APIRouter(prefix="/search", tags=["Search"])

MAX_PROJECT_SUGGESTIONS = 5
# A bit more permissive than auto-correction — same rationale as
# suggestions.SUGGESTION_SLACK: a suggestion is reviewed by the user, not
# silently applied, so slightly-further matches are still worth surfacing.
PROJECT_SUGGESTION_SLACK = 2


async def _closest_project_names(
    topic: str, exclude_project_id: str, project_service: ProjectServiceDep
) -> list[str]:
    """
    "Closest projects" (Part 3) — layered in here rather than in
    app.core.rag.suggestions because it needs the Postgres project list,
    which that CPU-bound, DB-free module deliberately doesn't have access to.
    Only called on the already-rare "zero results" path, and reuses the
    existing ProjectService.list_projects() call — no new query pattern.
    """
    topic_lower = topic.lower()
    projects, _total = await project_service.list_projects(limit=200)
    scored: list[tuple[int, str]] = []
    for p in projects:
        if str(p.id) == exclude_project_id:
            continue
        dist = levenshtein_distance(topic_lower, p.name.lower())
        if dist <= _max_edit_distance(topic_lower) + PROJECT_SUGGESTION_SLACK:
            scored.append((dist, p.name))
    scored.sort(key=lambda t: t[0])
    return [name for _, name in scored[:MAX_PROJECT_SUGGESTIONS]]


@router.post(
    "/conversations",
    response_model=ConversationSearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Search captured conversations by topic (retrieval only, no answer generation)",
)
async def search_conversations(
    payload: ConversationSearchRequest,
    rag_service: RagServiceDep,
    project_service: ProjectServiceDep,
) -> ConversationSearchResponse:
    result = await rag_service.search_conversations(
        payload.project_id, payload.query, payload.top_k
    )

    if result.get("total_conversations", 0) == 0:
        topic = result.get("query_used") or payload.query
        closest_projects = await _closest_project_names(
            topic, str(payload.project_id), project_service
        )
        if closest_projects:
            suggestions = result.get("suggestions") or {
                "closest_topics": [],
                "closest_technologies": [],
                "related_conversations": [],
            }
            suggestions["closest_projects"] = closest_projects
            result["suggestions"] = suggestions

    return ConversationSearchResponse(**result)
