"""
app/api/v1/routes/auth.py
────────────────────────────
Authentication endpoints.

POST /auth/register     – create an account, returns a token pair (auto-login)
POST /auth/login        – exchange email+password for a token pair
POST /auth/refresh      – rotate a refresh token for a new token pair
POST /auth/logout       – revoke one refresh token (this session only)
POST /auth/logout-all   – revoke every refresh token for the caller

Two ways to hold the refresh token: in the JSON body (the extension), or in
an httpOnly cookie when the request sends `X-Auth-Mode: cookie` (the
dashboard; see _cookie_mode below).

All three credential-taking endpoints (register/login/refresh) are rate
limited per-IP — see app/core/rate_limit.py.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status

from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.rate_limit import rate_limit
from app.core.settings import settings
from app.dependencies import AuthServiceDep, CurrentUserDep
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPairResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["Auth"])

# ── Cookie mode (dashboard) ────────────────────────────────────────────────────
# A client opts in by sending `X-Auth-Mode: cookie`. In that mode the refresh
# token is set as an httpOnly cookie and left out of the response body, and
# refresh/logout read it from that cookie. Without the header the cookie is
# ignored entirely, which is what keeps this CSRF-safe: a custom header can't
# be sent cross-origin without a CORS preflight, and preflights only pass for
# ALLOWED_ORIGINS. The Origin check below backs that up. The extension never
# sends the header and keeps passing tokens in the JSON body.
AUTH_MODE_HEADER = "X-Auth-Mode"


def _cookie_mode(request: Request) -> bool:
    if request.headers.get(AUTH_MODE_HEADER, "").lower() != "cookie":
        return False
    origin = request.headers.get("origin")
    if origin is None or origin not in settings.allowed_origins:
        raise ForbiddenException("Cookie sessions are only available to the dashboard.")
    return True


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        settings.auth_cookie_name,
        refresh_token,
        max_age=settings.jwt_refresh_token_expire_days * 86400,
        path=settings.auth_cookie_path,
        domain=settings.auth_cookie_domain,
        secure=settings.auth_cookie_is_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.auth_cookie_name,
        path=settings.auth_cookie_path,
        domain=settings.auth_cookie_domain,
        secure=settings.auth_cookie_is_secure,
        httponly=True,
        samesite=settings.auth_cookie_samesite,
    )


def _token_pair_response(
    request: Request, response: Response, access_token: str, refresh_token: str, user
) -> TokenPairResponse:
    in_body: str | None = refresh_token
    if _cookie_mode(request):
        _set_refresh_cookie(response, refresh_token)
        in_body = None
    return TokenPairResponse(
        access_token=access_token,
        refresh_token=in_body,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        user=UserResponse.model_validate(user),
    )


def _presented_refresh_token(request: Request, from_body: str | None) -> str | None:
    """The body wins (the extension, and a dashboard moving an old
    localStorage token into a cookie); otherwise the cookie, in cookie mode."""
    if from_body:
        return from_body
    if _cookie_mode(request):
        return request.cookies.get(settings.auth_cookie_name)
    return None


@router.post(
    "/register",
    response_model=TokenPairResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account (auto-login: returns a token pair)",
    dependencies=[Depends(rate_limit("auth_register", max_requests=5, window_seconds=3600))],
)
async def register(
    payload: RegisterRequest, request: Request, response: Response, auth_service: AuthServiceDep
) -> TokenPairResponse:
    _cookie_mode(request)  # reject a bad Origin before creating anything
    user = await auth_service.register(payload)
    access_token, refresh_token = await auth_service.issue_token_pair(user)
    return _token_pair_response(request, response, access_token, refresh_token, user)


@router.post(
    "/login",
    response_model=TokenPairResponse,
    summary="Exchange email+password for a token pair",
    dependencies=[Depends(rate_limit("auth_login", max_requests=10, window_seconds=900))],
)
async def login(
    payload: LoginRequest, request: Request, response: Response, auth_service: AuthServiceDep
) -> TokenPairResponse:
    _cookie_mode(request)
    user = await auth_service.authenticate(payload)
    access_token, refresh_token = await auth_service.issue_token_pair(user)
    return _token_pair_response(request, response, access_token, refresh_token, user)


@router.post(
    "/refresh",
    response_model=TokenPairResponse,
    summary="Rotate a refresh token for a new token pair (body, or the cookie in cookie mode)",
    dependencies=[Depends(rate_limit("auth_refresh", max_requests=30, window_seconds=900))],
)
async def refresh(
    request: Request,
    response: Response,
    auth_service: AuthServiceDep,
    payload: RefreshRequest | None = None,
) -> TokenPairResponse:
    token = _presented_refresh_token(request, payload.refresh_token if payload else None)
    if not token:
        raise UnauthorizedException("No refresh token.")
    access_token, refresh_token, user = await auth_service.refresh(token)
    return _token_pair_response(request, response, access_token, refresh_token, user)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke one refresh token (this session only)",
)
async def logout(
    request: Request,
    response: Response,
    auth_service: AuthServiceDep,
    payload: LogoutRequest | None = None,
) -> None:
    token = _presented_refresh_token(request, payload.refresh_token if payload else None)
    if token:
        await auth_service.logout(token)
    if _cookie_mode(request):
        _clear_refresh_cookie(response)


@router.post(
    "/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke every refresh token for the current user (all devices/sessions)",
)
async def logout_all(
    request: Request, response: Response, current_user: CurrentUserDep, auth_service: AuthServiceDep
) -> None:
    await auth_service.logout_all(current_user.id)
    if _cookie_mode(request):
        _clear_refresh_cookie(response)
