"""
app/core/rag/ollama_generator.py

Generates answers from reranked chunks using a local Ollama LLM.

Called synchronously from pipeline.run_query() via asyncio.to_thread().
Uses httpx.Client (already a project dependency) — no new packages needed.

Config (env vars with defaults):
  OLLAMA_MODEL           default: qwen2.5:3b
  OLLAMA_API_URL         default: http://localhost:11434
  OLLAMA_TEMPERATURE     default: 0.1
  OLLAMA_MAX_TOKENS      default: 512
  OLLAMA_TIMEOUT_SEC     default: 60
  OLLAMA_CONTEXT_CHUNKS  default: 5

If Ollama is not running or the model is missing, generate_answer() falls back
to returning the top chunk's raw text so the rest of the pipeline still works.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

import httpx

logger = logging.getLogger(__name__)

# ── Config (override via environment variables) ───────────────────────────────
OLLAMA_MODEL: str = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_API_URL: str = os.environ.get("OLLAMA_API_URL", "http://localhost:11434").rstrip("/")
OLLAMA_TEMPERATURE: float = float(os.environ.get("OLLAMA_TEMPERATURE", "0.1"))
OLLAMA_MAX_TOKENS: int = int(os.environ.get("OLLAMA_MAX_TOKENS", "512"))
OLLAMA_TIMEOUT_SEC: int = int(os.environ.get("OLLAMA_TIMEOUT_SEC", "180"))  # 3 min — CPU inference is slow
OLLAMA_CONTEXT_CHUNKS: int = int(os.environ.get("OLLAMA_CONTEXT_CHUNKS", "3"))  # 3 chunks keeps prompt lean

_NOT_FOUND = "I couldn't find that information in the provided conversations."

_PROMPT_TEMPLATE = """\
You are a helpful assistant that answers questions about the user's AI conversations.

Answer the user's question using ONLY the provided context excerpts from their captured conversations.
If the answer is not present in the context, say:
"{not_found}"

Context:
{context}

Question:
{question}

Answer:"""


def generate_answer(question: str, reranked_chunks: List[Dict[str, Any]]) -> str:
    """
    Build a prompt from the top reranked chunks and call Ollama to generate an answer.

    Falls back to the top chunk's raw text if Ollama is unreachable or the model
    is not available, so the pipeline always returns something useful.

    This is a synchronous function — call it via asyncio.to_thread() from async code.
    """
    if not reranked_chunks:
        return _NOT_FOUND

    top_chunks = reranked_chunks[:OLLAMA_CONTEXT_CHUNKS]
    context = "\n\n---\n\n".join(c["text"] for c in top_chunks)

    prompt = _PROMPT_TEMPLATE.format(
        not_found=_NOT_FOUND,
        context=context,
        question=question,
    )

    logger.debug(
        "ollama_generator: question=%r  model=%s  chunks=%d",
        question, OLLAMA_MODEL, len(top_chunks),
    )

    try:
        with httpx.Client(timeout=float(OLLAMA_TIMEOUT_SEC)) as client:
            resp = client.post(
                f"{OLLAMA_API_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": OLLAMA_TEMPERATURE,
                        "num_predict": OLLAMA_MAX_TOKENS,
                    },
                },
            )

        if resp.status_code == 404:
            logger.warning(
                "Ollama model '%s' not found — run: ollama pull %s  (falling back to top chunk)",
                OLLAMA_MODEL, OLLAMA_MODEL,
            )
            return reranked_chunks[0]["text"]

        resp.raise_for_status()
        answer = resp.json().get("response", "").strip()
        logger.info("ollama_generator: generated %d chars for question=%r", len(answer), question)
        return answer or reranked_chunks[0]["text"]

    except httpx.ConnectError:
        logger.warning(
            "Ollama not running at %s — run: ollama serve  (falling back to top chunk)",
            OLLAMA_API_URL,
        )
        return reranked_chunks[0]["text"]

    except httpx.TimeoutException:
        logger.warning(
            "Ollama timed out after %ds (falling back to top chunk)", OLLAMA_TIMEOUT_SEC,
        )
        return reranked_chunks[0]["text"]

    except Exception as exc:
        logger.error("Ollama generation error: %s  (falling back to top chunk)", exc)
        return reranked_chunks[0]["text"]
