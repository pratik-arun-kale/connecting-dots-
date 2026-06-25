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

from app.dependencies import ContextServiceDep, ProjectServiceDep, RagServiceDep, SessionServiceDep
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
) -> CreateProjectWithSessionsResponse:
    project = await project_service.create_project(ProjectCreate(name=payload.name))
    sessions = []
    for platform in payload.platforms:
        # create_or_get_session is idempotent: returns (session, created_bool)
        session, _ = await session_service.create_or_get_session(
            SessionCreate(project_id=project.id, source_platform=platform)
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
) -> ProjectResponse:
    project = await service.create_project(payload)
    return ProjectResponse.model_validate(project)


@router.get(
    "",
    response_model=ProjectListResponse,
    summary="List all projects",
)
async def list_projects(
    service: ProjectServiceDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ProjectListResponse:
    # service.list_projects now returns list[ProjectResponse] already enriched with counts
    projects, total = await service.list_projects(offset=offset, limit=limit)
    return ProjectListResponse(items=projects, total=total)


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    summary="Get a project by ID",
)
async def get_project(
    project_id: uuid.UUID,
    service: ProjectServiceDep,
) -> ProjectResponse:
    project = await service.get_project(project_id)
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
) -> ProjectResponse:
    project = await service.update_project(project_id, payload)
    return ProjectResponse.model_validate(project)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a project",
)
async def delete_project(
    project_id: uuid.UUID,
    service: ProjectServiceDep,
) -> None:
    await service.delete_project(project_id)


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
) -> CaptureConversationResponse:
    result = await context_service.capture_conversation(project_id, payload)

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
) -> RagQueryResponse:
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
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
) -> ContextListResponse:
    contexts, total = await context_service.list_contexts_for_project(
        project_id, offset=offset, limit=limit
    )
    return ContextListResponse(
        items=[ContextResponse.model_validate(c) for c in contexts],
        total=total,
    )
