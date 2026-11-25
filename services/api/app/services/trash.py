"""
app/services/trash.py
──────────────────────
The Trash: what deleting a note or project does now, and what undoes it.

  - Deleting sets deleted_at; the row disappears from every other query
    (app/db/soft_delete.py). A trashed note's search chunks are removed at
    once, so it can't turn up in search or Ask AI; restoring re-indexes it.
    A trashed project keeps its vectors until it is purged (all its routes
    already 404, so nothing can query them).
  - Restore clears deleted_at. A note in a trashed project comes back with
    its project, not on its own.
  - Delete forever, or the purge after settings.trash_retention_days, removes
    the rows and their vectors and vocabulary for good.
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException
from app.core.logging import get_logger
from app.core.rag import vector_store, vocabulary
from app.core.settings import settings
from app.db.soft_delete import INCLUDE_DELETED
from app.models.context import Context
from app.models.project import Project
from app.models.session import Session

logger = get_logger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def purge_at(deleted_at: datetime) -> datetime:
    return deleted_at + timedelta(days=settings.trash_retention_days)


@dataclass
class TrashedNote:
    context: Context
    project: Project


@dataclass
class TrashedProject:
    project: Project
    notes_count: int


class TrashService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Lookups (these see trashed rows) ──────────────────────────────────────

    def _trashed_notes(self, owner_id: uuid.UUID):
        # Only notes trashed on their own: a note inside a trashed project is
        # listed (and restored) with that project.
        return (
            select(Context, Project)
            .join(Session, Context.session_id == Session.id)
            .join(Project, Session.project_id == Project.id)
            .where(Project.user_id == owner_id, Context.deleted_at.is_not(None), Project.deleted_at.is_(None))
            .execution_options(**{INCLUDE_DELETED: True})
        )

    async def _trashed_note(self, context_id: uuid.UUID, owner_id: uuid.UUID) -> TrashedNote:
        row = (await self._db.execute(self._trashed_notes(owner_id).where(Context.id == context_id))).first()
        if row is None:
            raise NotFoundException(f"Note {context_id} is not in the Trash.")
        return TrashedNote(row[0], row[1])

    async def _trashed_project(self, project_id: uuid.UUID, owner_id: uuid.UUID) -> Project:
        project = (
            await self._db.execute(
                select(Project)
                .where(Project.id == project_id, Project.user_id == owner_id, Project.deleted_at.is_not(None))
                .execution_options(**{INCLUDE_DELETED: True})
            )
        ).scalar_one_or_none()
        if project is None:
            raise NotFoundException(f"Project {project_id} is not in the Trash.")
        return project

    async def list(self, owner_id: uuid.UUID) -> tuple[list[TrashedProject], list[TrashedNote]]:
        projects = (
            await self._db.execute(
                select(Project)
                .where(Project.user_id == owner_id, Project.deleted_at.is_not(None))
                .order_by(Project.deleted_at.desc())
                .execution_options(**{INCLUDE_DELETED: True})
            )
        ).scalars().all()
        counts: dict[uuid.UUID, int] = {}
        if projects:
            rows = await self._db.execute(
                select(Session.project_id, func.count(Context.id))
                .join(Context, Context.session_id == Session.id)
                .where(Session.project_id.in_([p.id for p in projects]), Context.deleted_at.is_(None))
                .group_by(Session.project_id)
                .execution_options(**{INCLUDE_DELETED: True})
            )
            counts = dict(rows.tuples().all())

        notes = (
            await self._db.execute(self._trashed_notes(owner_id).order_by(Context.deleted_at.desc()).limit(500))
        ).all()
        return (
            [TrashedProject(p, counts.get(p.id, 0)) for p in projects],
            [TrashedNote(c, p) for c, p in notes],
        )

    # ── Restore ───────────────────────────────────────────────────────────────

    async def restore_note(self, context_id: uuid.UUID, owner_id: uuid.UUID) -> TrashedNote:
        trashed = await self._trashed_note(context_id, owner_id)
        note = trashed.context
        if note.content_hash is not None:
            # The same passage may have been captured again while this copy
            # was in the Trash. Keep both rather than refuse the restore; only
            # the live one stays the duplicate-check original.
            live = (
                await self._db.execute(select(Context.id).where(Context.content_hash == note.content_hash))
            ).first()
            if live is not None:
                note.content_hash = None
        note.deleted_at = None
        # Its chunks went when it was trashed: mark it unindexed so the next
        # search or Ask AI question on the project re-indexes it.
        note.indexed_version = None
        await self._db.flush()
        logger.info("note_restored", context_id=str(context_id))
        return trashed

    async def restore_project(self, project_id: uuid.UUID, owner_id: uuid.UUID) -> Project:
        project = await self._trashed_project(project_id, owner_id)
        project.deleted_at = None
        await self._db.flush()
        logger.info("project_restored", project_id=str(project_id))
        return project

    # ── Delete for good ───────────────────────────────────────────────────────

    async def delete_note_forever(self, context_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        trashed = await self._trashed_note(context_id, owner_id)
        await self._db.execute(delete(Context).where(Context.id == context_id))
        vector_store.delete_context_chunks(str(trashed.project.id), str(context_id))
        logger.info("note_deleted_forever", context_id=str(context_id))

    async def delete_project_forever(self, project_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        await self._trashed_project(project_id, owner_id)
        await self._remove_projects([project_id])
        logger.info("project_deleted_forever", project_id=str(project_id))

    async def _remove_projects(self, project_ids: list[uuid.UUID]) -> None:
        # Sessions and their notes go with the project (ON DELETE CASCADE).
        await self._db.execute(delete(Project).where(Project.id.in_(project_ids)))
        for pid in project_ids:
            vector_store.delete_project_collection(str(pid))
            vocabulary.delete_vocabulary(str(pid))

    # ── Purge (scheduled) ─────────────────────────────────────────────────────

    async def purge_expired(self, now: datetime | None = None) -> tuple[int, int]:
        """Remove everything trashed longer ago than the retention period, for
        every user. Returns (notes, projects) removed. Safe to run often."""
        cutoff = (now or _now()) - timedelta(days=settings.trash_retention_days)
        include = {INCLUDE_DELETED: True}

        project_ids = list(
            (
                await self._db.execute(
                    select(Project.id).where(Project.deleted_at < cutoff).execution_options(**include)
                )
            ).scalars()
        )
        if project_ids:
            await self._remove_projects(project_ids)

        notes = (
            await self._db.execute(
                select(Context.id, Session.project_id)
                .join(Session, Context.session_id == Session.id)
                .where(Context.deleted_at < cutoff)
                .execution_options(**include)
            )
        ).all()
        if notes:
            await self._db.execute(delete(Context).where(Context.id.in_([cid for cid, _ in notes])))
            for cid, pid in notes:
                vector_store.delete_context_chunks(str(pid), str(cid))

        if project_ids or notes:
            logger.info("trash_purged", notes=len(notes), projects=len(project_ids))
        # Search chunks whose note is gone (a best-effort delete that failed,
        # or a capture whose request rolled back after indexing).
        try:
            await asyncio.to_thread(vector_store.delete_orphans)
        except Exception:
            logger.warning("vector_orphan_sweep_failed", exc_info=True)
        return len(notes), len(project_ids)
