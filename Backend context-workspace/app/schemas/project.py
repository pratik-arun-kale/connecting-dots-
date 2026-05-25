"""
app/schemas/project.py
───────────────────────
Request / Response schemas for the Project resource.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.base import AppBaseModel, JsonDict


# ── Request schemas ───────────────────────────────────────────────────────────

class ProjectCreate(AppBaseModel):
    name: str = Field(..., min_length=1, max_length=255, examples=["My Research Project"])
    description: str | None = Field(None, max_length=5000)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        return v.strip()


class ProjectUpdate(AppBaseModel):
    """All fields optional for PATCH semantics."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=5000)


# ── Response schemas ──────────────────────────────────────────────────────────

class ProjectResponse(AppBaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class ProjectListResponse(AppBaseModel):
    items: list[ProjectResponse]
    total: int
