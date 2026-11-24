"""
tests/api/test_client_ip.py
────────────────────────────
Which address the per-IP limits count against (app.core.rate_limit.client_ip):
a made-up X-Forwarded-For or X-Client-IP never moves a caller into a fresh
bucket, while real clients behind a proxy still get buckets of their own.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from starlette.requests import Request

from app.core.rate_limit import client_ip
from app.core.settings import settings

API = "/api/v1"
SECRET = "s" * 40
LOGIN_LIMIT = 10  # auth/login: 10 attempts per 15 minutes per address


def _request(headers: dict[str, str] | list[tuple[str, str]], peer: str = "10.0.0.1") -> Request:
    items = headers.items() if isinstance(headers, dict) else headers
    return Request({
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in items],
        "client": (peer, 1234),
    })


class TestClientIp:
    def test_no_proxies_uses_the_peer_and_ignores_forwarded_for(self, monkeypatch):
        monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
        assert client_ip(_request({"X-Forwarded-For": "1.2.3.4"})) == "10.0.0.1"

    def test_one_proxy_takes_the_entry_it_appended(self, monkeypatch):
        monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
        # The caller wrote "6.6.6.6"; the proxy appended the real address.
        assert client_ip(_request({"X-Forwarded-For": "6.6.6.6, 203.0.113.7"})) == "203.0.113.7"
        assert client_ip(_request({"X-Forwarded-For": "203.0.113.7"})) == "203.0.113.7"

    def test_two_proxies_count_from_the_right(self, monkeypatch):
        monkeypatch.setattr(settings, "trusted_proxy_hops", 2)
        req = _request({"X-Forwarded-For": "6.6.6.6, 203.0.113.7, 198.51.100.2"})
        assert client_ip(req) == "203.0.113.7"

    def test_repeated_headers_are_one_list(self, monkeypatch):
        monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
        req = _request([("X-Forwarded-For", "6.6.6.6"), ("X-Forwarded-For", "203.0.113.7")])
        assert client_ip(req) == "203.0.113.7"

    @pytest.mark.parametrize("header", [None, "", "not-an-ip", "6.6.6.6, garbage"])
    def test_missing_or_bad_forwarded_for_falls_back_to_the_peer(self, monkeypatch, header):
        monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
        headers = {} if header is None else {"X-Forwarded-For": header}
        assert client_ip(_request(headers)) == "10.0.0.1"

    def test_fewer_entries_than_proxies_falls_back_to_the_peer(self, monkeypatch):
        monkeypatch.setattr(settings, "trusted_proxy_hops", 2)
        assert client_ip(_request({"X-Forwarded-For": "6.6.6.6"})) == "10.0.0.1"

    def test_ipv6_is_normalised(self, monkeypatch):
        monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
        req = _request({"X-Forwarded-For": "2001:DB8:0:0::1"})
        assert client_ip(req) == "2001:db8::1"

    def test_dashboard_proxy_with_the_secret_reports_the_browser(self, monkeypatch):
        monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
        monkeypatch.setattr(settings, "proxy_shared_secret", SECRET)
        req = _request({
            "X-Proxy-Secret": SECRET,
            "X-Client-IP": "203.0.113.7",
            "X-Forwarded-For": "76.76.21.21",  # the proxy's own address
        })
        assert client_ip(req) == "203.0.113.7"

    @pytest.mark.parametrize("sent", [None, "", "wrong", SECRET + "x"])
    def test_client_ip_without_the_right_secret_is_ignored(self, monkeypatch, sent):
        monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
        monkeypatch.setattr(settings, "proxy_shared_secret", SECRET)
        headers = {"X-Client-IP": "6.6.6.6", "X-Forwarded-For": "203.0.113.7"}
        if sent is not None:
            headers["X-Proxy-Secret"] = sent
        assert client_ip(_request(headers)) == "203.0.113.7"

    def test_client_ip_is_ignored_when_no_secret_is_configured(self, monkeypatch):
        monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
        monkeypatch.setattr(settings, "proxy_shared_secret", None)
        req = _request({"X-Proxy-Secret": "", "X-Client-IP": "6.6.6.6"})
        assert client_ip(req) == "10.0.0.1"

    def test_secret_with_a_bad_client_ip_falls_through(self, monkeypatch):
        monkeypatch.setattr(settings, "trusted_proxy_hops", 0)
        monkeypatch.setattr(settings, "proxy_shared_secret", SECRET)
        req = _request({"X-Proxy-Secret": SECRET, "X-Client-IP": "nonsense"})
        assert client_ip(req) == "10.0.0.1"


class TestSecretSetting:
    def test_short_secret_is_refused(self):
        from app.core.settings import Settings

        with pytest.raises(ValueError, match="at least 32"):
            Settings(proxy_shared_secret="short", jwt_secret_key="k" * 64)

    def test_empty_secret_means_unset(self):
        from app.core.settings import Settings

        assert Settings(proxy_shared_secret="", jwt_secret_key="k" * 64).proxy_shared_secret is None


async def _failed_login(client: AsyncClient, headers: dict[str, str]) -> int:
    resp = await client.post(
        f"{API}/auth/login",
        json={"email": "nobody@example.com", "password": "wrong-password-123"},
        headers=headers,
    )
    return resp.status_code


@pytest.mark.asyncio
async def test_spoofed_forwarded_for_does_not_reset_the_login_limit(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    real = "203.0.113.7"
    for i in range(LOGIN_LIMIT):
        # A different made-up address every time; the proxy's entry stays put.
        assert await _failed_login(client, {"X-Forwarded-For": f"6.6.6.{i}, {real}"}) == 401
    assert await _failed_login(client, {"X-Forwarded-For": f"9.9.9.9, {real}"}) == 429


@pytest.mark.asyncio
async def test_two_clients_behind_the_proxy_get_their_own_limits(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    for _ in range(LOGIN_LIMIT):
        assert await _failed_login(client, {"X-Forwarded-For": "203.0.113.7"}) == 401
    assert await _failed_login(client, {"X-Forwarded-For": "203.0.113.7"}) == 429
    assert await _failed_login(client, {"X-Forwarded-For": "198.51.100.2"}) == 401


@pytest.mark.asyncio
async def test_dashboard_users_behind_one_proxy_get_their_own_limits(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    monkeypatch.setattr(settings, "proxy_shared_secret", SECRET)
    via_proxy = {"X-Proxy-Secret": SECRET, "X-Forwarded-For": "76.76.21.21"}
    for _ in range(LOGIN_LIMIT):
        assert await _failed_login(client, {**via_proxy, "X-Client-IP": "203.0.113.7"}) == 401
    assert await _failed_login(client, {**via_proxy, "X-Client-IP": "203.0.113.7"}) == 429
    assert await _failed_login(client, {**via_proxy, "X-Client-IP": "198.51.100.2"}) == 401
