"""
tests/api/test_auth_cookies.py
───────────────────────────────
Dashboard cookie sessions (`X-Auth-Mode: cookie`): the refresh token is an
httpOnly cookie that never appears in a response body, only the auth routes
read it, and only an allowed Origin can use it. Body mode (the extension) is
covered by test_auth.py and must stay unchanged.

Cookies are sent by hand (a Cookie header) rather than through httpx's jar,
so each test states exactly which cookie a request carries.
"""
from __future__ import annotations

from http.cookies import SimpleCookie

import pytest
from httpx import AsyncClient, Response

from app.core.settings import settings

BASE = "/api/v1/auth"
NAME = settings.auth_cookie_name
ORIGIN = settings.allowed_origins[0]
COOKIE_MODE = {"X-Auth-Mode": "cookie", "Origin": ORIGIN}


def _set_cookie(resp: Response) -> SimpleCookie:
    jar = SimpleCookie()
    for header in resp.headers.get_list("set-cookie"):
        jar.load(header)
    return jar


def _refresh_cookie(resp: Response) -> str:
    jar = _set_cookie(resp)
    assert NAME in jar, f"no {NAME} cookie in {resp.headers.get_list('set-cookie')}"
    return jar[NAME].value


async def _login_cookie_mode(client: AsyncClient, email: str = "cookie@test.com") -> Response:
    reg = await client.post(f"{BASE}/register", json={"email": email, "password": "password123"})
    assert reg.status_code == 201, reg.text
    resp = await client.post(
        f"{BASE}/login", json={"email": email, "password": "password123"}, headers=COOKIE_MODE
    )
    assert resp.status_code == 200, resp.text
    return resp


async def _refresh_with_cookie(client: AsyncClient, value: str, headers: dict | None = None) -> Response:
    client.cookies.clear()
    return await client.post(
        f"{BASE}/refresh",
        headers={**(COOKIE_MODE if headers is None else headers), "Cookie": f"{NAME}={value}"},
    )


@pytest.mark.asyncio
async def test_cookie_mode_login_sets_an_httponly_cookie_and_no_body_token(client: AsyncClient) -> None:
    resp = await _login_cookie_mode(client)
    assert resp.json()["refresh_token"] is None
    assert resp.json()["access_token"]

    morsel = _set_cookie(resp)[NAME]
    assert morsel.value
    assert morsel["httponly"]
    assert morsel["path"] == settings.auth_cookie_path
    assert morsel["samesite"].lower() == settings.auth_cookie_samesite
    assert int(morsel["max-age"]) == settings.jwt_refresh_token_expire_days * 86400


@pytest.mark.asyncio
async def test_cookie_mode_register_also_sets_the_cookie(client: AsyncClient) -> None:
    resp = await client.post(
        f"{BASE}/register", json={"email": "reg@test.com", "password": "password123"}, headers=COOKIE_MODE
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["refresh_token"] is None
    assert _refresh_cookie(resp)


@pytest.mark.asyncio
async def test_refresh_from_the_cookie_rotates_it(client: AsyncClient) -> None:
    first = _refresh_cookie(await _login_cookie_mode(client))

    resp = await _refresh_with_cookie(client, first)
    assert resp.status_code == 200, resp.text
    assert resp.json()["refresh_token"] is None
    second = _refresh_cookie(resp)
    assert second != first

    # The new access token works.
    me = await client.get("/api/v1/projects", headers={"Authorization": f"Bearer {resp.json()['access_token']}"})
    assert me.status_code == 200


@pytest.mark.asyncio
async def test_a_rotated_cookie_cannot_be_used_again(client: AsyncClient, monkeypatch) -> None:
    # After the grace window (see the next test). That reuse also revokes the
    # newer sessions is tested across real commits in
    # tests/services/test_auth_service.py; it can't be seen here, where every
    # request shares one uncommitted transaction.
    monkeypatch.setattr(settings, "auth_refresh_grace_sec", 0)
    first = _refresh_cookie(await _login_cookie_mode(client))
    assert (await _refresh_with_cookie(client, first)).status_code == 200
    assert (await _refresh_with_cookie(client, first)).status_code == 401


@pytest.mark.asyncio
async def test_two_tabs_refreshing_with_the_same_cookie_both_stay_signed_in(client: AsyncClient) -> None:
    first = _refresh_cookie(await _login_cookie_mode(client))
    tab_a = await _refresh_with_cookie(client, first)
    tab_b = await _refresh_with_cookie(client, first)
    assert tab_a.status_code == 200 and tab_b.status_code == 200, (tab_a.text, tab_b.text)
    # Each tab got its own working token.
    a, b = _refresh_cookie(tab_a), _refresh_cookie(tab_b)
    assert a != b
    assert (await _refresh_with_cookie(client, a)).status_code == 200
    assert (await _refresh_with_cookie(client, b)).status_code == 200


@pytest.mark.asyncio
async def test_the_cookie_is_ignored_without_the_cookie_mode_header(client: AsyncClient) -> None:
    """A cross-site form or simple request can carry the cookie but can't add
    a custom header, so without the header the cookie must count for nothing."""
    token = _refresh_cookie(await _login_cookie_mode(client))
    resp = await _refresh_with_cookie(client, token, headers={"Origin": ORIGIN})
    assert resp.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("origin", [None, "https://evil.example", "chrome-extension://abc"])
async def test_cookie_mode_needs_an_allowed_origin(client: AsyncClient, origin: str | None) -> None:
    token = _refresh_cookie(await _login_cookie_mode(client))
    headers = {"X-Auth-Mode": "cookie"}
    if origin:
        headers["Origin"] = origin
    resp = await _refresh_with_cookie(client, token, headers=headers)
    assert resp.status_code == 403

    login = await client.post(
        f"{BASE}/login", json={"email": "cookie@test.com", "password": "password123"}, headers=headers
    )
    assert login.status_code == 403
    assert NAME not in _set_cookie(login)


@pytest.mark.asyncio
async def test_cookie_mode_logout_revokes_and_clears_the_cookie(client: AsyncClient) -> None:
    token = _refresh_cookie(await _login_cookie_mode(client))

    client.cookies.clear()
    resp = await client.post(f"{BASE}/logout", headers={**COOKIE_MODE, "Cookie": f"{NAME}={token}"})
    assert resp.status_code == 204
    cleared = _set_cookie(resp)[NAME]
    assert cleared.value == ""
    assert cleared["path"] == settings.auth_cookie_path

    assert (await _refresh_with_cookie(client, token)).status_code == 401


@pytest.mark.asyncio
async def test_a_body_token_moves_into_a_cookie(client: AsyncClient) -> None:
    """A dashboard that still has a refresh token in localStorage (from before
    cookie sessions) trades it once for a cookie."""
    reg = await client.post(f"{BASE}/register", json={"email": "old@test.com", "password": "password123"})
    legacy = reg.json()["refresh_token"]

    resp = await client.post(f"{BASE}/refresh", json={"refresh_token": legacy}, headers=COOKIE_MODE)
    assert resp.status_code == 200, resp.text
    assert resp.json()["refresh_token"] is None
    assert _refresh_cookie(resp)


@pytest.mark.asyncio
async def test_body_mode_is_unchanged(client: AsyncClient) -> None:
    reg = await client.post(f"{BASE}/register", json={"email": "ext@test.com", "password": "password123"})
    assert reg.json()["refresh_token"]
    assert NAME not in _set_cookie(reg)

    resp = await client.post(f"{BASE}/refresh", json={"refresh_token": reg.json()["refresh_token"]})
    assert resp.status_code == 200
    assert resp.json()["refresh_token"]
    assert NAME not in _set_cookie(resp)


@pytest.mark.asyncio
async def test_refresh_with_no_token_at_all_is_401(client: AsyncClient) -> None:
    client.cookies.clear()
    assert (await client.post(f"{BASE}/refresh")).status_code == 401
    assert (await client.post(f"{BASE}/refresh", headers=COOKIE_MODE)).status_code == 401


@pytest.mark.asyncio
async def test_the_cookie_is_secure_outside_development(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    resp = await _login_cookie_mode(client)
    assert _set_cookie(resp)[NAME]["secure"]


@pytest.mark.asyncio
async def test_cors_lets_the_dashboard_send_the_cookie(client: AsyncClient) -> None:
    resp = await client.options(
        f"{BASE}/refresh",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-auth-mode,content-type",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == ORIGIN
    assert resp.headers["access-control-allow-credentials"] == "true"
    assert "x-auth-mode" in resp.headers["access-control-allow-headers"].lower()


@pytest.mark.asyncio
async def test_cors_preflight_fails_for_another_site(client: AsyncClient) -> None:
    resp = await client.options(
        f"{BASE}/refresh",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-auth-mode",
        },
    )
    assert resp.headers.get("access-control-allow-origin") != "https://evil.example"
