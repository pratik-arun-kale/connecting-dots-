"""
tests/api/test_auth.py
─────────────────────────
Integration tests for /api/v1/auth endpoints.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

BASE = "/api/v1/auth"


async def _register(client: AsyncClient, email: str = "user@test.com", password: str = "password123") -> dict:
    resp = await client.post(f"{BASE}/register", json={"email": email, "password": password})
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Register ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_returns_a_token_pair(client: AsyncClient) -> None:
    data = await _register(client)
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "user@test.com"


@pytest.mark.asyncio
async def test_register_response_never_includes_password_hash(client: AsyncClient) -> None:
    data = await _register(client)
    assert "password_hash" not in data["user"]
    assert "password" not in data["user"]


@pytest.mark.asyncio
async def test_register_rejects_a_password_under_8_characters(client: AsyncClient) -> None:
    resp = await client.post(f"{BASE}/register", json={"email": "short@test.com", "password": "short"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_rejects_an_invalid_email(client: AsyncClient) -> None:
    resp = await client.post(f"{BASE}/register", json={"email": "not-an-email", "password": "password123"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_rejects_a_duplicate_email(client: AsyncClient) -> None:
    await _register(client, email="dup@test.com")
    resp = await client.post(f"{BASE}/register", json={"email": "dup@test.com", "password": "password456"})
    assert resp.status_code == 409


# ── Login ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_with_correct_credentials_returns_a_token_pair(client: AsyncClient) -> None:
    await _register(client, email="login@test.com", password="correctpassword")
    resp = await client.post(f"{BASE}/login", json={"email": "login@test.com", "password": "correctpassword"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_login_with_wrong_password_returns_401(client: AsyncClient) -> None:
    await _register(client, email="login2@test.com", password="correctpassword")
    resp = await client.post(f"{BASE}/login", json={"email": "login2@test.com", "password": "wrongpassword"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_with_nonexistent_email_returns_401_with_the_same_message(client: AsyncClient) -> None:
    wrong_pw = await client.post(f"{BASE}/login", json={"email": "login2@test.com", "password": "irrelevant"})
    nonexistent = await client.post(
        f"{BASE}/login", json={"email": "totally-unknown@test.com", "password": "irrelevant"}
    )
    assert wrong_pw.status_code == nonexistent.status_code == 401
    assert wrong_pw.json()["error"]["message"] == nonexistent.json()["error"]["message"]


@pytest.mark.asyncio
async def test_login_is_case_insensitive_on_email(client: AsyncClient) -> None:
    await _register(client, email="casetest@test.com", password="password123")
    resp = await client.post(f"{BASE}/login", json={"email": "CaseTest@Test.com", "password": "password123"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_login_rejects_an_inactive_user(client: AsyncClient, db_session) -> None:
    from app.repositories.user import UserRepository

    await _register(client, email="inactive@test.com", password="password123")
    user = await UserRepository(db_session).get_by_email("inactive@test.com")
    await UserRepository(db_session).update(user, is_active=False)

    resp = await client.post(f"{BASE}/login", json={"email": "inactive@test.com", "password": "password123"})
    assert resp.status_code == 403


# ── Refresh ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_returns_a_new_token_pair(client: AsyncClient) -> None:
    data = await _register(client)
    resp = await client.post(f"{BASE}/refresh", json={"refresh_token": data["refresh_token"]})
    assert resp.status_code == 200
    new_data = resp.json()
    assert new_data["refresh_token"] != data["refresh_token"]


@pytest.mark.asyncio
async def test_refresh_rejects_an_unknown_token(client: AsyncClient) -> None:
    resp = await client.post(f"{BASE}/refresh", json={"refresh_token": "not-a-real-token"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_new_access_token_from_refresh_authorizes_requests(client: AsyncClient) -> None:
    data = await _register(client)
    refreshed = (await client.post(f"{BASE}/refresh", json={"refresh_token": data["refresh_token"]})).json()

    client.headers["Authorization"] = f"Bearer {refreshed['access_token']}"
    resp = await client.get("/api/v1/projects")
    assert resp.status_code == 200


# ── Logout ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_revokes_the_refresh_token(client: AsyncClient) -> None:
    data = await _register(client)
    logout_resp = await client.post(f"{BASE}/logout", json={"refresh_token": data["refresh_token"]})
    assert logout_resp.status_code == 204

    reuse_resp = await client.post(f"{BASE}/refresh", json={"refresh_token": data["refresh_token"]})
    assert reuse_resp.status_code == 401


@pytest.mark.asyncio
async def test_logout_with_an_unknown_token_is_idempotent(client: AsyncClient) -> None:
    resp = await client.post(f"{BASE}/logout", json={"refresh_token": "never-issued"})
    assert resp.status_code == 204


# ── Logout-all ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_all_requires_authentication(client: AsyncClient) -> None:
    resp = await client.post(f"{BASE}/logout-all")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout_all_revokes_every_session(authenticated_client: AsyncClient) -> None:
    # A second login for the SAME fixture user creates a sibling session.
    data = await authenticated_client.post(
        f"{BASE}/login", json={"email": "fixture-user@test.com", "password": "fixture-password-123"}
    )
    second_refresh = data.json()["refresh_token"]

    logout_all_resp = await authenticated_client.post(f"{BASE}/logout-all")
    assert logout_all_resp.status_code == 204

    reuse_resp = await authenticated_client.post(f"{BASE}/refresh", json={"refresh_token": second_refresh})
    assert reuse_resp.status_code == 401


# ── Protected-endpoint access-token edge cases ─────────────────────────────────

@pytest.mark.asyncio
async def test_missing_access_token_is_rejected(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/projects")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_malformed_access_token_is_rejected(client: AsyncClient) -> None:
    client.headers["Authorization"] = "Bearer not-a-real-jwt"
    resp = await client.get("/api/v1/projects")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_access_token_signed_with_a_wrong_secret_is_rejected(client: AsyncClient) -> None:
    import jwt as pyjwt

    forged = pyjwt.encode({"sub": "00000000-0000-0000-0000-000000000000"}, "wrong-secret", algorithm="HS256")
    client.headers["Authorization"] = f"Bearer {forged}"
    resp = await client.get("/api/v1/projects")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_expired_access_token_is_rejected(client: AsyncClient, monkeypatch) -> None:
    from app.core import security as security_module

    monkeypatch.setattr(security_module.settings, "jwt_access_token_expire_minutes", -1)
    data = await _register(client, email="expiredtoken@test.com")

    client.headers["Authorization"] = f"Bearer {data['access_token']}"
    resp = await client.get("/api/v1/projects")
    assert resp.status_code == 401
