"""
tests/api/test_account_email.py
────────────────────────────────
Email verification and password reset, end to end through the API, with
the `sent_emails` fake standing in for Resend (see conftest.py).
"""
from __future__ import annotations

import re

import pytest
from httpx import AsyncClient

from app.core.rate_limit import _buckets as rate_limit_buckets
from app.core.settings import settings
from app.services.email import EmailMessage

BASE = "/api/v1/auth"
PASSWORD = "first-password-1"


def _token(message: EmailMessage, path: str) -> str:
    match = re.search(rf"{re.escape(settings.dashboard_url.rstrip('/'))}{path}\?token=([\w-]+)", message.text)
    assert match, f"no {path} link in: {message.text}"
    assert match.group(0) in message.html  # same link in both parts
    return match.group(1)


async def _register(client: AsyncClient, email: str = "mail@test.com") -> dict:
    resp = await client.post(f"{BASE}/register", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Verification ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_sends_a_verification_link_and_starts_unverified(
    client: AsyncClient, sent_emails: list
) -> None:
    data = await _register(client)
    assert data["user"]["email_verified_at"] is None
    assert len(sent_emails) == 1
    assert sent_emails[0].to == "mail@test.com"
    _token(sent_emails[0], "/verify-email")


@pytest.mark.asyncio
async def test_the_link_verifies_the_email_once(client: AsyncClient, sent_emails: list) -> None:
    await _register(client)
    token = _token(sent_emails[0], "/verify-email")

    resp = await client.post(f"{BASE}/verify-email", json={"token": token})
    assert resp.status_code == 200, resp.text
    assert resp.json()["email_verified_at"] is not None

    again = await client.post(f"{BASE}/verify-email", json={"token": token})
    assert again.status_code == 422

    login = await client.post(f"{BASE}/login", json={"email": "mail@test.com", "password": PASSWORD})
    assert login.json()["user"]["email_verified_at"] is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("token", ["not-a-real-token", "x" * 200])
async def test_an_unknown_token_is_rejected(client: AsyncClient, token: str) -> None:
    resp = await client.post(f"{BASE}/verify-email", json={"token": token})
    assert resp.status_code == 422
    assert "invalid or has expired" in resp.json()["error"]["message"]


@pytest.mark.asyncio
async def test_asking_again_sends_a_new_link_and_voids_the_old_one(client: AsyncClient, sent_emails: list) -> None:
    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    old = _token(sent_emails[0], "/verify-email")

    resp = await client.post(f"{BASE}/verify-email/request", headers=headers)
    assert resp.status_code == 204
    assert len(sent_emails) == 2
    new = _token(sent_emails[1], "/verify-email")

    assert (await client.post(f"{BASE}/verify-email", json={"token": old})).status_code == 422
    assert (await client.post(f"{BASE}/verify-email", json={"token": new})).status_code == 200

    # Already verified: nothing more is sent.
    assert (await client.post(f"{BASE}/verify-email/request", headers=headers)).status_code == 204
    assert len(sent_emails) == 2


@pytest.mark.asyncio
async def test_asking_for_verification_needs_sign_in_and_is_rate_limited(
    client: AsyncClient, sent_emails: list
) -> None:
    assert (await client.post(f"{BASE}/verify-email/request")).status_code == 401

    data = await _register(client)
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    for _ in range(3):
        assert (await client.post(f"{BASE}/verify-email/request", headers=headers)).status_code == 204
    assert (await client.post(f"{BASE}/verify-email/request", headers=headers)).status_code == 429


@pytest.mark.asyncio
async def test_an_expired_verification_link_is_rejected(
    client: AsyncClient, sent_emails: list, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "email_verify_token_hours", -1)
    await _register(client)
    token = _token(sent_emails[0], "/verify-email")
    assert (await client.post(f"{BASE}/verify-email", json={"token": token})).status_code == 422


# ── Password reset ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reset_gives_the_same_answer_for_unknown_addresses(client: AsyncClient, sent_emails: list) -> None:
    resp = await client.post(f"{BASE}/password-reset", json={"email": "nobody@test.com"})
    assert resp.status_code == 202
    assert resp.content == b""
    assert sent_emails == []


@pytest.mark.asyncio
async def test_reset_sets_a_new_password_and_signs_out_everywhere(client: AsyncClient, sent_emails: list) -> None:
    data = await _register(client)
    old_refresh = data["refresh_token"]

    resp = await client.post(f"{BASE}/password-reset", json={"email": "  MAIL@test.com "})
    assert resp.status_code == 202
    assert sent_emails[-1].to == "mail@test.com"
    token = _token(sent_emails[-1], "/reset-password")

    done = await client.post(
        f"{BASE}/password-reset/confirm", json={"token": token, "new_password": "second-password-2"}
    )
    assert done.status_code == 204, done.text

    old_login = await client.post(f"{BASE}/login", json={"email": "mail@test.com", "password": PASSWORD})
    assert old_login.status_code == 401
    new_login = await client.post(f"{BASE}/login", json={"email": "mail@test.com", "password": "second-password-2"})
    assert new_login.status_code == 200
    # The link proved the address, so it's verified now too.
    assert new_login.json()["user"]["email_verified_at"] is not None

    # Every session from before the reset is gone.
    assert (await client.post(f"{BASE}/refresh", json={"refresh_token": old_refresh})).status_code == 401

    # And the link is spent.
    again = await client.post(
        f"{BASE}/password-reset/confirm", json={"token": token, "new_password": "third-password-3"}
    )
    assert again.status_code == 422


@pytest.mark.asyncio
async def test_only_the_newest_reset_link_works(client: AsyncClient, sent_emails: list) -> None:
    await _register(client)
    await client.post(f"{BASE}/password-reset", json={"email": "mail@test.com"})
    await client.post(f"{BASE}/password-reset", json={"email": "mail@test.com"})
    first, second = (_token(m, "/reset-password") for m in sent_emails[-2:])

    body = {"new_password": "second-password-2"}
    assert (await client.post(f"{BASE}/password-reset/confirm", json={**body, "token": first})).status_code == 422
    assert (await client.post(f"{BASE}/password-reset/confirm", json={**body, "token": second})).status_code == 204


@pytest.mark.asyncio
async def test_tokens_only_work_for_their_own_purpose(client: AsyncClient, sent_emails: list) -> None:
    await _register(client)
    verify = _token(sent_emails[0], "/verify-email")
    await client.post(f"{BASE}/password-reset", json={"email": "mail@test.com"})
    reset = _token(sent_emails[-1], "/reset-password")

    as_reset = await client.post(
        f"{BASE}/password-reset/confirm", json={"token": verify, "new_password": "second-password-2"}
    )
    assert as_reset.status_code == 422
    assert (await client.post(f"{BASE}/verify-email", json={"token": reset})).status_code == 422


@pytest.mark.asyncio
async def test_an_expired_reset_link_is_rejected(client: AsyncClient, sent_emails: list, monkeypatch) -> None:
    await _register(client)
    monkeypatch.setattr(settings, "password_reset_token_minutes", -1)
    await client.post(f"{BASE}/password-reset", json={"email": "mail@test.com"})
    token = _token(sent_emails[-1], "/reset-password")
    resp = await client.post(
        f"{BASE}/password-reset/confirm", json={"token": token, "new_password": "second-password-2"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_the_new_password_must_be_at_least_10_characters(client: AsyncClient, sent_emails: list) -> None:
    await _register(client)
    await client.post(f"{BASE}/password-reset", json={"email": "mail@test.com"})
    token = _token(sent_emails[-1], "/reset-password")
    resp = await client.post(f"{BASE}/password-reset/confirm", json={"token": token, "new_password": "short"})
    assert resp.status_code == 422
    # A rejected attempt doesn't spend the link.
    ok = await client.post(
        f"{BASE}/password-reset/confirm", json={"token": token, "new_password": "long-enough-1"}
    )
    assert ok.status_code == 204


@pytest.mark.asyncio
async def test_one_address_gets_at_most_three_reset_emails_an_hour(client: AsyncClient, sent_emails: list) -> None:
    """Limited per address (from any IP) as well as per IP, and the same for
    unknown addresses, so the 429 doesn't reveal anything either."""
    for email in ("mail@test.com", "nobody@test.com"):
        rate_limit_buckets.clear()  # keep the per-IP limit (5/h) out of this
        for _ in range(3):
            assert (await client.post(f"{BASE}/password-reset", json={"email": email})).status_code == 202
        assert (await client.post(f"{BASE}/password-reset", json={"email": email})).status_code == 429
