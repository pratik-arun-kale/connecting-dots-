"""
app/core/settings.py
────────────────────
Centralised, environment-driven configuration using Pydantic Settings v2.
All secrets come from environment variables or a .env file.
"""

from functools import lru_cache
from typing import Literal
from urllib.parse import quote_plus

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ─────────────────────────────────────────────────────────
    app_name: str = "AI Context Workspace"
    app_version: str = "0.1.0"
    app_env: Literal["development", "staging", "production"] = "development"
    debug: bool = False

    # ── API ──────────────────────────────────────────────────────────────────
    api_v1_prefix: str = "/api/v1"

    # The one chrome-extension:// origin allowed to call the API cross-origin,
    # e.g. EXTENSION_ORIGIN=chrome-extension://<id> (find the ID at
    # chrome://extensions). No default: an unpacked extension's ID depends on
    # where it was loaded from. Unset in development means any extension
    # origin is accepted (see ExtensionCORSMiddleware); unset elsewhere means
    # none is.
    extension_origin: str | None = None

    # `| str` lets ALLOWED_ORIGINS be either a JSON list or a comma-separated
    # string (the form .env.example and docker-compose use) — pydantic-settings
    # only falls back to the raw string for fields that admit one. Always a
    # list after validation.
    allowed_origins: list[str] | str = Field(
        # The AI chat sites are deliberately absent: content scripts never
        # call the API themselves — they message the extension's background
        # worker, whose requests aren't subject to CORS — so allowing those
        # origins would only let page scripts on them call the API.
        default=[
            "http://localhost:3000",
            "http://localhost:5173",
        ]
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @model_validator(mode="after")
    def _add_extension_origin(self) -> "Settings":
        """Inject the extension origin into allowed_origins if not already present."""
        if self.extension_origin and self.extension_origin not in self.allowed_origins:
            self.allowed_origins = [*self.allowed_origins, self.extension_origin]
        return self

    # Largest accepted request body. The extension caps a capture at 1 MB;
    # this leaves room for JSON overhead and is the backstop for free-form
    # JSON fields that have no per-field limit.
    max_request_body_bytes: int = 2_000_000

    # ── PostgreSQL ───────────────────────────────────────────────────────────
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "ai_context_workspace"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"

    # Constructed automatically; can be overridden via DATABASE_URL env var
    database_url: str = ""

    @model_validator(mode="after")
    def _build_database_url(self) -> "Settings":
        if not self.database_url:
            encoded_password = quote_plus(self.postgres_password)
            self.database_url = (
                f"postgresql+asyncpg://{self.postgres_user}:{encoded_password}"
                f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
            )
        return self

    # Sync URL for Alembic (uses psycopg2 driver)
    @property
    def sync_database_url(self) -> str:
        return self.database_url.replace(
            "postgresql+asyncpg://", "postgresql+psycopg2://"
        )

    # ── Redis (future-ready) ─────────────────────────────────────────────────
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str | None = None

    @property
    def redis_url(self) -> str:
        auth = f":{self.redis_password}@" if self.redis_password else ""
        return f"redis://{auth}{self.redis_host}:{self.redis_port}/{self.redis_db}"

    # ── Logging ──────────────────────────────────────────────────────────────
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    log_format: Literal["json", "console"] = "json"

    # ── Auth (JWT access/refresh tokens) ─────────────────────────────────────
    # jwt_secret_key has NO default on purpose — the app must fail to start
    # rather than silently sign tokens with a well-known value. Generate one
    # with `python -c "import secrets; print(secrets.token_urlsafe(64))"`.
    jwt_secret_key: str
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 30

    @field_validator("jwt_secret_key")
    @classmethod
    def _reject_placeholder_secret(cls, v: str) -> str:
        if not v or v.strip().lower() in {"changeme", "your-secret-key-here", "secret"}:
            raise ValueError(
                "JWT_SECRET_KEY must be set to a real random value — generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(64))"'
            )
        return v

    # ── Auth: dashboard refresh-token cookie ─────────────────────────────────
    # The dashboard keeps its refresh token in an httpOnly cookie (page script
    # can't read it); the extension keeps sending it in the JSON body. The
    # cookie is scoped to the auth routes only, so no other route is ever
    # cookie-authenticated and CSRF can only touch /auth/* (guarded there).
    #
    # SameSite=Strict works because the dashboard and the API share a site
    # (localhost:3000 / localhost:8000, or app.example.com / api.example.com).
    # Hosting them on different registrable domains would need
    # SameSite=None, which browsers increasingly block as third-party.
    auth_cookie_name: str = "cd_refresh"
    auth_cookie_samesite: Literal["strict", "lax"] = "strict"
    # None = Secure everywhere except development (plain-http localhost).
    auth_cookie_secure: bool | None = None
    # None = host-only cookie on the API host, the safest default.
    auth_cookie_domain: str | None = None

    # ── Email (Resend) — verification and password-reset links ─────────────
    # Without a key, development logs each email instead of sending it, and
    # other environments send nothing (and log an error). EMAIL_FROM must use
    # a domain verified in Resend; onboarding@resend.dev only delivers to the
    # address of your own Resend account.
    resend_api_key: str | None = None
    email_from: str = "Connecting Dots <onboarding@resend.dev>"
    email_product_name: str = "Connecting Dots"
    # Where the links in emails point: the dashboard's origin.
    dashboard_url: str = "http://localhost:3000"
    email_verify_token_hours: int = 24
    password_reset_token_minutes: int = 60

    @field_validator("resend_api_key")
    @classmethod
    def _ignore_placeholder_resend_key(cls, v: str | None) -> str | None:
        if v is None or not v.strip() or v.strip().lower() in {"re_...", "your-key-here", "changeme"}:
            return None
        return v.strip()

    # ── Auth: bootstrapped admin (absorbs pre-auth legacy data) ──────────────
    # Only used by the 0007 migration to create/reuse one admin user and
    # assign any orphaned (pre-auth) projects to them. Optional: if unset,
    # that migration creates the admin with a generated email/password and
    # logs it once (see migration docstring) rather than failing.
    admin_email: str | None = None
    admin_password: str | None = None

    # ── OpenAI — cloud LLM for RAG answer generation (Ask AI) ────────────────
    # Never set a default for the key itself — an absent key must mean
    # "answer generation degrades to the top chunk", never "use a real key
    # that happens to be checked into source". Sourced from .env (gitignored)
    # or a real environment variable in deployment; never hardcode a value.
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_temperature: float = 0.1
    openai_max_tokens: int = 512          # output token cap — bounds answer length and cost
    # Cloud round-trip is fast; keep this short so a stuck call doesn't tie up a thread-pool worker.
    openai_timeout_sec: float = 30.0
    # Max reranked chunks considered for context, before the token-budget truncation in openai_generator.py.
    openai_context_chunks: int = 3

    @field_validator("openai_api_key")
    @classmethod
    def _no_placeholder_key(cls, v: str | None) -> str | None:
        """Treat an accidentally-committed placeholder value as "not set" rather
        than a real key, so a stray `OPENAI_API_KEY=your-key-here` in a shared
        .env doesn't silently attempt (and fail) real API calls."""
        if v and v.strip().lower() in {"your-key-here", "changeme", "sk-..."}:
            return None
        return v

    # ── Computed helpers ─────────────────────────────────────────────────────
    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def auth_cookie_is_secure(self) -> bool:
        return self.auth_cookie_secure if self.auth_cookie_secure is not None else not self.is_development

    @property
    def auth_cookie_path(self) -> str:
        return f"{self.api_v1_prefix}/auth"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton. Import this instead of Settings()."""
    return Settings()


settings = get_settings()
