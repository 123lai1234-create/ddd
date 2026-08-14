"""
site_api/llm_stack/providers/base.py — Abstract LLM provider interface.

Every provider (OpenAI, Anthropic Claude, Google Gemini, MiniMax) implements
this interface so the rest of the codebase can talk to LLMs uniformly.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from typing import Any

from site_api.llm_stack.types import (
    LLMMessage,
    LLMResponse,
    ToolDefinition,
)

logger = logging.getLogger(__name__)


class LLMProviderError(Exception):
    """Base exception for provider errors."""

    def __init__(self, message: str, *, status_code: int | None = None, response_body: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class LLMAuthError(LLMProviderError):
    """Authentication failed (invalid API key, wrong project, etc.)."""


class LLMRateLimitError(LLMProviderError):
    """Rate-limited by the upstream provider."""


class LLMTimeoutError(LLMProviderError):
    """Request timed out."""


class BaseLLMProvider(ABC):
    """Abstract base class for all LLM providers."""

    #: Canonical provider name (e.g. "openai", "anthropic", "gemini", "minimax").
    name: str = "base"

    def __init__(self, **kwargs: Any) -> None:
        self.config = kwargs
        self.api_key: str | None = kwargs.get("api_key")
        self.api_base: str | None = kwargs.get("api_base")
        self.default_model: str = kwargs.get("default_model", self._default_model())

    @abstractmethod
    def _default_model(self) -> str:
        """Return the provider's default model identifier."""

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if the provider has an API key / credentials set."""

    @abstractmethod
    async def chat(
        self,
        messages: list[LLMMessage],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        tools: list[ToolDefinition] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        """Send a chat completion request and return a unified response."""

    @abstractmethod
    async def stream_chat(
        self,
        messages: list[LLMMessage],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        tools: list[ToolDefinition] | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion; yields text chunks."""

    def build_messages(self, messages: list[LLMMessage]) -> list[dict[str, Any]]:
        """Default conversion: just call to_dict() on each message."""
        return [m.to_dict() for m in messages]

    def __repr__(self) -> str:  # pragma: no cover
        return f"<{self.__class__.__name__} name={self.name} configured={self.is_configured()}>"
