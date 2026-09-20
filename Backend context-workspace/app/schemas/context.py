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
    metadata: JsonDict | None = Field(None, validation_alias="metadata_")
    created_at: datetime
    updated_at: datetime | None = None
    # Promoted fields — populated by the capture pipeline
    title:         str | None = None
    platform:      str | None = None
    chat_url:      str | None = None
    messages_count: int = 0
    # Notebook fields (0008) — see app/models/context.py for what each means
    content_md:  str | None = None
    source:      str | None = None
    page_title:  str | None = None
    prompt_text: str | None = None
    user_note:   str | None = None
    kind:        str = "captured"
    chapter_id:  uuid.UUID | None = None

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class ContextListResponse(AppBaseModel):
    items: list[ContextResponse]
    total: int


class NoteUpdateRequest(AppBaseModel):
    """PATCH /contexts/{id} — the only two things a reader can change after
    capture: their own annotation, or (for a "written" note only) the body
    itself. Editing a captured passage's content_md is deliberately not
    supported here — captures are meant to stay a faithful record of what
    was actually said; annotate instead via user_note."""

    user_note: str | None = Field(default=None, max_length=20_000)
    content_md: str | None = Field(default=None, max_length=100_000)

    @model_validator(mode="after")
    def _require_at_least_one_field(self) -> "NoteUpdateRequest":
        # model_fields_set (not "is None") so PATCHing user_note explicitly
        # to null — clearing an annotation — isn't mistaken for "nothing sent".
        if not self.model_fields_set:
            raise ValueError("Provide at least one of user_note or content_md.")
        return self
