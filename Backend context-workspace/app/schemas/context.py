"""
app/schemas/context.py
───────────────────────
Request / Response schemas for the Context resource.

raw_content and structured_content are kept as separate fields to reflect
the two-stage processing pipeline: capture first, AI extraction later.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import Field, field_validator, model_validator

from app.schemas.base import AppBaseModel, JsonDict


# ── Request schemas ───────────────────────────────────────────────────────────

class ContextCapture(AppBaseModel):
    """Payload sent by the Chrome extension when the user clicks 'Capture Context'."""

    session_id: uuid.UUID
    platform: str = Field(..., description="Source platform (chatgpt, claude, gemini)")
    url: str = Field(..., max_length=2048, description="Current tab URL at time of capture")
    raw_content: JsonDict = Field(..., description="Extracted conversation JSON")

    @field_validator("raw_content")
    @classmethod
    def _validate_non_empty(cls, v: JsonDict) -> JsonDict:
        if not v:
            raise ValueError("raw_content must not be empty.")
        return v


class ContextCreate(AppBaseModel):
    session_id: uuid.UUID
    raw_content: JsonDict = Field(
        ...,
        description="Verbatim captured payload (text, URL, screenshot metadata, …).",
        examples=[{"type": "text", "body": "How does RAG work?", "url": "https://chat.openai.com"}],
    )
    structured_content: JsonDict | None = Field(
        None,
        description="Pre-parsed content, if available at capture time. "
                    "Normally populated later by the AI pipeline.",
    )
    tags: list[str] | None = Field(None, max_length=50)
    metadata: JsonDict | None = Field(
        None,
        description="Arbitrary extension key-value pairs (browser info, capture version, …).",
    )

    @model_validator(mode="after")
    def _validate_raw_content_non_empty(self) -> "ContextCreate":
        if not self.raw_content:
            raise ValueError("raw_content must not be empty.")
        return self


# ── Response schemas ──────────────────────────────────────────────────────────

class ContextResponse(AppBaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    raw_content: JsonDict
    structured_content: JsonDict | None
    tags: list[str] | None
    # validation_alias (not alias) so ORM attribute "metadata_" is read correctly
    # but the JSON output key remains "metadata" (FastAPI uses by_alias=True).
    metadata: JsonDict | None = Field(None, validation_alias="metadata_")
    created_at: datetime

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class ContextListResponse(AppBaseModel):
    items: list[ContextResponse]
    total: int
