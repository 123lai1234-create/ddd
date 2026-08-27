"""
site_api/llm_stack/providers/minimax_provider.py — MiniMax provider.

Wraps the existing `site_api.minimax_client` chat / streaming helpers
into the unified LLM provider interface so MiniMax can be used as a
drop-in alongside OpenAI, Anthropic and Gemini.
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncGenerator
from typing import Any

from site_api.llm_stack.providers.base import (
    BaseLLMProvider,
    LLMAuthError,
    LLMProviderError,
    LLMTimeoutError,
)
from site_api.llm_stack.types import LLMMessage, LLMResponse, ToolDefinition

logger = logging.getLogger(__name__)


class MiniMaxProvider(BaseLLMProvider):
    """Provider that wraps the existing MiniMax client (MiniMax M2 + others)."""

    name = "minimax"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.api_key = self.api_key or os.getenv("MINIMAX_API_KEY")
        self.api_base = self.api_base or os.getenv("MINIMAX_API_BASE", "https://api.minimaxi.com/v1")
        self.litellm_proxy = os.getenv("LITELLM_PROXY_URL", "")
        self._use_litellm = bool(self.litellm_proxy and self.api_key)
        self._base_url = self.litellm_proxy if self._use_litellm else self.api_base
        self._model_prefix = "minimax/" if self._use_litellm else ""
        # Lazy import — we don't want to require the rest of the codebase
        # to import minimax_client at module-load time.
        from site_api import minimax_client

        self._client = minimax_client

    def _default_model(self) -> str:
        return os.getenv("MINIMAX_DEFAULT_MODEL", "MiniMax-M2")

    def is_configured(self) -> bool:
        return bool(self.api_key) or bool(os.getenv("MINIMAX_API_KEY"))

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _model_name(self, model: str | None) -> str:
        m = model or self.default_model
        return f"{self._model_prefix}{m}" if self._use_litellm else m

    # ── Chat ─────────────────────────────────────────────────────────────────

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
        if not self.is_configured():
            raise LLMAuthError("MINIMAX_API_KEY is not set")

        messages_dicts = [m.to_dict() for m in messages]
        try:
            result = await self._client.chat_completion(
                messages=messages_dicts,
                model=self._model_name(model),
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except self._client.MiniMaxAuthError as e:
            raise LLMAuthError(str(e)) from e
        except self._client.MiniMaxTimeoutError as e:
            raise LLMTimeoutError(str(e)) from e
        except self._client.MiniMaxError as e:
            raise LLMProviderError(str(e)) from e

        choice = (result.get("choices") or [{}])[0]
        msg = choice.get("message", {})
        return LLMResponse(
            content=msg.get("content", "") or "",
            model=result.get("model", self._model_name(model)),
            provider=self.name,
            finish_reason=choice.get("finish_reason"),
            usage=result.get("usage"),
            tool_calls=msg.get("tool_calls"),
            raw=result,
        )

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
        if not self.is_configured():
            raise LLMAuthError("MINIMAX_API_KEY is not set")

        messages_dicts = [m.to_dict() for m in messages]
        try:
            async for chunk in self._client.stream_chat_completion(
                messages=messages_dicts,
                model=self._model_name(model),
                temperature=temperature,
                max_tokens=max_tokens,
            ):
                # Each chunk is a JSON string (an OpenAI-style delta frame).
                try:
                    obj = json.loads(chunk)
                except json.JSONDecodeError:
                    yield chunk
                    continue
                for choice in obj.get("choices", []) or []:
                    delta = choice.get("delta", {}) or {}
                    content = delta.get("content")
                    if content:
                        yield content
        except self._client.MiniMaxAuthError as e:
            raise LLMAuthError(str(e)) from e
        except self._client.MiniMaxError as e:
            raise LLMProviderError(str(e)) from e
