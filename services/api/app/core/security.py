"""
app/core/security.py
──────────────────────
Password hashing and JWT access-token helpers. No custom cryptography here —
every primitive is a well-known, actively-maintained library used as intended.

Password hashing: argon2-cffi's own PasswordHasher (Argon2id, the library's
default variant), not passlib (maintenance-only) and not hand-rolled hashing.
verify_password() is constant-time through argon2-cffi itself.

Access tokens: PyJWT, HS256, signed with settings.jwt_secret_key (no default —
see settings.py). Carries only `sub` (user id) and `exp` — no PII, no roles,
nothing an attacker would want if a token leaked into a log by accident.

Refresh tokens are NOT handled here — they're opaque random strings (not JWTs)
generated and hashed in app/services/auth.py, since they're a database-backed
credential (see AuthSession), not a signed/verified token.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.settings import settings

_hasher = PasswordHasher()  # Argon2id with the library's vetted default parameters

JWT_ALGORITHM = "HS256"


# ── Passwords ─────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time verification via argon2-cffi. Never raises — a wrong
    password (VerificationError, covering VerifyMismatchError) and a
    genuinely malformed/corrupted hash (InvalidHashError, which argon2-cffi
    raises as a bare ValueError subclass, not a VerificationError) are both
    just "not a match" as far as callers are concerned (see
    AuthService.authenticate)."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


# ── Access tokens (JWT) ────────────────────────────────────────────────────────

def create_access_token(user_id: uuid.UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Raises jwt.PyJWTError (or a subclass) on any invalid/expired token —
    callers (app.dependencies.get_current_user) catch this and turn it into
    a 401, never a 500."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[JWT_ALGORITHM])


# ── Refresh tokens (opaque, not JWTs) ──────────────────────────────────────────
# High-entropy random strings, not signed/decodable tokens — the server is
# the only party that can turn one back into a user, by looking up its hash.
# A fast hash (SHA-256) is the right tool here, unlike for passwords: the
# input is already ~256 bits of randomness, not a short, guessable secret, so
# there's nothing for a slow KDF to protect against that the entropy alone
# doesn't already provide — and a fast hash keeps the DB lookup cheap.

def generate_refresh_token() -> str:
    return secrets.token_urlsafe(64)


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
