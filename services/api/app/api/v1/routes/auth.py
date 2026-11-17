"""
app/api/v1/routes/auth.py
────────────────────────────
Authentication endpoints.

POST /auth/register     – create an account, returns a token pair (auto-login)
POST /auth/login        – exchange email+password for a token pair
POST /auth/refresh      – rotate a refresh token for a new token pair
POST /auth/logout       – revoke one refresh token (this session only)
POST /auth/logout-all   – revoke every refresh token for the caller
POST /auth/verify-email/request   – email the signed-in user a verification link
POST /auth/verify-email           – redeem a verification link's token
POST /auth/password-reset         – email a reset link (same answer for any address)
POST /auth/password-reset/confirm – set a new password from a reset link's token

Two ways to hold the refresh token: in the JSON body (the extension), or in
an httpOnly cookie when the request sends `X-Auth-Mode: cookie` (the
dashboard; see _cookie_mode below).

All three credential-taking endpoints (register/login/refresh) are rate
limited per-IP — see app/core/rate_limit.py.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status

from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.rate_limit import check_rate_limit, rate_limit
from app.core.settings import settings
from app.dependencies import (
    AccountEmailServiceDep,
    AuthServiceDep,
    CurrentUserDep,
    EmailSenderDep,
    user_rate_limit,
)
from app.schemas.auth import (
    EmailTokenRequest,
    LoginRequest,
    LogoutRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPairResponse,
    UserResponse,
)
from app.services.email import password_reset_email, verification_email

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
    payload: RegisterRequest,
    request: Request,
    response: Response,
    background: BackgroundTasks,
    auth_service: AuthServiceDep,
    account_email: AccountEmailServiceDep,
    email_sender: EmailSenderDep,
) -> TokenPairResponse:
    _cookie_mode(request)  # reject a bad Origin before creating anything
    user = await auth_service.register(payload)
    token = await account_email.issue_verification(user)
    if token:
        # After the response: the account works at once; the email follows.
        background.add_task(email_sender.send, verification_email(user.email, token))
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


# ── Email verification ─────────────────────────────────────────────────────────

@router.post(
    "/verify-email/request",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Email the signed-in user a new verification link (no-op if already verified)",
    dependencies=[user_rate_limit("verify_email_request", max_requests=3, window_seconds=3600)],
)
async def request_email_verification(
    current_user: CurrentUserDep,
    background: BackgroundTasks,
    account_email: AccountEmailServiceDep,
    email_sender: EmailSenderDep,
) -> None:
    token = await account_email.issue_verification(current_user)
    if token:
        background.add_task(email_sender.send, verification_email(current_user.email, token))


@router.post(
    "/verify-email",
    response_model=UserResponse,
    summary="Confirm an email address with the token from a verification link",
    # No sign-in needed: the link may be opened in another browser.
    dependencies=[Depends(rate_limit("verify_email_confirm", max_requests=20, window_seconds=900))],
)
async def confirm_email(payload: EmailTokenRequest, account_email: AccountEmailServiceDep) -> UserResponse:
    user = await account_email.confirm_email(payload.token)
    return UserResponse.model_validate(user)


# ── Password reset ─────────────────────────────────────────────────────────────

@router.post(
    "/password-reset",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,  # empty body, not "null"
    summary="Email a password-reset link, if the address has an account",
    dependencies=[Depends(rate_limit("password_reset_ip", max_requests=5, window_seconds=3600))],
)
async def request_password_reset(
    payload: PasswordResetRequest,
    background: BackgroundTasks,
    account_email: AccountEmailServiceDep,
    email_sender: EmailSenderDep,
) -> None:
    """Always 202 with no body, whether or not the address is registered, and
    the email goes out after the response, so neither the answer nor its
    timing says which addresses have accounts. The per-address limit stops
    anyone flooding one inbox from many IPs."""
    check_rate_limit(
        f"password_reset_email:{payload.email.strip().lower()}",
        3,
        3600,
        "Too many reset emails for this address — try again in an hour.",
    )
    issued = await account_email.issue_password_reset(payload.email)
    if issued:
        user, token = issued
        background.add_task(email_sender.send, password_reset_email(user.email, token))


@router.post(
    "/password-reset/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Set a new password with the token from a reset link; signs out every session",
    dependencies=[Depends(rate_limit("password_reset_confirm", max_requests=10, window_seconds=900))],
)
async def confirm_password_reset(
    payload: PasswordResetConfirm, request: Request, response: Response, account_email: AccountEmailServiceDep
) -> None:
    await account_email.reset_password(payload.token, payload.new_password)
    if _cookie_mode(request):
        _clear_refresh_cookie(response)
