"""
scripts/rebuild_search_index.py
────────────────────────────────
Index every live note and conversation into the search index (Postgres
context_chunks and project_vocabulary), and mark each one current.

Migration 0016 moved the index into Postgres and marked every context "not
indexed" (indexed_version NULL), so without this script each project's first
search or Ask AI question indexes its own notes, which can take a while for
a big project. Run this right after the migration to do it all up front.
Safe to run again: each context is deleted from the index and re-added.

Trashed notes are skipped; restoring one indexes it again.

Run from the `services/api` directory so `app` resolves and .env is read:

    python scripts/rebuild_search_index.py            # everything
    python scripts/rebuild_search_index.py --dry-run  # only count
"""
from __future__ import annotations

import sys

sys.path.insert(0, ".")

from sqlalchemy import create_engine, select, update  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import app.db  # noqa: E402, F401  (models first: avoids a circular import)
from app.core.settings import settings  # noqa: E402
from app.models.context import Context  # noqa: E402
from app.models.session import Session as ChatSession  # noqa: E402
from app.services.rag_service import RagService, raw_content_for_index  # noqa: E402


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as db:
        # The soft-delete hook (app/db/soft_delete.py) leaves trashed rows out.
        rows = db.execute(
            select(Context, ChatSession.project_id)
            .join(ChatSession, Context.session_id == ChatSession.id)
            .order_by(Context.created_at, Context.id)
        ).all()
        work = [
            (ctx.id, ctx.version, str(ctx.session_id), str(project_id), raw_content_for_index(ctx))
            for ctx, project_id in rows
        ]

    print(f"{len(work)} notes and conversations to index{' (dry run)' if dry_run else ''}")
    if dry_run:
        engine.dispose()
        return

    service = RagService()
    failed = 0
    for i, (context_id, version, session_id, project_id, raw_content) in enumerate(work, 1):
        try:
            service._reindex_sync(str(context_id), session_id, project_id, raw_content)
            with Session(engine) as db, db.begin():
                # Only if it wasn't edited meanwhile; an edit leaves it for the next search.
                db.execute(
                    update(Context)
                    .where(Context.id == context_id, Context.version == version)
                    .values(indexed_version=version, updated_at=Context.updated_at)
                )
        except Exception as exc:  # keep going; report at the end
            failed += 1
            print(f"  failed {context_id}: {exc}")
        if i % 20 == 0 or i == len(work):
            print(f"  {i}/{len(work)}")
    engine.dispose()
    print(f"done: {len(work) - failed} indexed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
