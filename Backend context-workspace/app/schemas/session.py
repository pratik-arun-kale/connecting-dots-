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

SourcePlatformLiteral = Literal["chatgpt", "claude", "gemini", "unknown"]

_ALLOWED_URL_RE = re.compile(
    r"^https://(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com)/"
)

FailureReasonLiteral = Literal[
    "auth_required",
    "ui_timeout",
    "bootstrap_failed",
    "url_timeout",
    "link_conflict",
    "backend_error",
    "tab_closed",
    "provider_error",
]

SessionStateLiteral = Literal[
    "pending",
    "creating_tab",
    "waiting_for_ui",
    "injecting_bootstrap",
    "waiting_for_url",
    "linking",
    "completed",
    "failed",
]


# ── Request schemas ───────────────────────────────────────────────────────────

class SessionCreate(AppBaseModel):
    project_id: uuid.UUID
    source_platform: SourcePlatformLiteral = "unknown"
    bootstrap_message: str | None = Field(None, max_length=2000)

    @field_validator("bootstrap_message")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() if v else None


class LinkSessionRequest(AppBaseModel):
    url: str = Field(..., max_length=2048)

    @field_validator("url")
    @classmethod
    def _validate_platform_url(cls, v: str) -> str:
        if not _ALLOWED_URL_RE.match(v):
            raise ValueError(
                "url must be a valid https URL on chatgpt.com, chat.openai.com, claude.ai, or gemini.google.com"
            )
        return v


class SessionStateUpdate(AppBaseModel):
    """Extension → Backend: report an FSM state transition."""
    state: Literal[
        "creating_tab",
        "waiting_for_ui",
        "injecting_bootstrap",
        "waiting_for_url",
        "linking",
    ]


class SessionFailureRequest(AppBaseModel):
    """Extension → Backend: report terminal failure."""
    reason: FailureReasonLiteral
    detail: str | None = Field(None, max_length=500)


# ── Response schemas ──────────────────────────────────────────────────────────

class SessionResponse(AppBaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    source_platform: str
    session_state: str
    bootstrap_message: str | None
    attempt: int
    linked_url: str | None
    link_status: str
    linked_at: datetime | None
    failed_at: datetime | None
    failure_reason: str | None
    created_at: datetime


class SessionListResponse(AppBaseModel):
    items: list[SessionResponse]
    total: int
