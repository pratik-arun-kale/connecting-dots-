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
    allowed_origins: list[str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:5173",
            # Chrome extension — set ALLOWED_ORIGINS in .env to override with the real ID.
            # Starlette CORSMiddleware requires exact origins; chrome-extension://* is not valid.
            "chrome-extension://klbkondckkfnmfjpgnlcbajnkofjoiab",
            # AI platform origins — needed for content scripts that POST directly to the backend.
            "https://chat.openai.com",
            "https://claude.ai",
            "https://gemini.google.com",
        ]
    )

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

    # ── Future: Auth placeholders ────────────────────────────────────────────
    # secret_key: str = "changeme"
    # access_token_expire_minutes: int = 60

    # ── Future: AI Pipeline placeholders ────────────────────────────────────
    # openai_api_key: str | None = None
    # anthropic_api_key: str | None = None
    # embedding_model: str = "text-embedding-3-small"

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
