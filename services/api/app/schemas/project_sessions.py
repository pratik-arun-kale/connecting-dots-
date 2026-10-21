"""
app/schemas/project_sessions.py
─────────────────────────────────
Schemas for the create-with-sessions composite endpoint.
Kept in a separate file to avoid circular imports between project and session schemas.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator

from app.schemas.base import AppBaseModel
from app.schemas.project import ProjectResponse
from app.schemas.session import SessionResponse

Platform = Literal["chatgpt", "claude", "gemini"]


class CreateProjectWithSessionsRequest(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255, examples=["RAG Project"])
    platforms: list[Platform] = Field(..., min_length=1, description="AI platforms to open sessions for")

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("platforms")
    @classmethod
    def _unique_platforms(cls, v: list[Platform]) -> list[Platform]:
        return list(dict.fromkeys(v))  # deduplicate while preserving order


class CreateProjectWithSessionsResponse(AppBaseModel):
    project: ProjectResponse
    sessions: list[SessionResponse]
