"""
tests/core/test_db_url.py
──────────────────────────
Neon-style (libpq) connection strings become what asyncpg and psycopg2
accept. All URLs here are made up.
"""
from __future__ import annotations

import pytest
from sqlalchemy.engine import make_url

from app.core import db_url
from app.core.settings import Settings

POOLED = "postgresql://app:s3cr%40t@ep-cool-name-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DIRECT = "postgresql://app:s3cr%40t@ep-cool-name-123.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"


def test_pooled_neon_url_for_asyncpg() -> None:
    url, args = db_url.async_engine_config(POOLED)
    parsed = make_url(url)
    assert parsed.drivername == "postgresql+asyncpg"
    assert parsed.password == "s3cr@t"  # still decoded correctly
    assert parsed.database == "neondb"
    # asyncpg rejects libpq parameters in the URL; SSL moves to connect_args.
    assert "sslmode" not in parsed.query and "channel_binding" not in parsed.query
    assert args["ssl"] == "require"
    # Behind the pooler, no prepared-statement caching.
    assert args["statement_cache_size"] == 0
    assert parsed.query["prepared_statement_cache_size"] == "0"


def test_direct_neon_url_keeps_statement_caching() -> None:
    url, args = db_url.async_engine_config(DIRECT)
    assert args == {"ssl": "require"}
    assert "prepared_statement_cache_size" not in make_url(url).query


def test_sync_url_keeps_libpq_parameters_for_psycopg2() -> None:
    parsed = make_url(db_url.sync_url(DIRECT))
    assert parsed.drivername == "postgresql+psycopg2"
    assert parsed.query["sslmode"] == "require"
    assert parsed.query["channel_binding"] == "require"


@pytest.mark.parametrize("scheme", ["postgres", "postgresql", "postgresql+asyncpg", "postgresql+psycopg2"])
def test_any_postgres_scheme_is_accepted(scheme: str) -> None:
    url, _ = db_url.async_engine_config(f"{scheme}://u:p@localhost:5432/db")
    assert url.startswith("postgresql+asyncpg://")


def test_sslmode_disable_passes_no_ssl_argument() -> None:
    _, args = db_url.async_engine_config("postgresql://u:p@localhost/db?sslmode=disable")
    assert "ssl" not in args


def test_a_non_postgres_url_is_refused() -> None:
    with pytest.raises(ValueError):
        db_url.async_engine_config("mysql://u:p@localhost/db")


def test_describe_never_includes_the_password() -> None:
    fields = db_url.describe(POOLED)
    assert fields == {"host": "ep-cool-name-123-pooler.eu-central-1.aws.neon.tech", "db": "neondb", "pooled": True}
    assert "s3cr" not in repr(fields)


def test_settings_use_database_url_and_the_unpooled_one_for_migrations(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET_KEY", "test-only-secret-0123456789abcdef0123456789")
    monkeypatch.setenv("DATABASE_URL", POOLED)
    monkeypatch.setenv("DATABASE_URL_UNPOOLED", DIRECT)
    s = Settings(_env_file=None)
    assert make_url(s.database_url).host.endswith("-pooler.eu-central-1.aws.neon.tech")
    assert s.database_connect_args["statement_cache_size"] == 0
    # Alembic goes direct, not through the pooler.
    assert "-pooler" not in make_url(s.sync_database_url).host
    assert s.database_log_fields["pooled"] is True


def test_without_database_url_the_postgres_parts_are_used(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET_KEY", "test-only-secret-0123456789abcdef0123456789")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL_UNPOOLED", raising=False)
    monkeypatch.setenv("POSTGRES_HOST", "db.internal")
    monkeypatch.setenv("POSTGRES_PASSWORD", "p@ss word")
    s = Settings(_env_file=None)
    parsed = make_url(s.database_url)
    assert (parsed.host, parsed.password) == ("db.internal", "p@ss word")
    assert s.database_connect_args == {}
