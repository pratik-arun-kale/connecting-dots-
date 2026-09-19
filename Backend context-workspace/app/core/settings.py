"""
app/core/settings.py
────────────────────
Centralised, environment-driven configuration using Pydantic Settings v2.
All secrets come from environment variables or a .env file.
"""

from functools import lru_cache
from typing import Literal

from urllib.parse import quote_plus

from pydantic import AnyUrl, Field, field_validator, model_validator
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

    # Base origins always allowed. The extension ID changes when loaded unpacked,
    # so set EXTENSION_ORIGIN=chrome-extension://<your-id> in .env to override.
    # Find the ID at chrome://extensions after loading the extension unpacked.
    extension_origin: str = "chrome-extension://klbkondckkfnmfjpgnlcbajnkofjoiab"

    allowed_origins: list[str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:5173",
            # AI platform origins — needed for content scripts that POST directly to the backend.
            "https://chat.openai.com",
            "https://chatgpt.com",
            "https://claude.ai",
            "https://gemini.google.com",
        ]
    )

    @model_validator(mode="after")
    def _add_extension_origin(self) -> "Settings":
        """Inject the extension origin into allowed_origins if not already present."""
        if self.extension_origin and self.extension_origin not in self.allowed_origins:
            self.allowed_origins = [*self.allowed_origins, self.extension_origin]
        return self

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
    openai_timeout_sec: float = 30.0      # cloud round-trip is fast; keep this short so a stuck call doesn't tie up a thread-pool worker
    openai_context_chunks: int = 3        # max reranked chunks considered for context, before the token-budget truncation in openai_generator.py

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


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton. Import this instead of Settings()."""
    return Settings()


settings = get_settings()
