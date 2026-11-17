"""
app/db/soft_delete.py
──────────────────────
Trashed projects and notes (deleted_at set) are invisible to every ORM
query, in one place rather than in each repository method: a route can't
forget the filter. That includes joins, so a note in a trashed project is
hidden too, and a count of a project's notes leaves out trashed ones.

The Trash itself opts out per statement:
    select(...).execution_options(include_deleted=True)

Bulk UPDATE/DELETE statements and raw SQL aren't filtered.
"""
from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from app.models.context import Context
from app.models.project import Project

INCLUDE_DELETED = "include_deleted"


@event.listens_for(Session, "do_orm_execute")
def _hide_trashed(state: ORMExecuteState) -> None:
    if (
        not state.is_select
        or state.is_column_load
        or state.is_relationship_load
        or state.execution_options.get(INCLUDE_DELETED, False)
    ):
        return
    state.statement = state.statement.options(
        with_loader_criteria(Project, lambda cls: cls.deleted_at.is_(None), include_aliases=True),
        with_loader_criteria(Context, lambda cls: cls.deleted_at.is_(None), include_aliases=True),
    )
