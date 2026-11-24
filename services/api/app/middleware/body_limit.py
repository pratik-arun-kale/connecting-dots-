"""
app/middleware/body_limit.py
─────────────────────────────
Reject request bodies over settings.max_request_body_bytes with 413, before
any route parses them. Field-level max_length limits still apply; this is
the backstop for free-form JSON fields (raw_content, metadata) and for
clients that lie about or omit Content-Length (chunked uploads are counted
as they stream in).

Pure ASGI rather than BaseHTTPMiddleware, so it can stop reading early.
"""
from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]


class BodySizeLimitMiddleware:
    def __init__(self, app: Callable, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    declared = 0
                if declared > self.max_bytes:
                    await self._reject(send)
                    return

        # A streamed body is cut off at the limit (the app sees it end there)
        # and whatever response the app then produces is replaced by the
        # 413. Raising from receive() wouldn't work: FastAPI turns any error
        # while reading the body into a 400.
        received = 0
        too_large = False
        replaced = False

        async def counting_receive() -> Message:
            nonlocal received, too_large
            if too_large:
                return {"type": "http.request", "body": b"", "more_body": False}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    too_large = True
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        async def limited_send(message: Message) -> None:
            nonlocal replaced
            if not too_large:
                await send(message)
                return
            if not replaced:
                replaced = True
                await self._reject(send)

        await self.app(scope, counting_receive, limited_send)

    async def _reject(self, send: Send) -> None:
        body = json.dumps(
            {
                "error": {
                    "code": "payload_too_large",
                    "message": f"Request body exceeds {self.max_bytes} bytes.",
                    "details": None,
                }
            }
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
            }
        )
        await send({"type": "http.response.body", "body": body})
