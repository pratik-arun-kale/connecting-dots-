"""
app/core/rag/model_specs.py
───────────────────────────
The two Hugging Face models the API runs, pinned to exact revisions, and the
files each one needs. Standard library only: scripts/download_models.py loads
this file on its own during the Docker build, before the app is installed.

Revisions are the commits the API was already running (the local cache's
refs/main when they were pinned). Changing one changes embeddings or reranker
scores, so existing indexes would need a re-index (scripts/reindex_notes.py).

In the image the models live under RAG_MODELS_DIR (the Dockerfile sets
/opt/models) and load with Hugging Face offline mode on. Without
RAG_MODELS_DIR (local development) they load by ID at the same revision,
from the Hugging Face cache.
"""
from __future__ import annotations

from pathlib import Path

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"

RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
RERANKER_REVISION = "233902d25c440f23af6f7d6e94d2946bac0bee0a"

# What sentence-transformers actually fetches for each model: safetensors
# weights, model and tokenizer config, and the sentence-transformers module
# config. The repos also hold ONNX, OpenVINO, TensorFlow, Flax and Rust copies
# of the weights, which the API never loads.
_TOKENIZER_FILES = [
    "config.json",
    "model.safetensors",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.txt",
    "README.md",
]
MODEL_FILES: dict[str, list[str]] = {
    EMBEDDING_MODEL: [
        *_TOKENIZER_FILES,
        "modules.json",
        "sentence_bert_config.json",
        "config_sentence_transformers.json",
        "1_Pooling/config.json",
    ],
    RERANKER_MODEL: list(_TOKENIZER_FILES),
}

REVISIONS: dict[str, str] = {
    EMBEDDING_MODEL: EMBEDDING_REVISION,
    RERANKER_MODEL: RERANKER_REVISION,
}


def local_model_dir(models_dir: str | Path, model_id: str) -> Path:
    """Where a model sits under RAG_MODELS_DIR: one folder per model, named
    like the Hugging Face cache does ("org--name")."""
    return Path(models_dir) / model_id.replace("/", "--")
