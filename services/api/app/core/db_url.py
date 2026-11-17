"""
app/core/db_url.py
───────────────────
Turn a libpq-style connection string, such as the ones Neon hands out
(`postgresql://user:pw@ep-x-pooler.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require`),
into what each driver here accepts:

  - the app's async engine (asyncpg): `postgresql+asyncpg://`, with SSL passed
    as a connect argument (asyncpg rejects `sslmode` and `channel_binding`
    as URL parameters), and, behind Neon's pooler (PgBouncer in
    transaction mode, host contains "-pooler"), prepared-statement caching
    off, which that pooler can't support;
  - Alembic and scripts (psycopg2): `postgresql+psycopg2://`, query kept
    as is, since libpq understands it.

Never log the URLs these return: they contain the password.
"""
from __future__ import annotations

from sqlalchemy.engine import URL, make_url

# libpq sslmode -> asyncpg's `ssl` argument. "disable" means: pass nothing.
_SSL_MODES = {"allow": "allow", "prefer": "prefer", "require": "require", "verify-ca": "verify-ca",
              "verify-full": "verify-full"}
# Understood by libpq but not by asyncpg; dropped from the async URL.
_LIBPQ_ONLY = ("sslmode", "channel_binding", "sslrootcert", "sslcert", "sslkey", "target_session_attrs")


def _parse(raw: str) -> URL:
    url = make_url(raw)
    if url.drivername.split("+")[0] not in ("postgres", "postgresql"):
        raise ValueError(f"not a PostgreSQL URL (scheme {url.drivername!r})")
    return url


def is_pooled(raw: str) -> bool:
    """Neon's pooled endpoints have "-pooler" in the host name."""
    return "-pooler" in (_parse(raw).host or "")


def async_engine_config(raw: str) -> tuple[str, dict]:
    """(URL for create_async_engine, connect_args) for asyncpg."""
    url = _parse(raw)
    query = dict(url.query)
    connect_args: dict = {}

    sslmode = query.get("sslmode")
    if isinstance(sslmode, str) and sslmode in _SSL_MODES:
        connect_args["ssl"] = _SSL_MODES[sslmode]
    for key in _LIBPQ_ONLY:
        query.pop(key, None)

    if is_pooled(raw):
        # Transaction-mode pooling hands each transaction a different server
        # connection, so a statement prepared on one isn't there on the next.
        connect_args["statement_cache_size"] = 0
        query["prepared_statement_cache_size"] = "0"

    url = url.set(drivername="postgresql+asyncpg", query=query)
    return url.render_as_string(hide_password=False), connect_args


def sync_url(raw: str) -> str:
    """URL for psycopg2 (Alembic, scripts): libpq parameters kept."""
    return _parse(raw).set(drivername="postgresql+psycopg2").render_as_string(hide_password=False)


def describe(raw: str) -> dict:
    """Host and database name only, for logs."""
    url = _parse(raw)
    return {"host": url.host, "db": url.database, "pooled": is_pooled(raw)}
