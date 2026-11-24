"""
app/core/settings.py
────────────────────
Centralised, environment-driven configuration using Pydantic Settings v2.
All secrets come from environment variables or a .env file.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, PrivateAttr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

from app.core import db_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Later files win; real environment variables beat all of them.
        # .env.local is where `neon deploy` writes DATABASE_URL: next to
        # this .env, or at the repo root when run from there.
        env_file=(".env", ".env.local", "../../.env.local"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ─────────────────────────────────────────────────────────
    app_name: str = "Connecting Dots"
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

    # DATABASE_URL, when set, wins over the POSTGRES_* parts: a hosted
    # database's connection string (Neon writes DATABASE_URL, the pooled one,
    # and DATABASE_URL_UNPOOLED, the direct one). Any libpq-style URL works;
    # app/core/db_url.py adapts it per driver. After validation this field
    # holds the asyncpg form.
    database_url: str = ""
    # Direct (unpooled) connection for Alembic and scripts: migrations take
    # locks and use session state that a transaction-mode pooler drops.
    database_url_unpooled: str = ""

    _database_connect_args: dict = PrivateAttr(default_factory=dict)
    _sync_database_url: str = PrivateAttr(default="")
    _sync_runtime_database_url: str = PrivateAttr(default="")
    _database_log_fields: dict = PrivateAttr(default_factory=dict)

    @model_validator(mode="after")
    def _build_database_url(self) -> "Settings":
        # URL.create escapes each part correctly (quote_plus would turn a
        # space in the password into "+", which then reads back as "+").
        raw = self.database_url or URL.create(
            "postgresql",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        ).render_as_string(hide_password=False)
        self._sync_database_url = db_url.sync_url(self.database_url_unpooled or raw)
        self._sync_runtime_database_url = db_url.sync_url(raw)
        self._database_log_fields = db_url.describe(raw)
        self.database_url, self._database_connect_args = db_url.async_engine_config(raw)
        return self

    @property
    def database_connect_args(self) -> dict:
        """asyncpg connect arguments that can't go in the URL (SSL, pooler)."""
        return self._database_connect_args

    @property
    def database_log_fields(self) -> dict:
        """Host, database name and pooled flag — safe to log, unlike the URL."""
        return self._database_log_fields

    # Sync URL for Alembic and scripts (psycopg2), the direct one if given.
    @property
    def sync_database_url(self) -> str:
        return self._sync_database_url

    # Sync URL (psycopg2) for the search index's queries at runtime: the same
    # (pooled) database as the app, unlike sync_database_url.
    @property
    def sync_runtime_database_url(self) -> str:
        return self._sync_runtime_database_url

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

    # New accounts per IP per hour. Raised only for end-to-end test runs,
    # which create an account per test from one address.
    auth_register_limit_per_hour: int = 5

    # Seconds after a refresh token is rotated during which it may be traded
    # once more without counting as theft: two tabs refreshing at the same
    # moment send the same token. Reuse after this revokes every session.
    auth_refresh_grace_sec: int = Field(default=30, ge=0, le=300)

    # ── Client address (per-IP rate limits, app/core/rate_limit.py) ─────────
    # How many proxies in front of the API append the address they saw to
    # X-Forwarded-For. The client is the entry that many places from the
    # right; everything left of it is whatever the caller sent. 0 (local):
    # the TCP peer is the client and X-Forwarded-For is ignored. Cloud Run's
    # front end appends one entry, so 1 there (confirmed against real headers
    # before launch).
    trusted_proxy_hops: int = Field(default=0, ge=0)
    # The dashboard's /api/* proxy sends this in X-Proxy-Secret together with
    # the browser's address in X-Client-IP; X-Client-IP is believed only when
    # the secret matches. Unset: X-Client-IP is always ignored.
    proxy_shared_secret: str | None = None

    @field_validator("proxy_shared_secret")
    @classmethod
    def _proxy_secret_long_enough(cls, v: str | None) -> str | None:
        if not v:
            return None
        if len(v) < 32:
            raise ValueError(
                "PROXY_SHARED_SECRET must be at least 32 characters — generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(32))"'
            )
        return v

    # Load the embedding model and reranker at startup, before serving. Loading
    # them on first use instead stalls every request for ~10 s while torch
    # loads (it holds Python's GIL even in a worker thread). Off only to start
    # faster in development when search isn't needed.
    rag_preload_models: bool = True
    # CPU threads torch may use for embedding and reranking. Its default is
    # every core, which starves request handling while a note is indexed.
    rag_torch_threads: int = 2
    # Folder holding the embedding and reranker models (see
    # app/core/rag/model_specs.py). The Docker image bakes them into
    # /opt/models at build time and sets this, so the API never downloads a
    # model at startup. Unset in development: models load by ID at the pinned
    # revision from the Hugging Face cache.
    rag_models_dir: str | None = None

    # Trash: deleted notes and projects can be restored for this many days,
    # then a background job (every trash_purge_interval_hours; 0 = never,
    # e.g. when scripts/purge_trash.py runs from cron) removes them for good.
    trash_retention_days: int = 30
    trash_purge_interval_hours: float = 6

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
