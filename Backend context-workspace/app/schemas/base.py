"""
app/schemas/base.py
────────────────────
Shared Pydantic v2 base models and type aliases used across all schemas.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict


# ── Base configuration ────────────────────────────────────────────────────────

class AppBaseModel(BaseModel):
    """Project-wide base model.

    from_attributes=True  → needed for ORM → schema conversion (model_validate).
    populate_by_name=True → allow both alias and field name.
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        use_enum_values=True,
    )


# ── Generic paginated response wrapper ───────────────────────────────────────
# Ready for use when list endpoints need pagination metadata.

T = TypeVar("T")


class PaginatedResponse(AppBaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int = 1
    page_size: int = 20

    @property
    def pages(self) -> int:
        if self.page_size == 0:
            return 0
        return -(-self.total // self.page_size)  # ceiling division


# ── Common field types ────────────────────────────────────────────────────────

UUIDStr = uuid.UUID
JsonDict = dict[str, Any]
