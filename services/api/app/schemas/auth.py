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
    # 10+ for new accounts; LoginRequest stays at 1 so older, shorter
    # passwords can still sign in.
    password: str = Field(..., min_length=10, max_length=256)


class LoginRequest(AppBaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=256)


# refresh_token is optional on refresh/logout: the dashboard sends it in an
# httpOnly cookie instead (see app/api/v1/routes/auth.py).
class RefreshRequest(AppBaseModel):
    refresh_token: str | None = None


class LogoutRequest(AppBaseModel):
    refresh_token: str | None = None


# ── Responses ──────────────────────────────────────────────────────────────────

class UserResponse(AppBaseModel):
    id: uuid.UUID
    email: str
    is_active: bool
    created_at: datetime
    # Deliberately no password_hash field — never serialize it, ever.


class TokenPairResponse(AppBaseModel):
    access_token: str
    # None when the refresh token was set as a cookie (dashboard) instead.
    refresh_token: str | None
    token_type: str = "bearer"
    expires_in: int  # access token TTL in seconds, for client-side refresh scheduling
    user: UserResponse
