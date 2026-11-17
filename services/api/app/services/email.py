"""
app/services/email.py
──────────────────────
Sending email, through Resend (https://resend.com/docs/api-reference/emails/send-email).

get_email_sender() picks the sender once per process:
  - RESEND_API_KEY set           → ResendEmailSender
  - unset, APP_ENV=development   → ConsoleEmailSender: logs the message,
                                    link included, so the flows work locally
  - unset anywhere else          → DisabledEmailSender: logs an error, sends nothing

Sending never raises into a request: routes send from a background task,
and a failure is logged (without the link) rather than surfaced.
"""
from __future__ import annotations

import html
import ssl
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import httpx

from app.core.logging import get_logger
from app.core.settings import settings

logger = get_logger(__name__)

RESEND_URL = "https://api.resend.com/emails"


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: str


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


class ResendEmailSender:
    def __init__(
        self, api_key: str, sender: str, timeout: float = 10.0, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._api_key = api_key
        self._from = sender
        self._timeout = timeout
        self._transport = transport  # tests only

    async def send(self, message: EmailMessage) -> None:
        try:
            # The OS trust store, not certifi's bundle: certificates are still
            # verified, but a network that re-signs TLS with its own CA (one
            # the OS already trusts) works too. Docker's slim image ships the
            # standard CA set.
            async with httpx.AsyncClient(
                timeout=self._timeout, transport=self._transport, verify=ssl.create_default_context()
            ) as client:
                resp = await client.post(
                    RESEND_URL,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json={
                        "from": self._from,
                        "to": [message.to],
                        "subject": message.subject,
                        "text": message.text,
                        "html": message.html,
                    },
                )
        except httpx.HTTPError as exc:
            logger.error("email_send_failed", subject=message.subject, error=f"{type(exc).__name__}: {exc}")
            return
        if resp.is_success:
            logger.info("email_sent", subject=message.subject, resend_id=resp.json().get("id"))
        else:
            # Resend's error body names the problem (unverified domain, bad
            # key, …) and never echoes the message content.
            logger.error("email_send_failed", subject=message.subject, status=resp.status_code, body=resp.text[:300])


class ConsoleEmailSender:
    """Development only: the message (and its link) goes to the log."""

    async def send(self, message: EmailMessage) -> None:
        logger.warning("email_not_sent_dev_console", to=message.to, subject=message.subject, text=message.text)


class DisabledEmailSender:
    async def send(self, message: EmailMessage) -> None:
        logger.error("email_not_configured", subject=message.subject, hint="set RESEND_API_KEY")


@lru_cache
def get_email_sender() -> EmailSender:
    if settings.resend_api_key:
        return ResendEmailSender(settings.resend_api_key, settings.email_from)
    if settings.is_development:
        return ConsoleEmailSender()
    return DisabledEmailSender()


# ── Messages ──────────────────────────────────────────────────────────────────

def _render(to: str, subject: str, intro: str, link: str, button: str, outro: str) -> EmailMessage:
    text = f"{intro}\n\n{link}\n\n{outro}\n\n— {settings.email_product_name}"
    safe_link = html.escape(link, quote=True)
    body = f"""<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1c1a">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5">{html.escape(intro)}</p>
    <p style="margin:0 0 24px"><a href="{safe_link}" style="display:inline-block;background:#1c1c1a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">{html.escape(button)}</a></p>
    <p style="margin:0 0 12px;font-size:13px;color:#6b6b66;line-height:1.5">{html.escape(outro)}</p>
    <p style="margin:0;font-size:12px;color:#9a9a94;word-break:break-all">{safe_link}</p>
  </div>
</body></html>"""  # noqa: E501
    return EmailMessage(to=to, subject=subject, text=text, html=body)


def verification_email(to: str, token: str) -> EmailMessage:
    link = f"{settings.dashboard_url.rstrip('/')}/verify-email?token={token}"
    hours = settings.email_verify_token_hours
    return _render(
        to,
        f"Confirm your email for {settings.email_product_name}",
        "Confirm this is your email address by opening the link below.",
        link,
        "Confirm email",
        f"The link works once and expires in {hours} hours. If you didn't create an account, ignore this email.",
    )


def password_reset_email(to: str, token: str) -> EmailMessage:
    link = f"{settings.dashboard_url.rstrip('/')}/reset-password?token={token}"
    minutes = settings.password_reset_token_minutes
    return _render(
        to,
        f"Reset your {settings.email_product_name} password",
        "Someone asked to reset the password for this account. Open the link below to choose a new one.",
        link,
        "Choose a new password",
        f"The link works once and expires in {minutes} minutes. Resetting signs you out everywhere. "
        "If you didn't ask for this, ignore this email; your password stays the same.",
    )
