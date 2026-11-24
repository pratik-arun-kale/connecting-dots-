"""
scripts/reindex_notes.py
─────────────────────────
Re-index every note (platform "note") from its current text.

Before edits triggered a re-index, a note was indexed once, from its
first-save snapshot — for a dashboard note, only the words typed before the
first autosave — so Ask AI and search never saw the rest. Run this once
after deploying re-index-on-edit; it is safe to run again.

Run from the `services/api` directory so `app` resolves and the
.env file is picked up:

    python scripts/reindex_notes.py            # re-index all notes
    python scripts/reindex_notes.py --dry-run  # only count them
"""
from __future__ import annotations

import sys

sys.path.insert(0, ".")

from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.settings import settings  # noqa: E402
from app.models.context import Context  # noqa: E402
from app.models.session import Session as ChatSession  # noqa: E402
from app.services.rag_service import RagService, raw_content_for_index  # noqa: E402


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    engine = create_engine(settings.sync_database_url)
    with Session(engine) as db:
        rows = db.execute(
            select(Context, ChatSession.project_id)
            .join(ChatSession, Context.session_id == ChatSession.id)
            .where(Context.platform == "note")
        ).all()
        # Built while the session is open; the context rows aren't touched after.
        work = [
            (str(ctx.id), str(ctx.session_id), str(project_id), raw_content_for_index(ctx))
            for ctx, project_id in rows
        ]
    engine.dispose()

    print(f"{len(work)} notes to re-index{' (dry run)' if dry_run else ''}")
    if dry_run:
        return

    service = RagService()
    failed = 0
    for i, (context_id, session_id, project_id, raw_content) in enumerate(work, 1):
        try:
            service._reindex_sync(context_id, session_id, project_id, raw_content)
        except Exception as exc:  # keep going; report at the end
            failed += 1
            print(f"  failed {context_id}: {exc}")
        if i % 20 == 0 or i == len(work):
            print(f"  {i}/{len(work)}")
    print(f"done: {len(work) - failed} re-indexed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
