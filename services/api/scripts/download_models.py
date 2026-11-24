"""
Download the API's embedding and reranker models into a folder, at the exact
revisions pinned in app/core/rag/model_specs.py. The Docker build runs this so
the image starts without internet access (see RAG_MODELS_DIR in settings.py).

    python scripts/download_models.py /opt/models

Only the files sentence-transformers loads are fetched (model_specs.MODEL_FILES),
not the ONNX/OpenVINO/TF/Flax copies of the weights. Exits non-zero if any
file is missing afterwards.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from huggingface_hub import snapshot_download


def _load_specs():
    # Loaded by path, not `import app...`: during the Docker build only this
    # script and model_specs.py are in the image, not the app or its settings.
    path = Path(__file__).resolve().parents[1] / "app" / "core" / "rag" / "model_specs.py"
    spec = importlib.util.spec_from_file_location("model_specs", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main(models_dir: str) -> int:
    specs = _load_specs()
    missing: list[str] = []
    for model_id, revision in specs.REVISIONS.items():
        target = specs.local_model_dir(models_dir, model_id)
        files = specs.MODEL_FILES[model_id]
        snapshot_download(repo_id=model_id, revision=revision, local_dir=target, allow_patterns=files)
        # snapshot_download keeps a small .cache/ of download metadata; the
        # API doesn't need it.
        for meta in target.glob(".cache"):
            for p in sorted(meta.rglob("*"), reverse=True):
                p.unlink() if p.is_file() else p.rmdir()
            meta.rmdir()
        got = [f for f in files if (target / f).is_file()]
        missing += [f"{model_id}/{f}" for f in files if f not in got]
        size = sum(p.stat().st_size for p in target.rglob("*") if p.is_file())
        print(f"{model_id}@{revision[:7]} -> {target} ({len(got)} files, {size / 2**20:.1f} MB)")
    if missing:
        print("missing after download: " + ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
