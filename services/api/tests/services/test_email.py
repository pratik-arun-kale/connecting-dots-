"""
tests/services/test_email.py
─────────────────────────────
The Resend client, against a fake HTTP transport (no network), and the
choice of sender per environment.
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from app.core.settings import settings
from app.services import email as email_module
from app.services.email import (
    ConsoleEmailSender,
    DisabledEmailSender,
    EmailMessage,
    ResendEmailSender,
    get_email_sender,
    password_reset_email,
    verification_email,
)

MESSAGE = EmailMessage(to="a@test.com", subject="Hi", text="plain", html="<p>html</p>")


@pytest.mark.asyncio
async def test_resend_gets_the_key_and_the_message() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"id": "email_123"})

    sender = ResendEmailSender("re_test_key", "Dots <hi@example.com>", transport=httpx.MockTransport(handler))
    await sender.send(MESSAGE)

    assert len(seen) == 1
    req = seen[0]
    assert str(req.url) == "https://api.resend.com/emails"
    assert req.headers["authorization"] == "Bearer re_test_key"
    assert json.loads(req.content) == {
        "from": "Dots <hi@example.com>",
        "to": ["a@test.com"],
        "subject": "Hi",
        "text": "plain",
        "html": "<p>html</p>",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["status", "network"])
async def test_a_resend_failure_is_logged_not_raised(failure: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if failure == "network":
            raise httpx.ConnectError("down", request=request)
        return httpx.Response(403, json={"message": "domain not verified"})

    sender = ResendEmailSender("re_test_key", "x@example.com", transport=httpx.MockTransport(handler))
    await sender.send(MESSAGE)  # must not raise


def test_the_sender_follows_the_environment(monkeypatch) -> None:
    def pick(**overrides):
        for key, value in overrides.items():
            monkeypatch.setattr(settings, key, value)
        get_email_sender.cache_clear()
        try:
            return get_email_sender()
        finally:
            get_email_sender.cache_clear()

    assert isinstance(pick(resend_api_key="re_x", app_env="production"), ResendEmailSender)
    assert isinstance(pick(resend_api_key=None, app_env="development"), ConsoleEmailSender)
    assert isinstance(pick(resend_api_key=None, app_env="production"), DisabledEmailSender)


def test_placeholder_keys_count_as_unset() -> None:
    for value in ("", "  ", "re_...", "your-key-here"):
        assert settings.__class__._ignore_placeholder_resend_key(value) is None
    assert settings.__class__._ignore_placeholder_resend_key(" re_real ") == "re_real"


def test_links_point_at_the_dashboard(monkeypatch) -> None:
    monkeypatch.setattr(settings, "dashboard_url", "https://app.example.com/")
    verify = verification_email("a@test.com", "tok123")
    reset = password_reset_email("a@test.com", "tok456")
    assert "https://app.example.com/verify-email?token=tok123" in verify.text
    assert 'href="https://app.example.com/verify-email?token=tok123"' in verify.html
    assert "https://app.example.com/reset-password?token=tok456" in reset.text
    assert verify.to == reset.to == "a@test.com"


def test_module_never_logs_a_link_outside_the_dev_console() -> None:
    # Only ConsoleEmailSender (development, no key) may log message text.
    source = Path(email_module.__file__).read_text(encoding="utf-8")
    assert source.count("text=message.text") == 1
