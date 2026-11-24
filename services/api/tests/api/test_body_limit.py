"""
tests/api/test_body_limit.py
─────────────────────────────
Request bodies over settings.max_request_body_bytes are refused with 413
before any route runs — whether or not the client declares Content-Length.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.settings import settings


@pytest.mark.asyncio
async def test_an_oversized_body_is_413(authenticated_client: AsyncClient) -> None:
    big = "x" * (settings.max_request_body_bytes + 1)
    resp = await authenticated_client.post("/api/v1/projects", json={"name": "big", "description": big})
    assert resp.status_code == 413
    assert resp.json()["error"]["code"] == "payload_too_large"


@pytest.mark.asyncio
async def test_a_chunked_body_without_content_length_is_counted(authenticated_client: AsyncClient) -> None:
    chunk = b"x" * 100_000

    async def stream():
        for _ in range(settings.max_request_body_bytes // len(chunk) + 2):
            yield chunk

    resp = await authenticated_client.post(
        "/api/v1/projects", content=stream(), headers={"Content-Type": "application/json"}
    )
    assert resp.status_code == 413


@pytest.mark.asyncio
async def test_a_normal_body_is_untouched(authenticated_client: AsyncClient) -> None:
    resp = await authenticated_client.post("/api/v1/projects", json={"name": "small"})
    assert resp.status_code == 201
