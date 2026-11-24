"""
alembic/env.py
───────────────
Alembic migration environment.
Supports both --sql (offline) and online (sync psycopg2) modes.
The sync URL is derived from settings so there is a single source of truth.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# ── Load application config ───────────────────────────────────────────────────
# Importing settings here ensures .env is loaded before Alembic touches the DB.
from app.core.settings import settings

# Import Base AND all model modules so autogenerate can diff them.
from app.db.base import Base  # noqa: F401 — side-effect import registers models

config = context.config

# Alembic's own logging (sqlalchemy echo etc.)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override the sqlalchemy.url from application settings
config.set_main_option("sqlalchemy.url", settings.sync_database_url.replace("%", "%%"))

target_metadata = Base.metadata


# ── Offline mode ──────────────────────────────────────────────────────────────

def run_migrations_offline() -> None:
    """Emit raw SQL to stdout. Useful for review / audit."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online mode ───────────────────────────────────────────────────────────────

def run_migrations_online() -> None:
    """Run migrations against a live database connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # single-use; no pooling during migrations
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,          # detect column type changes
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
