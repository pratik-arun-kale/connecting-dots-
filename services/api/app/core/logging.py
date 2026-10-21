"""
app/core/logging.py
────────────────────
Structured logging via structlog.
JSON output for production, coloured console for development.
"""

import logging
import sys

import structlog
from structlog.types import EventDict, Processor

from app.core.settings import settings


def _add_app_context(
    logger: logging.Logger, method: str, event_dict: EventDict
) -> EventDict:
    """Inject static application metadata into every log record."""
    event_dict["app"] = settings.app_name
    event_dict["version"] = settings.app_version
    event_dict["env"] = settings.app_env
    return event_dict


def _drop_color_message_key(
    logger: logging.Logger, method: str, event_dict: EventDict
) -> EventDict:
    """Remove uvicorn's colour_message key to keep logs clean."""
    event_dict.pop("color_message", None)
    return event_dict


def configure_logging() -> None:
    """Call once at application startup to configure structlog + stdlib logging."""

    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        _add_app_context,
        _drop_color_message_key,
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.log_format == "json":
        renderer: Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=shared_processors
        + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(settings.log_level)

    # Quiet noisy third-party loggers
    for noisy in ("uvicorn.access", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    """Convenience wrapper — call anywhere to get a bound structlog logger."""
    return structlog.get_logger(name)
