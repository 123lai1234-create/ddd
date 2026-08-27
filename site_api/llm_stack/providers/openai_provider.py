"""
site_api/llm_stack/providers/openai_provider.py — OpenAI Chat Completions provider.

Supports:
- Standard chat completion (gpt-4o, gpt-4-turbo, gpt-3.5-turbo, ...)
- Streaming
- Tool / function calling
- Vision (gpt-4o, gpt-4-turbo)

This provider uses the OpenAI SDK when available, but falls back to a
plain HTTP client when the SDK is not installed (the rest of the stack
should still import).
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


class OpenAIProvider(BaseLLMProvider):
    """OpenAI Chat Completions provider."""

    name = "openai"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.api_base = self.api_base or os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
        # Lazy import so the rest of the platform works even without openai SDK.
        try:
            from openai import AsyncOpenAI  # type: ignore

            self._client = AsyncOpenAI(api_key=self.api_key, base_url=self.api_base) if self.api_key else None
            self._has_sdk = True
        except ImportError:
            self._client = None
            self._has_sdk = False
            logger.info("openai SDK not installed — using httpx fallback")

    def _default_model(self) -> str:
        return os.getenv("OPENAI_DEFAULT_MODEL", "gpt-4o-mini")

    def is_configured(self) -> bool:
        return bool(self.api_key) or bool(os.getenv("OPENAI_API_KEY"))

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
            raise LLMAuthError("OPENAI_API_KEY is not set")

        model_name = model or self.default_model
        kwargs_payload: dict[str, Any] = {
            "model": model_name,
            "messages": self.build_messages(messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs_payload["tools"] = [t.to_openai() for t in tools]
            if tool_choice is not None:
                kwargs_payload["tool_choice"] = tool_choice

        if self._client is not None:
            try:
                resp = await self._client.chat.completions.create(**kwargs_payload)
            except Exception as e:  # pragma: no cover — SDK errors are opaque
                raise self._wrap_sdk_error(e) from e
            return self._parse_response(resp)

        # Fallback: plain HTTP via httpx
        return await self._http_chat(kwargs_payload)

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
            raise LLMAuthError("OPENAI_API_KEY is not set")

        model_name = model or self.default_model
        payload: dict[str, Any] = {
            "model": model_name,
            "messages": self.build_messages(messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if tools:
            payload["tools"] = [t.to_openai() for t in tools]

        if self._client is not None:
            try:
                stream = await self._client.chat.completions.create(**payload)
            except Exception as e:
                raise self._wrap_sdk_error(e) from e
            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and getattr(delta, "content", None):
                    yield delta.content
            return

        async for delta in self._http_stream(payload):
            yield delta

    # ── Internals ────────────────────────────────────────────────────────────

    def _parse_response(self, resp: Any) -> LLMResponse:
        choice = resp.choices[0] if resp.choices else None
        content = ""
        tool_calls: list[dict[str, Any]] | None = None
        finish_reason = None
        if choice is not None:
            msg = choice.message
            content = msg.content or ""
            finish_reason = choice.finish_reason
            if getattr(msg, "tool_calls", None):
                tool_calls = []
                for tc in msg.tool_calls:
                    args = tc.function.arguments or ""
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except json.JSONDecodeError:
                            args = {"_raw": args}
                    tool_calls.append(
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": tc.function.name, "arguments": args},
                        }
                    )

        usage = None
        if getattr(resp, "usage", None):
            usage = {
                "prompt_tokens": getattr(resp.usage, "prompt_tokens", 0),
                "completion_tokens": getattr(resp.usage, "completion_tokens", 0),
                "total_tokens": getattr(resp.usage, "total_tokens", 0),
            }

        return LLMResponse(
            content=content,
            model=resp.model,
            provider=self.name,
            finish_reason=finish_reason,
            usage=usage,
            tool_calls=tool_calls,
        )

    async def _http_chat(self, payload: dict[str, Any]) -> LLMResponse:
        import httpx

        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{self.api_base}/chat/completions", json=payload, headers=headers)
        if resp.status_code == 401:
            raise LLMAuthError("OpenAI authentication failed", status_code=401, response_body=resp.text)
        if resp.status_code >= 400:
            raise LLMProviderError(
                f"OpenAI error {resp.status_code}", status_code=resp.status_code, response_body=resp.text
            )
        data = resp.json()

        choice = data["choices"][0] if data.get("choices") else {}
        msg = choice.get("message", {})
        return LLMResponse(
            content=msg.get("content", ""),
            model=data.get("model", payload["model"]),
            provider=self.name,
            finish_reason=choice.get("finish_reason"),
            usage=data.get("usage"),
            tool_calls=msg.get("tool_calls"),
            raw=data,
        )

    async def _http_stream(self, payload: dict[str, Any]) -> AsyncGenerator[str, None]:
        import httpx

        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=120.0) as client, client.stream(
            "POST", f"{self.api_base}/chat/completions", json=payload, headers=headers
        ) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise LLMProviderError(
                    f"OpenAI stream error {resp.status_code}", status_code=resp.status_code, response_body=body.decode()
                )
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                chunk = line[5:].strip()
                if chunk == "[DONE]":
                    break
                try:
                    obj = json.loads(chunk)
                except json.JSONDecodeError:
                    continue
                choices = obj.get("choices", [])
                if choices:
                    delta = choices[0].get("delta", {})
                    content = delta.get("content")
                    if content:
                        yield content

    def _wrap_sdk_error(self, e: Exception) -> LLMProviderError:
        msg = str(e)
        if "401" in msg or "auth" in msg.lower():
            return LLMAuthError(f"OpenAI auth failed: {msg}")
        if "timeout" in msg.lower():
            return LLMTimeoutError(f"OpenAI timeout: {msg}")
        return LLMProviderError(f"OpenAI error: {msg}")
