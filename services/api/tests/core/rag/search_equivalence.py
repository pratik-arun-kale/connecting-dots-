"""
tests/core/rag/search_equivalence.py
─────────────────────────────────────
A fixed corpus and fixed questions, run through the real models, so search
results can be compared across a change of storage (ChromaDB → Postgres,
beta plan M2.4). Not collected by pytest itself: test_search_equivalence.py
uses it, and it can record a new baseline:

    python -m tests.core.rag.search_equivalence --record

The corpus is the 20 notes of scripts/seed.py plus 10 more, indexed in a fixed
order with fixed ids, so everything that depends on order (the learned
vocabulary, chunk order for BM25) is the same on every run.

Recorded for each query: vector_store.retrieve's top 10 (ids and scores, the
part storage decides), conversation search's top 5 and the query it settled
on, and Ask AI's confidence and cited chunks with their reranker scores.
OpenAI is never called (no key): Ask AI's answer text is not compared.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import uuid
from pathlib import Path
from typing import Any

BASELINE = Path(__file__).parent / "fixtures" / "search_baseline.json"
_NS = uuid.UUID("6d1f3c2a-9b7e-4c55-8a41-2f0e7c1d9b33")
API_ROOT = Path(__file__).resolve().parents[3]


def _id(kind: str, key: str) -> str:
    return str(uuid.uuid5(_NS, f"{kind}:{key}"))


def _seed_notes() -> list[tuple[str, str, str, str, str | None, str]]:
    spec = importlib.util.spec_from_file_location("_seed", API_ROOT / "scripts" / "seed.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return list(module.NOTES)


EXTRA_NOTES: list[tuple[str, str, str, str, str | None, str]] = [
    ("rag", "chatgpt", "https://chatgpt.com/c/eq-1", "captured", "How do HNSW indexes work?",
     "HNSW builds a layered proximity graph: search starts at the sparse top layer and greedily "
     "walks down. ef_search trades recall for speed; m controls how many neighbours each node keeps."),
    ("rag", "note", "https://claude.ai/chat/eq-2", "captured", "What is query rewriting?",
     "Query rewriting turns a vague question into one or more precise searches, for example by "
     "expanding acronyms, fixing typos against the corpus vocabulary, or splitting compound questions."),
    ("rag", "note", "", "written", None,
     "Idea: cache embeddings of frequent questions in Postgres with pgvector so repeated Ask AI "
     "queries skip the embedding model. Measure the hit rate first."),
    ("rag", "gemini", "https://gemini.google.com/app/eq-4", "captured", "BM25 parameters?",
     "BM25 has k1 (term frequency saturation, usually 1.2 to 2.0) and b (length normalisation, 0.75). "
     "Short notes favour a lower b so long notes aren't punished too much."),
    ("rag", "note", "https://chatgpt.com/c/eq-5", "captured", "Faithfulness metrics",
     "Faithfulness checks that every claim in an answer is supported by the retrieved context. "
     "RAGAS estimates it with an LLM judge; spot-check the judge against human labels."),
    ("rust", "note", "https://chatgpt.com/c/eq-6", "captured", "What does Pin do?",
     "Pin<P> promises the value behind the pointer will not move, which self-referential futures "
     "need. Most code only meets it through Box::pin or the pin! macro when polling futures by hand."),
    ("rust", "claude", "https://claude.ai/chat/eq-7", "captured", "Arc vs Rc",
     "Rc counts references on one thread; Arc uses atomic counts so it is Send and Sync. Wrap shared "
     "mutable state as Arc<Mutex<T>>, or Arc<RwLock<T>> when reads dominate."),
    ("rust", "note", "", "written", None,
     "Lifetimes cheat sheet: 'a on a reference says it lives at least as long as 'a. Elision covers "
     "most functions; structs holding references always need explicit lifetimes."),
    ("rust", "note", "https://gemini.google.com/app/eq-9", "captured", "Tokio select",
     "tokio::select! waits on several futures and runs the branch of whichever finishes first, "
     "dropping the rest. Cancellation safety matters: a dropped future must not lose data."),
    ("rust", "chatgpt", "https://chatgpt.com/c/eq-10", "captured", "Error handling crates",
     "Use thiserror for library error enums and anyhow for applications. The ? operator converts "
     "errors through From, and context() adds a message without losing the source."),
]

SEARCHES: list[tuple[str, str]] = [
    ("rag", "reciprocal rank fusion"),
    ("rag", "reranker cross encoder"),
    ("rag", "chunk size overlap"),
    ("rag", "evaluation recall mrr"),
    ("rag", "hnsw graph search"),
    ("rag", "bm25 k1 parameter"),
    ("rag", "faithfulness judge"),
    ("rag", "query rewritting typos"),
    ("rag", "pgvector embeddings cache"),
    ("rag", "how do i combine keyword and vector search"),
    ("rust", "ownership borrow checker"),
    ("rust", "async tokio runtime"),
    ("rust", "pin self referential"),
    ("rust", "arc mutex shared state"),
    ("rust", "lifetimes in structs"),
    ("rust", "error handling anyhow"),
    ("rust", "tokio select cancellation"),
    ("rust", "trait objects dyn"),
    ("rust", "lifetimez"),
    ("rust", "unrelated cooking recipe pasta"),
]

QUESTIONS: list[tuple[str, str]] = [
    ("rag", "Why does reciprocal rank fusion not need score calibration?"),
    ("rag", "How many candidates should I rerank with a cross-encoder?"),
    ("rag", "What chunk size should I start with?"),
    ("rag", "What does ef_search change in HNSW?"),
    ("rag", "How do I measure faithfulness?"),
    ("rust", "When should I use Arc instead of Rc?"),
    ("rust", "What is Pin for?"),
    ("rust", "Which crate should a library use for errors?"),
    ("rust", "What happens to the other futures in tokio select?"),
    ("rust", "Do structs with references need lifetimes?"),
]


def corpus() -> list[dict[str, Any]]:
    """Each note as (ids, raw_content) in the shape RagService._index_sync takes."""
    out = []
    for i, (project, platform, chat_url, _kind, prompt, body) in enumerate(_seed_notes() + EXTRA_NOTES):
        if platform == "note":
            messages = [{"role": "user", "content": body, "timestamp": None, "index": 0}]
        else:
            messages = [
                {"role": "user", "content": prompt or "Explain this briefly.", "timestamp": None, "index": 0},
                {"role": "assistant", "content": body, "timestamp": None, "index": 1},
            ]
        title = prompt or body[:80]
        out.append({
            "context_id": _id("context", str(i)),
            "session_id": _id("session", project),
            "project_id": _id("project", project),
            "raw_content": {"title": title, "platform": platform, "chat_url": chat_url,
                            "messages": messages, "metadata": {}},
        })
    return out


def project_id(name: str) -> str:
    return _id("project", name)


def index_corpus() -> None:
    from app.services.rag_service import RagService

    service = RagService()
    for note in corpus():
        service._index_sync(note["context_id"], note["session_id"], note["project_id"], note["raw_content"])


def run_queries() -> dict[str, Any]:
    from app.core.rag import embedder, pipeline, vector_store

    out: dict[str, Any] = {"chunk_order": {}, "vector": {}, "search": {}, "ask": {}}
    for name in ("rag", "rust"):
        pid = project_id(name)
        out["chunk_order"][name] = [c["chunk_id"] for c in vector_store.get_all_chunks(pid)]
    for name, query in SEARCHES:
        pid = project_id(name)
        hits = vector_store.retrieve(pid, embedder.embed_query(query), top_k=10)
        out["vector"][f"{name}: {query}"] = [[h["chunk_id"], h["score"]] for h in hits]
        result = pipeline.search_conversations(pid, query, top_k=5)
        out["search"][f"{name}: {query}"] = {
            "query_used": result["query_used"],
            "top": [[c["conversation_id"], c["relevance_score"]] for c in result["conversations"][:5]],
        }
    for name, question in QUESTIONS:
        result = pipeline.run_query(project_id(name), question)
        out["ask"][f"{name}: {question}"] = {
            "confidence": result["confidence"],
            "citations": [[c["chunk_id"], c["reranker_score"]] for c in result["citations"]],
        }
    return out


def compare(baseline: dict[str, Any], now: dict[str, Any], tol: float = 1e-5) -> list[str]:
    """Differences as readable lines; empty when ids match in order and scores within tol."""
    problems: list[str] = []

    def ranked(where: str, a: list, b: list) -> None:
        ids_a, ids_b = [x[0] for x in a], [x[0] for x in b]
        if ids_a != ids_b:
            problems.append(f"{where}: order {ids_a} != {ids_b}")
            return
        for (cid, sa), (_, sb) in zip(a, b, strict=True):
            if abs(sa - sb) > tol:
                problems.append(f"{where}: {cid} score {sa} vs {sb}")

    for name, order in baseline["chunk_order"].items():
        if order != now["chunk_order"].get(name):
            problems.append(f"chunk order differs for {name}")
    for key, hits in baseline["vector"].items():
        ranked(f"vector[{key}]", hits, now["vector"][key])
    for key, res in baseline["search"].items():
        if res["query_used"] != now["search"][key]["query_used"]:
            problems.append(f"search[{key}]: query_used {res['query_used']!r} != {now['search'][key]['query_used']!r}")
        ranked(f"search[{key}]", res["top"], now["search"][key]["top"])
    for key, res in baseline["ask"].items():
        if res["confidence"] != now["ask"][key]["confidence"]:
            problems.append(f"ask[{key}]: confidence {res['confidence']} != {now['ask'][key]['confidence']}")
        ranked(f"ask[{key}]", res["citations"], now["ask"][key]["citations"])
    return problems


def _record_with_current_storage() -> None:
    """Index into whatever storage the code uses now, in a throwaway place."""
    import tempfile

    import app.db  # noqa: F401  (models first, or app.services hits a circular import)
    from app.core.settings import settings

    settings.openai_api_key = None
    # ignore_cleanup_errors: on Windows ChromaDB keeps its files open.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        from app.core.rag import vector_store, vocabulary

        if hasattr(vector_store, "CHROMA_DIR"):  # ChromaDB storage: point it at the temp folder
            vector_store.CHROMA_DIR = Path(tmp) / "chromadb"
            vector_store._client = None
            vocabulary.VOCAB_DIR = Path(tmp) / "vocabulary"
        index_corpus()
        result = run_queries()
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        BASELINE.write_text(json.dumps(result, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"recorded {BASELINE} ({len(result['vector'])} searches, {len(result['ask'])} questions)")


if __name__ == "__main__":
    if sys.argv[1:] != ["--record"]:
        sys.exit("usage: python -m tests.core.rag.search_equivalence --record")
    _record_with_current_storage()
