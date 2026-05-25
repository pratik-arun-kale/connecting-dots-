"""
app/schemas/session.py
───────────────────────
Request / Response schemas for the Session resource.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.base import AppBaseModel

# Mirror the allowed values from the model — kept in sync manually.
SourcePlatformLiteral = Literal["chatgpt", "claude", "gemini", "docs", "unknown"]

# URLs must belong to a known AI platform. chrome-extension:// and localhost
# are explicitly excluded — linked_url is the live session URL, not the
# extension origin.
_ALLOWED_URL_RE = re.compile(
    r"^https://(chat\.openai\.com|claude\.ai|gemini\.google\.com)/"
)


# ── Request schemas ───────────────────────────────────────────────────────────

class SessionCreate(AppBaseModel):
    project_id: uuid.UUID
    source_platform: SourcePlatformLiteral = "unknown"
    title: str | None = Field(None, max_length=500)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str | None) -> str | None:
        return v.strip() if v else None


class LinkSessionRequest(AppBaseModel):
    url: str = Field(..., max_length=2048)

    @field_validator("url")
    @classmethod
    def _validate_platform_url(cls, v: str) -> str:
        if not _ALLOWED_URL_RE.match(v):
            raise ValueError(
                "url must be a valid https URL on chat.openai.com, claude.ai, or gemini.google.com"
            )
        return v


# ── Response schemas ──────────────────────────────────────────────────────────

class SessionResponse(AppBaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    source_platform: str
    title: str | None
    tab_url: str | None
    linked_url: str | None
    link_status: str
    linked_at: datetime | None
    created_at: datetime


class SessionListResponse(AppBaseModel):
    items: list[SessionResponse]
    total: int
