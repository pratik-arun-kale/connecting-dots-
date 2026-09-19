"""
app/schemas/auth.py
──────────────────────
Request / response schemas for the auth resource (register/login/refresh/
logout). Plain JSON bodies throughout — not OAuth2's form-encoded
username/password — to stay consistent with the rest of this JSON-only API.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import EmailStr, Field

from app.schemas.base import AppBaseModel


# ── Requests ───────────────────────────────────────────────────────────────────

class RegisterRequest(AppBaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=256)


class LoginRequest(AppBaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=256)


class RefreshRequest(AppBaseModel):
    refresh_token: str


class LogoutRequest(AppBaseModel):
    refresh_token: str


# ── Responses ──────────────────────────────────────────────────────────────────

class UserResponse(AppBaseModel):
    id: uuid.UUID
    email: str
    is_active: bool
    created_at: datetime
    # Deliberately no password_hash field — never serialize it, ever.


class TokenPairResponse(AppBaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # access token TTL in seconds, for client-side refresh scheduling
    user: UserResponse
