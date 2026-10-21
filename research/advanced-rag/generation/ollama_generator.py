"""
generation/ollama_generator.py

Generative answer module using a local Ollama LLM.

Replaces the extractive deepset/roberta-base-squad2 QA model.
Same public interface as ExtractiveQA so streamlit_app.py only
needs a one-line import swap.

Adding a new LLM backend (OpenAI, Gemini, etc.) requires only a
new subclass of BaseGenerator that implements generate().
"""

import logging
from abc import ABC, abstractmethod
from typing import Dict, List

import requests

logger = logging.getLogger(__name__)

_NOT_FOUND_PHRASE = "I couldn't find that information in the provided documents."

_PROMPT_TEMPLATE = """\
You are a helpful assistant.

Answer the user's question using ONLY the provided context.
If the answer is not present in the context, say exactly:
"{not_found}"

Context:
{context}

Question:
{question}

Answer:"""


# ── Abstract base — subclass to add OpenAI, Gemini, etc. ─────────────────────

class BaseGenerator(ABC):
    """Abstract base for answer generation backends."""

    @abstractmethod
    def generate(self, prompt: str) -> str:
        """Send a prompt and return the generated text."""
        ...

    def answer_question(
        self,
        question: str,
        candidates: List[Dict],
        fallback_to_context: bool = False,
        max_context_chunks: int = 5,
    ) -> Dict:
        """
        Drop-in replacement for ExtractiveQA.answer_question().

        Assembles context from the top reranked candidates, builds
        a prompt, calls the LLM, and returns the same dict schema:
          {"answer", "score", "source_doc", "chunk_id", "context"}

        fallback_to_context is accepted for interface compatibility
        but unused — generative models always synthesize from context.
        """
        if not candidates:
            return self._empty_response()

        top = candidates[0]
        context_chunks = candidates[:max_context_chunks]
        assembled_context = "\n\n---\n\n".join(c["text"] for c in context_chunks)

        prompt = _PROMPT_TEMPLATE.format(
            not_found=_NOT_FOUND_PHRASE,
            context=assembled_context,
            question=question,
        )

        logger.info(
            "OllamaGenerator: question=%r using %d/%d chunks",
            question, len(context_chunks), len(candidates),
        )

        try:
            answer_text = self.generate(prompt)
        except Exception as exc:
            logger.error("Generation failed: %s", exc)
            answer_text = f"Generation error: {exc}"

        not_found = _NOT_FOUND_PHRASE.lower() in answer_text.lower()
        score = 0.0 if not_found else 1.0

        return {
            "answer": answer_text.strip(),
            "score": score,
            "source_doc": top["metadata"].get("doc_id"),
            "chunk_id": top["chunk_id"],
            "context": assembled_context,
        }

    @staticmethod
    def _empty_response() -> Dict:
        return {
            "answer": "Insufficient evidence found in retrieved documents.",
            "score": 0.0,
            "source_doc": None,
            "chunk_id": None,
            "context": None,
        }


# ── Ollama backend ────────────────────────────────────────────────────────────

class OllamaGenerator(BaseGenerator):
    """
    Generative QA using a locally-running Ollama model.

    Calls the /api/generate endpoint (stream=False).
    Change OLLAMA_MODEL in config.py to swap models without code changes.
    """

    def __init__(
        self,
        model: str,
        api_url: str = "http://localhost:11434",
        temperature: float = 0.1,
        max_tokens: int = 512,
        timeout_sec: int = 60,
        max_context_chunks: int = 5,
    ) -> None:
        self.model = model
        self.api_url = api_url.rstrip("/")
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout_sec = timeout_sec
        self.max_context_chunks = max_context_chunks

        logger.info(
            "OllamaGenerator: model=%s  url=%s  temp=%.2f  max_tokens=%d",
            model, api_url, temperature, max_tokens,
        )
        self._check_availability()

    # Override so callers don't need to pass max_context_chunks every time.
    def answer_question(
        self,
        question: str,
        candidates: List[Dict],
        fallback_to_context: bool = False,
    ) -> Dict:
        return super().answer_question(
            question, candidates, fallback_to_context,
            max_context_chunks=self.max_context_chunks,
        )

    def _check_availability(self) -> None:
        """Warn at init time if Ollama is unreachable or the model is missing."""
        try:
            resp = requests.get(f"{self.api_url}/api/tags", timeout=5)
            resp.raise_for_status()
            available = [m["name"] for m in resp.json().get("models", [])]
            if not any(self.model in m for m in available):
                logger.warning(
                    "Ollama model '%s' not downloaded. Run: ollama pull %s",
                    self.model, self.model,
                )
            else:
                logger.info("Ollama model '%s' is available.", self.model)
        except requests.exceptions.ConnectionError:
            logger.warning(
                "Ollama not running at %s. Start it with: ollama serve", self.api_url,
            )
        except Exception as exc:
            logger.warning("Could not verify Ollama availability: %s", exc)

    def generate(self, prompt: str) -> str:
        """POST to /api/generate with stream=False and return the response text."""
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": self.temperature,
                "num_predict": self.max_tokens,
            },
        }

        try:
            resp = requests.post(
                f"{self.api_url}/api/generate",
                json=payload,
                timeout=self.timeout_sec,
            )
        except requests.exceptions.ConnectionError as exc:
            raise RuntimeError(
                f"Cannot connect to Ollama at {self.api_url}. "
                "Start the server with: ollama serve"
            ) from exc
        except requests.exceptions.Timeout as exc:
            raise RuntimeError(
                f"Ollama request timed out after {self.timeout_sec}s. "
                "The model may need more resources."
            ) from exc

        if resp.status_code == 404:
            raise RuntimeError(
                f"Model '{self.model}' not found in Ollama. "
                f"Run: ollama pull {self.model}"
            )
        if not resp.ok:
            raise RuntimeError(
                f"Ollama returned HTTP {resp.status_code}: {resp.text[:200]}"
            )

        return resp.json().get("response", "").strip()
