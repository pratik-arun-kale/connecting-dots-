"""
scripts/seed.py
────────────────
Fill a local API with demo data: one user, two projects, twenty notes.

It goes through the HTTP API (register/login, create project, capture), so
the data passes the same validation and ownership checks as real captures
and gets indexed for search and Ask AI the same way. Safe to run again: the
user is logged in if it exists, projects are matched by name, and every note
has a fixed idempotency key, so a second run adds nothing.

Start the stack first (`npm run dev:stack` from the repo root), then:

    python scripts/seed.py                                  # http://localhost:8000/api/v1
    python scripts/seed.py --api http://localhost:8000/api/v1
    python scripts/seed.py --email me@example.com --password '...'

Refuses to run against anything but localhost unless --allow-remote is given.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

DEFAULT_API = "http://localhost:8000/api/v1"
DEFAULT_EMAIL = "demo@example.com"
DEFAULT_PASSWORD = "demo-password-123"

# Bump when the notes below change, so a re-run captures the new set instead
# of replaying the old keys.
SEED_VERSION = "v1"

PROJECTS: dict[str, dict] = {
    "rag": {
        "name": "Thesis: retrieval-augmented generation",
        "description": "Reading notes and experiments for the RAG chapter.",
    },
    "rust": {
        "name": "Learning Rust",
        "description": "Ownership, async and the bits that keep tripping me up.",
    },
}

# (project, platform, chat_url, kind, prompt, body)
# platform "note" = a highlighted passage or written note; the API infers its
# source site from chat_url. Other platforms = a full conversation capture.
NOTES: list[tuple[str, str, str, str, str | None, str]] = [
    ("rag", "note", "https://chatgpt.com/c/seed-rag-1", "captured",
     "What is reciprocal rank fusion?",
     "**Reciprocal rank fusion** merges ranked lists by summing `1 / (k + rank)` for each "
     "document across lists, with `k` around 60. It needs no score calibration, which is why "
     "it works well for combining BM25 and vector search."),
    ("rag", "note", "https://claude.ai/chat/seed-rag-2", "captured",
     "When does a cross-encoder reranker help?",
     "A cross-encoder reads the query and passage together, so it scores relevance far better "
     "than a bi-encoder, but it is too slow for the whole corpus. Retrieve 50–100 candidates "
     "cheaply, then rerank the top ones."),
    ("rag", "note", "https://gemini.google.com/app/seed-rag-3", "captured",
     "How big should chunks be?",
     "Start with 300–500 tokens and 10–15% overlap. Smaller chunks raise precision but lose "
     "context; split on headings and paragraphs before falling back to a token count."),
    ("rag", "note", "", "written", None,
     "Eval plan: 50 questions over my own notes, measure recall@5 and MRR for retrieval, and "
     "faithfulness for answers. Fail a release if any metric drops more than 5%."),
    ("rag", "note", "https://chatgpt.com/c/seed-rag-5", "captured",
     "What is HyDE?",
     "HyDE (hypothetical document embeddings) asks the LLM to write a fake answer, embeds that, "
     "and searches with it. It helps when questions are short and phrased differently from the "
     "documents."),
    ("rag", "note", "https://claude.ai/chat/seed-rag-6", "captured",
     "How do I keep tenants apart in a vector store?",
     "Store `user_id` and `project_id` in each chunk's metadata and pass them as a filter on "
     "every query, or keep one collection per tenant. Never filter after retrieval: top-k is "
     "computed before the filter and can return nothing."),
    ("rag", "note", "", "written", None,
     "Idea: cache answers by (user, project, normalised question). Invalidate the project's "
     "cache entries whenever a note in it is added, edited or deleted."),
    ("rag", "claude", "https://claude.ai/chat/seed-rag-8", "captured", None,
     "Confidence grading: after retrieval, ask a small model whether the passages answer the "
     "question (yes / partly / no). On 'no', say so instead of letting the LLM guess."),
    ("rag", "note", "https://gemini.google.com/app/seed-rag-9", "captured",
     "BM25 parameters?",
     "BM25 defaults `k1 = 1.2` and `b = 0.75` are fine for most text. Lower `b` if documents "
     "vary a lot in length and long ones are being unfairly penalised."),
    ("rag", "note", "", "written", None,
     "Read next: ColBERT late interaction, and the bge-m3 paper for multilingual embeddings."),
    ("rust", "note", "https://chatgpt.com/c/seed-rust-1", "captured",
     "Why can't I borrow mutably twice?",
     "Rust allows either one `&mut T` or any number of `&T` at a time. Two mutable borrows "
     "could alias, so the borrow checker rejects them at compile time; split the data or scope "
     "the first borrow so it ends earlier."),
    ("rust", "note", "https://claude.ai/chat/seed-rust-2", "captured",
     "String vs &str?",
     "`String` owns a growable heap buffer; `&str` is a borrowed view into UTF-8 bytes. Take "
     "`&str` in function parameters so callers can pass either."),
    ("rust", "note", "https://gemini.google.com/app/seed-rust-3", "captured",
     "What does ? do?",
     "`?` returns early with the error if the `Result` is `Err`, converting it with `From`. It "
     "only works in functions that themselves return a compatible `Result` or `Option`."),
    ("rust", "note", "", "written", None,
     "Lifetimes are descriptive, not prescriptive: they tell the compiler how long references "
     "already live, they never make anything live longer."),
    ("rust", "chatgpt", "https://chatgpt.com/c/seed-rust-5", "captured", None,
     "`Box<dyn Trait>` gives dynamic dispatch with one heap allocation; generics with trait "
     "bounds give static dispatch and monomorphised code. Prefer generics unless you need a "
     "mixed collection."),
    ("rust", "note", "https://claude.ai/chat/seed-rust-6", "captured",
     "Arc vs Rc?",
     "`Rc` is a single-threaded reference count; `Arc` uses atomic operations so it is `Send + "
     "Sync`. Wrap in `Mutex` or `RwLock` to mutate shared data across threads."),
    ("rust", "note", "https://chatgpt.com/c/seed-rust-7", "captured",
     "Why does my async fn not run?",
     "Futures are lazy: calling an `async fn` only builds the future. Nothing happens until it "
     "is `.await`ed or handed to a runtime with `tokio::spawn`."),
    ("rust", "note", "", "written", None,
     "To try: rewrite the CSV parser with iterators instead of index loops and compare speed "
     "with `cargo bench`."),
    ("rust", "gemini", "https://gemini.google.com/app/seed-rust-9", "captured", None,
     "`impl Trait` in argument position is sugar for a generic parameter; in return position it "
     "hides a single concrete type from the caller."),
    ("rust", "note", "https://claude.ai/chat/seed-rust-10", "captured",
     "How do I share config across the app?",
     "Build it once at startup and pass `Arc<Config>` (or `&'static Config` via `OnceLock`) "
     "rather than reading globals; tests can then construct their own."),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--api", default=DEFAULT_API, help=f"API base URL (default {DEFAULT_API})")
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--password", default=DEFAULT_PASSWORD)
    parser.add_argument("--allow-remote", action="store_true",
                        help="allow an API that is not on localhost")
    args = parser.parse_args()

    host = urlparse(args.api).hostname or ""
    if host not in ("localhost", "127.0.0.1", "::1") and not args.allow_remote:
        print(f"refusing to seed {args.api}: not localhost (pass --allow-remote to override)")
        return 2

    with httpx.Client(base_url=args.api.rstrip("/"), timeout=30) as client:
        try:
            token = _sign_in(client, args.email, args.password)
        except httpx.ConnectError:
            print(f"cannot reach {args.api} — start the stack first (npm run dev:stack)")
            return 1
        client.headers["Authorization"] = f"Bearer {token}"

        project_ids = _ensure_projects(client)
        # Idempotency keys are unique across ALL users, so they include the
        # account: seeding a second account must not collide with the first.
        key_prefix = f"seed-{SEED_VERSION}-{hashlib.sha256(args.email.encode()).hexdigest()[:12]}"

        created = 0
        for i, (project, platform, chat_url, kind, prompt, body) in enumerate(NOTES, 1):
            created += _capture(client, project_ids[project], key_prefix, i,
                                platform, chat_url, kind, prompt, body)

    print(f"seeded {args.email} / {args.password}: {len(project_ids)} projects, "
          f"{created} new notes ({len(NOTES) - created} already there)")
    return 0


def _sign_in(client: httpx.Client, email: str, password: str) -> str:
    resp = client.post("/auth/register", json={"email": email, "password": password})
    if resp.status_code == 201:
        print(f"registered {email}")
        return resp.json()["access_token"]
    # Already registered (or register is rate-limited): log in instead.
    resp = client.post("/auth/login", json={"email": email, "password": password})
    _check(resp, "log in")
    print(f"logged in as {email}")
    return resp.json()["access_token"]


def _ensure_projects(client: httpx.Client) -> dict[str, str]:
    resp = client.get("/projects", params={"limit": 200})
    _check(resp, "list projects")
    by_name = {p["name"]: p["id"] for p in resp.json()["items"]}

    ids: dict[str, str] = {}
    for slug, spec in PROJECTS.items():
        if spec["name"] in by_name:
            ids[slug] = by_name[spec["name"]]
            continue
        resp = client.post("/projects", json=spec)
        _check(resp, f"create project {spec['name']!r}")
        ids[slug] = resp.json()["id"]
        print(f"created project {spec['name']!r}")
    return ids


def _capture(client: httpx.Client, project_id: str, key_prefix: str, i: int, platform: str,
             chat_url: str, kind: str, prompt: str | None, body: str) -> int:
    if platform == "note":
        messages = [{"role": "assistant" if kind == "captured" else "user",
                     "content": body, "timestamp": None, "index": 0}]
    else:  # a full conversation: the question, then the answer
        messages = [
            {"role": "user", "content": "Explain this briefly.", "timestamp": None, "index": 0},
            {"role": "assistant", "content": body, "timestamp": None, "index": 1},
        ]
    payload = {
        "idempotency_key": f"{key_prefix}-{i:02d}",
        "platform": platform,
        "chat_url": chat_url,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "title": _title(prompt, body),
        "messages": messages,
        "kind": kind,
        "prompt_text": prompt,
    }
    resp = client.post(f"/projects/{project_id}/capture", json=payload)
    _check(resp, f"capture note {i}")
    return 1 if resp.json()["created"] else 0


def _title(prompt: str | None, body: str) -> str:
    text = prompt or body.replace("*", "").replace("`", "")
    return text if len(text) <= 80 else text[:77].rstrip() + "…"


def _check(resp: httpx.Response, what: str) -> None:
    if resp.is_success:
        return
    print(f"failed to {what}: HTTP {resp.status_code} {resp.text[:300]}")
    sys.exit(1)


if __name__ == "__main__":
    sys.exit(main())
