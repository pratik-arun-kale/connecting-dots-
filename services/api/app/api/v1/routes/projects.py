"""
app/api/v1/routes/projects.py
──────────────────────────────
Project CRUD endpoints.

POST   /projects           – create a project
GET    /projects           – list all projects
GET    /projects/{id}      – get a single project
PATCH  /projects/{id}      – update a project (partial)
DELETE /projects/{id}      – delete a project
"""

import uuid

from fastapi import APIRouter, BackgroundTasks, Query, status

from app.dependencies import ContextServiceDep, CurrentUserDep, ProjectServiceDep, RagServiceDep, SessionServiceDep
from app.schemas.capture import CaptureConversationRequest, CaptureConversationResponse
from app.schemas.context import ContextListResponse, ContextResponse
from app.schemas.project import (
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)
from app.schemas.project_sessions import (
    CreateProjectWithSessionsRequest,
    CreateProjectWithSessionsResponse,
)
from app.schemas.rag import RagQueryRequest, RagQueryResponse
from app.schemas.session import SessionCreate, SessionResponse

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.post(
    "/create-with-sessions",
    response_model=CreateProjectWithSessionsResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project and open AI sessions for selected platforms",
)
async def create_project_with_sessions(
    payload: CreateProjectWithSessionsRequest,
    project_service: ProjectServiceDep,
    session_service: SessionServiceDep,
    current_user: CurrentUserDep,
) -> CreateProjectWithSessionsResponse:
    project = await project_service.create_project(ProjectCreate(name=payload.name), current_user.id)
    sessions = []
    for platform in payload.platforms:
        # create_or_get_session is idempotent: returns (session, created_bool)
        session, _ = await session_service.create_or_get_session(
            SessionCreate(project_id=project.id, source_platform=platform), current_user.id
        )
        sessions.append(session)
    return CreateProjectWithSessionsResponse(
        project=ProjectResponse.model_validate(project),
        sessions=[SessionResponse.model_validate(s) for s in sessions],
    )


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project",
)
async def create_project(
    payload: ProjectCreate,
    service: ProjectServiceDep,
    current_user: CurrentUserDep,
) -> ProjectResponse:
    project = await service.create_project(payload, current_user.id)
    return ProjectResponse.model_validate(project)


@router.get(
    "",
    response_model=ProjectListResponse,
    summary="List the current user's projects",
)
async def list_projects(
    service: ProjectServiceDep,
    current_user: CurrentUserDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ProjectListResponse:
    # service.list_projects now returns list[ProjectResponse] already enriched with counts
    projects, total = await service.list_projects(current_user.id, offset=offset, limit=limit)
    return ProjectListResponse(items=projects, total=total)


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Get a project by ID",
)
async def get_project(
    project_id: uuid.UUID,
    service: ProjectServiceDep,
    current_user: CurrentUserDep,
) -> ProjectResponse:
    project = await service.get_project(project_id, current_user.id)
    return ProjectResponse.model_validate(project)


@router.patch(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Partially update a project",
)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    service: ProjectServiceDep,
    current_user: CurrentUserDep,
) -> ProjectResponse:
    project = await service.update_project(project_id, payload, current_user.id)
    return ProjectResponse.model_validate(project)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a project",
)
async def delete_project(
    project_id: uuid.UUID,
    service: ProjectServiceDep,
    current_user: CurrentUserDep,
) -> None:
    await service.delete_project(project_id, current_user.id)


@router.post(
    "/{project_id}/capture",
    response_model=CaptureConversationResponse,
    status_code=status.HTTP_200_OK,
    summary="Capture a full AI conversation into a project (idempotent)",
)
async def capture_conversation(
    project_id: uuid.UUID,
    payload: CaptureConversationRequest,
    context_service: ContextServiceDep,
    rag_service: RagServiceDep,
    background_tasks: BackgroundTasks,
    current_user: CurrentUserDep,
) -> CaptureConversationResponse:
    # capture_conversation() itself verifies project_id belongs to current_user
    # before writing anything — see app/services/context.py.
    result = await context_service.capture_conversation(project_id, payload, current_user.id)

    # Index into ChromaDB in the background — only for new captures (not idempotent replays)
    if result.created:
        raw_content = {
            "title": payload.title,
            "platform": payload.platform,
            "chat_url": payload.chat_url,
            "messages": [m.model_dump() for m in payload.messages],
            "metadata": payload.metadata or {},
        }
        background_tasks.add_task(
            rag_service.index_context,
            result.context_id,
            result.session_id,
            project_id,
            raw_content,
        )

    return result


@router.post(
    "/{project_id}/query",
    response_model=RagQueryResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask a question about this project's captured conversations (RAG)",
)
async def query_project_contexts(
    project_id: uuid.UUID,
    payload: RagQueryRequest,
    rag_service: RagServiceDep,
    project_service: ProjectServiceDep,
    current_user: CurrentUserDep,
) -> RagQueryResponse:
    # Ownership MUST be validated before RagService is ever called — it's
    # stateless (no DB access) and has no way to check ownership itself, so
    # this is the only place the check can happen. Without it, any caller
    # who knows a project_id could RAG-query another user's captured
    # conversations straight through Ask AI.
    await project_service.get_project(project_id, current_user.id)
    result = await rag_service.query_project(project_id, payload.question)
    return RagQueryResponse(**result)


@router.get(
    "/{project_id}/contexts",
    response_model=ContextListResponse,
    summary="Get all captured contexts for a project (across all sessions)",
)
async def get_project_contexts(
    project_id: uuid.UUID,
    context_service: ContextServiceDep,
    current_user: CurrentUserDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
) -> ContextListResponse:
    contexts, total = await context_service.list_contexts_for_project(
        project_id, current_user.id, offset=offset, limit=limit
    )
    return ContextListResponse(
        items=[ContextResponse.model_validate(c) for c in contexts],
        total=total,
    )
