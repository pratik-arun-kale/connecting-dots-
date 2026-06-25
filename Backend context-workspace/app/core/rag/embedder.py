"""Singleton embedding model — loaded once on first use, thread-safe."""
from __future__ import annotations

import threading
from typing import List

from sentence_transformers import SentenceTransformer

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

_lock: threading.Lock = threading.Lock()
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def embed_texts(texts: List[str]) -> List[List[float]]:
    model = _get_model()
    return model.encode(texts, convert_to_numpy=True, show_progress_bar=False).tolist()


def embed_query(query: str) -> List[float]:
    model = _get_model()
    return model.encode(query, convert_to_numpy=True).tolist()
