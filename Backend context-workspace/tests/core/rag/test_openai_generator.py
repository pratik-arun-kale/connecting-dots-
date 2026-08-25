"""
tests/core/rag/test_openai_generator.py
──────────────────────────────────────────
Unit tests for OpenAI-backed answer generation. The real openai.OpenAI
client is always mocked — these tests must never make a real network call
or spend real API credits.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    RateLimitError,
)

from app.core.rag import openai_generator
from app.core.settings import settings


def make_chunk(text: str) -> dict:
    return {"text": text, "metadata": {}, "chunk_id": "c1"}


@pytest.fixture(autouse=True)
def _configured_key(monkeypatch):
    """Most tests want a configured key so generate_answer actually attempts
    the API call; tests for the missing-key path override this explicitly."""
    monkeypatch.setattr(settings, "openai_api_key", "sk-test-key")
    yield


def mock_openai_response(text: str, prompt_tokens: int = 10, completion_tokens: int = 5) -> MagicMock:
    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content=text))]
    response.usage = MagicMock(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens)
    return response


class TestGenerateAnswer:
    def test_returns_not_found_immediately_when_no_chunks(self):
        with patch("openai.OpenAI") as mock_client_cls:
            result = openai_generator.generate_answer("question", [])
        assert result == openai_generator._NOT_FOUND
        mock_client_cls.assert_not_called()

    def test_falls_back_to_top_chunk_when_no_api_key_configured(self, monkeypatch):
        monkeypatch.setattr(settings, "openai_api_key", None)
        with patch("openai.OpenAI") as mock_client_cls:
            result = openai_generator.generate_answer("question", [make_chunk("top chunk text")])
        assert result == "top chunk text"
        mock_client_cls.assert_not_called()

    def test_returns_the_generated_answer_on_success(self):
        with patch("openai.OpenAI") as mock_client_cls:
            mock_client = mock_client_cls.return_value
            mock_client.chat.completions.create.return_value = mock_openai_response("The generated answer.")
            result = openai_generator.generate_answer("What is RAG?", [make_chunk("RAG is retrieval-augmented generation.")])
        assert result == "The generated answer."

    def test_passes_configured_model_temperature_and_max_tokens(self, monkeypatch):
        monkeypatch.setattr(settings, "openai_model", "gpt-4o-mini")
        monkeypatch.setattr(settings, "openai_temperature", 0.2)
        monkeypatch.setattr(settings, "openai_max_tokens", 256)
        with patch("openai.OpenAI") as mock_client_cls:
            mock_client = mock_client_cls.return_value
            mock_client.chat.completions.create.return_value = mock_openai_response("answer")
            openai_generator.generate_answer("q", [make_chunk("context")])

        _, kwargs = mock_client.chat.completions.create.call_args
        assert kwargs["model"] == "gpt-4o-mini"
        assert kwargs["temperature"] == 0.2
        assert kwargs["max_tokens"] == 256

    def test_system_and_user_content_are_separated_into_distinct_messages(self):
        with patch("openai.OpenAI") as mock_client_cls:
            mock_client = mock_client_cls.return_value
            mock_client.chat.completions.create.return_value = mock_openai_response("answer")
            openai_generator.generate_answer("my question", [make_chunk("my context")])

        _, kwargs = mock_client.chat.completions.create.call_args
        messages = kwargs["messages"]
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        # The untrusted captured-conversation text must never land in the system message.
        assert "my context" not in messages[0]["content"]
        assert "my context" in messages[1]["content"]
        assert "my question" in messages[1]["content"]

    def test_falls_back_to_top_chunk_when_model_returns_empty_content(self):
        with patch("openai.OpenAI") as mock_client_cls:
            mock_client = mock_client_cls.return_value
            mock_client.chat.completions.create.return_value = mock_openai_response("   ")
            result = openai_generator.generate_answer("q", [make_chunk("fallback text")])
        assert result == "fallback text"

    @staticmethod
    def _dummy_request() -> httpx.Request:
        return httpx.Request("POST", "https://api.openai.com/v1/chat/completions")

    def _dummy_response(self, status_code: int) -> httpx.Response:
        return httpx.Response(status_code, request=self._dummy_request())

    def test_never_raises_on_authentication_error(self):
        with patch("openai.OpenAI") as mock_client_cls:
            mock_client = mock_client_cls.return_value
            mock_client.chat.completions.create.side_effect = AuthenticationError(
                "bad key", response=self._dummy_response(401), body=None,
            )
            result = openai_generator.generate_answer("q", [make_chunk("fallback")])
        assert result == "fallback"

    def test_never_raises_on_rate_limit_error(self):
        with patch("openai.OpenAI") as mock_client_cls:
            mock_client = mock_client_cls.return_value
            mock_client.chat.completions.create.side_effect = RateLimitError(
                "rate limited", response=self._dummy_response(429), body=None,
            )
            result = openai_generator.generate_answer("q", [make_chunk("fallback")])
        assert result == "fallback"

    def test_never_raises_on_timeout(self):
        with patch("openai.OpenAI") as mock_client_cls:
            mock_client = mock_client_cls.return_value
            mock_client.chat.completions.create.side_effect = APITimeoutError(self._dummy_request())
            result = openai_generator.generate_answer("q", [make_chunk("fallback")])
        assert result == "fallback"

    def test_never_raises_on_connection_error(self):
        with patch("openai.OpenAI") as mock_client_cls:
            mock_client = mock_client_cls.return_value
            mock_client.chat.completions.create.side_effect = APIConnectionError(request=self._dummy_request())
            result = openai_generator.generate_answer("q", [make_chunk("fallback")])
        assert result == "fallback"

    def test_never_raises_on_generic_api_status_error(self):
        with patch("openai.OpenAI") as mock_client_cls:
            mock_client = mock_client_cls.return_value
            mock_client.chat.completions.create.side_effect = APIStatusError(
                "server error", response=self._dummy_response(500), body=None,
            )
            result = openai_generator.generate_answer("q", [make_chunk("fallback")])
        assert result == "fallback"

    def test_never_raises_on_unexpected_exception(self):
        with patch("openai.OpenAI") as mock_client_cls:
            mock_client = mock_client_cls.return_value
            mock_client.chat.completions.create.side_effect = ValueError("something weird")
            result = openai_generator.generate_answer("q", [make_chunk("fallback")])
        assert result == "fallback"

    def test_api_key_never_appears_in_a_raised_or_logged_value(self, monkeypatch, caplog):
        monkeypatch.setattr(settings, "openai_api_key", "sk-super-secret-value")
        with patch("openai.OpenAI") as mock_client_cls:
            mock_client_cls.return_value.chat.completions.create.side_effect = ValueError("boom")
            openai_generator.generate_answer("q", [make_chunk("fallback")])
        assert "sk-super-secret-value" not in caplog.text


class TestBuildContext:
    def test_joins_multiple_chunks_with_a_separator(self, monkeypatch):
        monkeypatch.setattr(settings, "openai_context_chunks", 3)
        chunks = [make_chunk("first"), make_chunk("second")]
        context = openai_generator._build_context(chunks)
        assert context == "first\n\n---\n\nsecond"

    def test_respects_openai_context_chunks_limit(self, monkeypatch):
        monkeypatch.setattr(settings, "openai_context_chunks", 1)
        chunks = [make_chunk("first"), make_chunk("second")]
        context = openai_generator._build_context(chunks)
        assert context == "first"

    def test_truncates_an_individual_chunk_to_max_chunk_chars(self, monkeypatch):
        monkeypatch.setattr(openai_generator, "MAX_CHUNK_CHARS", 10)
        chunks = [make_chunk("x" * 100)]
        context = openai_generator._build_context(chunks)
        assert context == "x" * 10

    def test_stops_adding_chunks_once_the_token_budget_is_exhausted(self, monkeypatch):
        monkeypatch.setattr(openai_generator, "MAX_PROMPT_TOKENS", 5)
        # Character-fallback counting (~4 chars/token) — force it so this test
        # doesn't depend on tiktoken's exact tokenization of arbitrary text.
        monkeypatch.setattr(openai_generator, "_get_encoding", lambda: None)
        chunks = [make_chunk("a" * 16), make_chunk("b" * 16)]  # ~4 tokens each under the fallback
        context = openai_generator._build_context(chunks)
        assert "a" * 16 in context
        assert "b" * 16 not in context

    def test_always_includes_at_least_the_top_chunk_even_if_it_exceeds_the_budget(self, monkeypatch):
        monkeypatch.setattr(openai_generator, "MAX_PROMPT_TOKENS", 1)
        monkeypatch.setattr(openai_generator, "_get_encoding", lambda: None)
        chunks = [make_chunk("a" * 200)]
        context = openai_generator._build_context(chunks)
        assert context == "a" * 200


class TestCountTokens:
    def test_uses_character_heuristic_when_tiktoken_encoding_is_unavailable(self, monkeypatch):
        monkeypatch.setattr(openai_generator, "_get_encoding", lambda: None)
        assert openai_generator._count_tokens("12345678") == 2  # 8 chars // 4

    def test_uses_tiktoken_when_available(self, monkeypatch):
        fake_encoding = MagicMock()
        fake_encoding.encode.return_value = [1, 2, 3]
        monkeypatch.setattr(openai_generator, "_get_encoding", lambda: fake_encoding)
        assert openai_generator._count_tokens("anything") == 3
