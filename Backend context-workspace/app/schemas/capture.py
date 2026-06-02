"""
app/schemas/capture.py
───────────────────────
Request / Response schemas for the POST /projects/{id}/capture endpoint.

This is the primary ingest path for the Chrome extension.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import Field, field_validator

from app.schemas.base import AppBaseModel


class CapturedMessage(AppBaseModel):
    role:      Literal["user", "assistant", "system"]
    content:   str = Field(..., max_length=50_000)
    timestamp: str | None = None
    index:     int = 0


class CaptureConversationRequest(AppBaseModel):
    """Full conversation payload sent by the Chrome extension."""

    idempotency_key: str = Field(..., min_length=8, max_length=64)
    platform: str         = Field(..., description="chatgpt | claude | gemini | perplexity")
    chat_url: str         = Field(..., max_length=2048)
    captured_at: datetime
    title: str            = Field(default="Untitled Conversation", max_length=512)
    messages: list[CapturedMessage] = Field(..., max_length=500)
    metadata: dict[str, Any] | None = None

    @field_validator("messages")
    @classmethod
    def _require_messages(cls, v: list[CapturedMessage]) -> list[CapturedMessage]:
        if not v:
            raise ValueError("messages must not be empty.")
        return v

    @field_validator("platform")
    @classmethod
    def _validate_platform(cls, v: str) -> str:
        allowed = {"chatgpt", "claude", "gemini", "perplexity", "unknown"}
        if v not in allowed:
            raise ValueError(f"platform must be one of {allowed}")
        return v


class CaptureConversationResponse(AppBaseModel):
    context_id:     uuid.UUID
    session_id:     uuid.UUID
    title:          str
    messages_count: int
    platform:       str
    chat_url:       str
    captured_at:    datetime
    created:        bool  # False = idempotent replay (same key seen before)
