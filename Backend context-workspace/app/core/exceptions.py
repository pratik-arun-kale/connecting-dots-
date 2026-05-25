"""
app/core/exceptions.py
───────────────────────
Domain exception hierarchy + FastAPI exception handlers.
All handlers are registered in main.py via register_exception_handlers().
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.logging import get_logger

logger = get_logger(__name__)


# ── Error Response Schema ────────────────────────────────────────────────────

class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


def _error_response(
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorDetail(code=code, message=message, details=details)
    )
    return JSONResponse(status_code=status_code, content=body.model_dump())


# ── Domain Exceptions ────────────────────────────────────────────────────────

class AppBaseException(Exception):
    """Root exception for all domain errors."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "internal_error"
    message: str = "An unexpected error occurred."

    def __init__(self, message: str | None = None, details: dict | None = None):
        self.message = message or self.__class__.message
        self.details = details
        super().__init__(self.message)


class NotFoundException(AppBaseException):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    message = "The requested resource was not found."


class ConflictException(AppBaseException):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"
    message = "A resource with this identifier already exists."


class UnprocessableException(AppBaseException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "unprocessable"
    message = "The request could not be processed."


class ServiceUnavailableException(AppBaseException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "service_unavailable"
    message = "A downstream service is temporarily unavailable."


# ── FastAPI Exception Handlers ───────────────────────────────────────────────

async def _app_exception_handler(
    request: Request, exc: AppBaseException
) -> JSONResponse:
    logger.warning(
        "domain_exception",
        code=exc.code,
        message=exc.message,
        details=exc.details,
        path=str(request.url),
    )
    return _error_response(exc.status_code, exc.code, exc.message, exc.details)


async def _validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    details = {"validation_errors": exc.errors()}
    logger.info(
        "validation_error",
        path=str(request.url),
        errors=exc.errors(),
    )
    return _error_response(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        "validation_error",
        "Request validation failed.",
        details,
    )


async def _unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    logger.exception(
        "unhandled_exception",
        path=str(request.url),
        exc_info=exc,
    )
    response = _error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "internal_error",
        "An unexpected error occurred.",
    )
    # BaseHTTPMiddleware (used by RequestLoggingMiddleware) can strip CORS headers
    # from error responses before CORSMiddleware gets to inject them. Mirror the
    # Origin back explicitly so the browser can read the error body.
    origin = request.headers.get("origin")
    if origin:
        response.headers["access-control-allow-origin"] = origin
        response.headers["access-control-allow-credentials"] = "true"
    return response


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers. Called once in create_app()."""
    app.add_exception_handler(AppBaseException, _app_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _unhandled_exception_handler)
