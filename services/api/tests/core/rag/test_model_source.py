"""
Where the embedding and reranker models load from (app/core/rag/embedder.py
model_source): the folder baked into the image when RAG_MODELS_DIR is set,
else the Hugging Face ID at its pinned revision. No model is loaded here.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from app.core.rag import embedder, model_specs
from app.core.rag.model_specs import EMBEDDING_MODEL, RERANKER_MODEL, REVISIONS, local_model_dir

MODELS = [EMBEDDING_MODEL, RERANKER_MODEL]


@pytest.mark.parametrize("model_id", MODELS)
def test_without_models_dir_loads_by_id_at_the_pinned_revision(monkeypatch, model_id: str) -> None:
    monkeypatch.setattr(embedder.settings, "rag_models_dir", None)
    assert embedder.model_source(model_id) == (model_id, {"revision": REVISIONS[model_id]})


@pytest.mark.parametrize("model_id", MODELS)
def test_with_models_dir_loads_the_local_folder(monkeypatch, tmp_path: Path, model_id: str) -> None:
    folder = local_model_dir(tmp_path, model_id)
    folder.mkdir(parents=True)
    (folder / "config.json").write_text("{}")
    monkeypatch.setattr(embedder.settings, "rag_models_dir", str(tmp_path))
    # No revision: a local folder has none, and passing one would be ignored.
    assert embedder.model_source(model_id) == (str(folder), {})


def test_a_models_dir_without_the_model_is_an_error_not_a_download(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(embedder.settings, "rag_models_dir", str(tmp_path))
    with pytest.raises(RuntimeError, match="not found in RAG_MODELS_DIR"):
        embedder.model_source(EMBEDDING_MODEL)


def test_the_app_and_the_download_script_use_the_same_pins() -> None:
    # The pipeline's reranker and the embedder are the pinned models.
    from app.core.rag import pipeline

    assert pipeline._RERANKER_MODEL == RERANKER_MODEL
    assert set(REVISIONS) == set(model_specs.MODEL_FILES) == set(MODELS)
    for revision in REVISIONS.values():
        assert len(revision) == 40 and int(revision, 16) >= 0  # a full commit hash, not "main"

    # scripts/download_models.py reads model_specs.py by path (no app import).
    script = Path(__file__).resolve().parents[3] / "scripts" / "download_models.py"
    spec = importlib.util.spec_from_file_location("download_models", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    loaded = module._load_specs()
    assert loaded.REVISIONS == REVISIONS and loaded.MODEL_FILES == model_specs.MODEL_FILES


def test_every_model_ships_weights_config_and_tokenizer() -> None:
    for model_id, files in model_specs.MODEL_FILES.items():
        for needed in ("config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json", "vocab.txt"):
            assert needed in files, (model_id, needed)
    # sentence-transformers pipeline config for the bi-encoder (Transformer +
    # Pooling + Normalize; Normalize has no files).
    for needed in ("modules.json", "sentence_bert_config.json", "1_Pooling/config.json"):
        assert needed in model_specs.MODEL_FILES[EMBEDDING_MODEL]
