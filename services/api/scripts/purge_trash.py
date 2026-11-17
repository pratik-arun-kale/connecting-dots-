"""
scripts/purge_trash.py
───────────────────────
Remove everything that has been in the Trash longer than
TRASH_RETENTION_DAYS (default 30), for every user: rows, vectors and
vocabulary. The API already does this every TRASH_PURGE_INTERVAL_HOURS;
run this from cron instead if you set that to 0.

Run from services/api so `app` and .env resolve:

    python scripts/purge_trash.py
"""
from __future__ import annotations

import asyncio
import sys

sys.path.insert(0, ".")

from app.db.engine import dispose_engine, get_session_factory  # noqa: E402
from app.services.trash import TrashService  # noqa: E402


async def main() -> None:
    async with get_session_factory()() as session:
        notes, projects = await TrashService(session).purge_expired()
        await session.commit()
    await dispose_engine()
    print(f"purged {notes} notes and {projects} projects")


if __name__ == "__main__":
    asyncio.run(main())
