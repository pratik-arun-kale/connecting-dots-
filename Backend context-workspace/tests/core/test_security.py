"""
tests/core/test_security.py
──────────────────────────────
Unit tests for app/core/security.py — password hashing and JWT helpers.
No DB, no HTTP — pure function tests.
"""
from __future__ import annotations

import uuid

import jwt
import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.core.settings import settings


class TestPasswordHashing:
    def test_hash_is_not_the_plaintext_password(self):
        h = hash_password("correct horse battery staple")
        assert h != "correct horse battery staple"

    def test_verify_succeeds_for_the_correct_password(self):
        h = hash_password("correct horse battery staple")
        assert verify_password("correct horse battery staple", h) is True

    def test_verify_fails_for_a_wrong_password(self):
        h = hash_password("correct horse battery staple")
        assert verify_password("wrong password", h) is False

    def test_verify_never_raises_on_a_malformed_hash(self):
        # A corrupted/garbage hash must be treated as "wrong password", not crash.
        assert verify_password("anything", "not-a-real-argon2-hash") is False

    def test_two_hashes_of_the_same_password_are_different(self):
        # Argon2 salts each hash — this also proves we're not doing naive
        # unsalted hashing.
        h1 = hash_password("same password")
        h2 = hash_password("same password")
        assert h1 != h2
        assert verify_password("same password", h1)
        assert verify_password("same password", h2)


class TestAccessTokens:
    def test_round_trips_the_user_id(self):
        user_id = uuid.uuid4()
        token = create_access_token(user_id)
        payload = decode_access_token(token)
        assert payload["sub"] == str(user_id)

    def test_carries_no_extra_claims_beyond_sub_iat_exp(self):
        token = create_access_token(uuid.uuid4())
        payload = decode_access_token(token)
        assert set(payload.keys()) == {"sub", "iat", "exp"}

    def test_decoding_an_invalid_token_raises(self):
        with pytest.raises(jwt.PyJWTError):
            decode_access_token("not.a.jwt")

    def test_decoding_a_token_signed_with_a_different_key_raises(self):
        token = jwt.encode({"sub": "x"}, "a-completely-different-key", algorithm="HS256")
        with pytest.raises(jwt.PyJWTError):
            decode_access_token(token)

    def test_expired_token_is_rejected(self, monkeypatch):
        monkeypatch.setattr(settings, "jwt_access_token_expire_minutes", -1)
        token = create_access_token(uuid.uuid4())
        with pytest.raises(jwt.ExpiredSignatureError):
            decode_access_token(token)


class TestRefreshTokens:
    def test_generates_a_high_entropy_string(self):
        token = generate_refresh_token()
        assert len(token) >= 64

    def test_two_generated_tokens_are_different(self):
        assert generate_refresh_token() != generate_refresh_token()

    def test_hash_is_deterministic_for_lookup(self):
        token = generate_refresh_token()
        assert hash_refresh_token(token) == hash_refresh_token(token)

    def test_hash_is_not_the_raw_token(self):
        token = generate_refresh_token()
        assert hash_refresh_token(token) != token

    def test_different_tokens_hash_differently(self):
        assert hash_refresh_token(generate_refresh_token()) != hash_refresh_token(generate_refresh_token())
