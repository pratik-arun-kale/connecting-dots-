"""
app/api/v1/__init__.py
───────────────────────
Aggregate all v1 routers into a single APIRouter.
Mounted in main.py under the api_v1_prefix.
"""

from fastapi import APIRouter

from app.api.v1.routes.contexts import router as context_router
from app.api.v1.routes.health import router as health_router
from app.api.v1.routes.projects import router as project_router
from app.api.v1.routes.sessions import router as session_router

api_router = APIRouter()

api_router.include_router(health_router)
api_router.include_router(project_router)
api_router.include_router(session_router)
api_router.include_router(context_router)
