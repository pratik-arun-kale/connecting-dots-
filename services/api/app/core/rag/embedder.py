"""Singleton embedding model — loaded once on first use, thread-safe."""
from __future__ import annotations

import threading

import torch
from sentence_transformers import SentenceTransformer

from app.core.settings import settings

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
# The API runs on CPU only (the image ships CPU-only torch, see Dockerfile).
# Stated explicitly so sentence-transformers never probes for a GPU.
DEVICE = "cpu"

_lock: threading.Lock = threading.Lock()
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                # Process-wide: also applies to the reranker (app/core/rag/pipeline.py).
                torch.set_num_threads(max(1, settings.rag_torch_threads))
                _model = SentenceTransformer(EMBEDDING_MODEL, device=DEVICE)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    return model.encode(texts, convert_to_numpy=True, show_progress_bar=False).tolist()


def embed_query(query: str) -> list[float]:
    model = _get_model()
    return model.encode(query, convert_to_numpy=True).tolist()
