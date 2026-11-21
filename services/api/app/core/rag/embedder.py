"""Singleton embedding model — loaded once on first use, thread-safe."""
from __future__ import annotations

import threading
from typing import Any

import torch
from sentence_transformers import SentenceTransformer

from app.core.rag.model_specs import EMBEDDING_MODEL, REVISIONS, local_model_dir
from app.core.settings import settings

# The API runs on CPU only (the image ships CPU-only torch, see Dockerfile).
# Stated explicitly so sentence-transformers never probes for a GPU.
DEVICE = "cpu"


def model_source(model_id: str) -> tuple[str, dict[str, Any]]:
    """What to pass sentence-transformers to load `model_id`: the folder baked
    into the image when RAG_MODELS_DIR is set, else the Hugging Face ID at its
    pinned revision. A configured folder that lacks the model is an error
    rather than a silent download, since the image runs offline."""
    if settings.rag_models_dir:
        path = local_model_dir(settings.rag_models_dir, model_id)
        if not (path / "config.json").is_file():
            raise RuntimeError(
                f"Model {model_id} not found in RAG_MODELS_DIR ({path}); "
                "run scripts/download_models.py or unset RAG_MODELS_DIR"
            )
        return str(path), {}
    return model_id, {"revision": REVISIONS[model_id]}

_lock: threading.Lock = threading.Lock()
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                # Process-wide: also applies to the reranker (app/core/rag/pipeline.py).
                torch.set_num_threads(max(1, settings.rag_torch_threads))
                source, kwargs = model_source(EMBEDDING_MODEL)
                _model = SentenceTransformer(source, device=DEVICE, **kwargs)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    return model.encode(texts, convert_to_numpy=True, show_progress_bar=False).tolist()


def embed_query(query: str) -> list[float]:
    model = _get_model()
    return model.encode(query, convert_to_numpy=True).tolist()
