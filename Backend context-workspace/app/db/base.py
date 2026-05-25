"""
app/db/base.py
───────────────
Declarative base shared by all ORM models.
Importing this module is enough to register all models with Alembic
(via the import in alembic/env.py).
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Project-wide SQLAlchemy declarative base."""

    # Subclasses can override __tablename__; no shared columns here so that
    # each model owns its schema completely.


# Import all models so Alembic's autogenerate can see them.
# Keep this list in sync when adding new model modules.
from app.models import context, project, session  # noqa: E402, F401
