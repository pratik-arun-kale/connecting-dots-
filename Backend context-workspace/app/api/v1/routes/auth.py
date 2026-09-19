"""
app/api/v1/routes/auth.py
────────────────────────────
Authentication endpoints.

POST /auth/register     – create an account, returns a token pair (auto-login)
POST /auth/login        – exchange email+password for a token pair
POST /auth/refresh      – rotate a refresh token for a new token pair
POST /auth/logout       – revoke one refresh token (this session only)
POST /auth/logout-all   – revoke every refresh token for the caller

All three credential-taking endpoints (register/login/refresh) are rate
limited per-IP — see app/core/rate_limit.py.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, status

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


def _token_pair_response(access_token: str, refresh_token: str, user) -> TokenPairResponse:
    return TokenPairResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/register",
    response_model=TokenPairResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account (auto-login: returns a token pair)",
    dependencies=[Depends(rate_limit("auth_register", max_requests=5, window_seconds=3600))],
)
async def register(payload: RegisterRequest, auth_service: AuthServiceDep) -> TokenPairResponse:
    user = await auth_service.register(payload)
    access_token, refresh_token = await auth_service.issue_token_pair(user)
    return _token_pair_response(access_token, refresh_token, user)


@router.post(
    "/login",
    response_model=TokenPairResponse,
    summary="Exchange email+password for a token pair",
    dependencies=[Depends(rate_limit("auth_login", max_requests=10, window_seconds=900))],
)
async def login(payload: LoginRequest, auth_service: AuthServiceDep) -> TokenPairResponse:
    user = await auth_service.authenticate(payload)
    access_token, refresh_token = await auth_service.issue_token_pair(user)
    return _token_pair_response(access_token, refresh_token, user)


@router.post(
    "/refresh",
    response_model=TokenPairResponse,
    summary="Rotate a refresh token for a new token pair",
    dependencies=[Depends(rate_limit("auth_refresh", max_requests=30, window_seconds=900))],
)
async def refresh(payload: RefreshRequest, auth_service: AuthServiceDep) -> TokenPairResponse:
    access_token, refresh_token, user = await auth_service.refresh(payload.refresh_token)
    return _token_pair_response(access_token, refresh_token, user)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke one refresh token (this session only)",
)
async def logout(payload: LogoutRequest, auth_service: AuthServiceDep) -> None:
    await auth_service.logout(payload.refresh_token)


@router.post(
    "/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke every refresh token for the current user (all devices/sessions)",
)
async def logout_all(current_user: CurrentUserDep, auth_service: AuthServiceDep) -> None:
    await auth_service.logout_all(current_user.id)
