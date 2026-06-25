"""Per-project ChromaDB collection manager — singleton client, lazy-init."""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, Dict, List

import chromadb

_lock: threading.Lock = threading.Lock()
_client: chromadb.PersistentClient | None = None

# Stored at Backend context-workspace/data/chromadb/
# parents[0]=rag/, parents[1]=core/, parents[2]=app/, parents[3]=Backend context-workspace/
CHROMA_DIR = Path(__file__).resolve().parents[3] / "data" / "chromadb"


def _get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                CHROMA_DIR.mkdir(parents=True, exist_ok=True)
                _client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return _client


def _collection_name(project_id: str) -> str:
    # ChromaDB names: 3-63 chars, letters/numbers/hyphens/underscores.
    # UUID has 36 chars with hyphens (allowed). Prefix brings total to 41 — within limit.
    safe = project_id.replace("-", "_")
    return f"proj_{safe}"


def get_collection(project_id: str):
    client = _get_client()
    return client.get_or_create_collection(
        name=_collection_name(project_id),
        metadata={"hnsw:space": "cosine"},
    )


def upsert_chunks(project_id: str, chunks: List[Dict[str, Any]]) -> None:
    """Insert or update embedding chunks for a project."""
    if not chunks:
        return
    col = get_collection(project_id)
    col.upsert(
        ids=[c["id"] for c in chunks],
        documents=[c["text"] for c in chunks],
        embeddings=[c["embedding"] for c in chunks],
        metadatas=[c["metadata"] for c in chunks],
    )


def retrieve(project_id: str, query_embedding: List[float], top_k: int = 10) -> List[Dict]:
    """Return top_k semantically similar chunks for a query embedding."""
    col = get_collection(project_id)
    try:
        count = col.count()
    except Exception:
        return []
    if count == 0:
        return []

    n = min(top_k, count)
    results = col.query(
        query_embeddings=[query_embedding],
        n_results=n,
        include=["distances", "metadatas", "documents"],
    )
    if not results or not results["ids"]:
        return []

    out: List[Dict] = []
    for rank, (cid, dist, text, meta) in enumerate(
        zip(
            results["ids"][0],
            results["distances"][0],
            results["documents"][0],
            results["metadatas"][0],
        ),
        start=1,
    ):
        out.append(
            {
                "chunk_id": cid,
                "score": float(1.0 / (1.0 + dist)),
                "rank": rank,
                "text": text,
                "metadata": meta,
            }
        )
    return out


def get_all_chunks(project_id: str) -> List[Dict]:
    """Fetch all stored chunks for a project (used to build the BM25 index at query time)."""
    col = get_collection(project_id)
    try:
        count = col.count()
    except Exception:
        return []
    if count == 0:
        return []

    results = col.get(include=["documents", "metadatas"])
    return [
        {"chunk_id": cid, "text": text, "metadata": meta}
        for cid, text, meta in zip(
            results["ids"], results["documents"], results["metadatas"]
        )
    ]


def chunk_count(project_id: str) -> int:
    try:
        return get_collection(project_id).count()
    except Exception:
        return 0
