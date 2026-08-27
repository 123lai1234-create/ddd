"""
site_api/llm_stack/providers/anthropic_provider.py — Anthropic Claude provider.

Supports:
- Claude 3 family (Opus, Sonnet, Haiku) and Claude 3.5 Sonnet
- Streaming
- Tool use (Anthropic's "tool use" API)
- Vision (image input)

The Anthropic API differs from OpenAI:
- System messages live in a top-level `system` field, not in `messages`.
- Assistant tool calls and tool results are in `messages` with `content` arrays.
- Tools are declared as `{"name", "description", "input_schema"}`.
- The API endpoint is `/v1/messages`.

If the `anthropic` SDK is installed we use it, otherwise we fall back to
direct httpx calls.
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


class AnthropicProvider(BaseLLMProvider):
    """Anthropic Claude Messages-API provider."""

    name = "anthropic"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.api_base = self.api_base or os.getenv("ANTHROPIC_API_BASE", "https://api.anthropic.com/v1")
        self.api_version = os.getenv("ANTHROPIC_API_VERSION", "2023-06-01")
        try:
            from anthropic import AsyncAnthropic  # type: ignore

            self._client = AsyncAnthropic(api_key=self.api_key) if self.api_key else None
            self._has_sdk = True
        except ImportError:
            self._client = None
            self._has_sdk = False
            logger.info("anthropic SDK not installed — using httpx fallback")

    def _default_model(self) -> str:
        return os.getenv("ANTHROPIC_DEFAULT_MODEL", "claude-3-5-sonnet-20241022")

    def is_configured(self) -> bool:
        return bool(self.api_key) or bool(os.getenv("ANTHROPIC_API_KEY"))

    # ── Message conversion ───────────────────────────────────────────────────

    def _convert_messages(self, messages: list[LLMMessage]) -> tuple[str | None, list[dict[str, Any]]]:
        """Split out system messages and translate the rest to Anthropic format."""
        system_parts: list[str] = []
        converted: list[dict[str, Any]] = []
        for m in messages:
            if m.role == "system":
                system_parts.append(m.content)
                continue
            if m.role == "tool":
                converted.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": m.tool_call_id or "",
                                "content": m.content,
                            }
                        ],
                    }
                )
                continue
            if m.role == "assistant" and m.tool_calls:
                # assistant with tool_use
                content_blocks: list[dict[str, Any]] = []
                if m.content:
                    content_blocks.append({"type": "text", "text": m.content})
                for tc in m.tool_calls:
                    fn = tc.get("function", {})
                    args = fn.get("arguments", {})
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except json.JSONDecodeError:
                            args = {"_raw": args}
                    content_blocks.append(
                        {
                            "type": "tool_use",
                            "id": tc.get("id", ""),
                            "name": fn.get("name", ""),
                            "input": args,
                        }
                    )
                converted.append({"role": "assistant", "content": content_blocks})
                continue
            converted.append({"role": m.role, "content": m.content})
        system = "\n\n".join(system_parts) if system_parts else None
        return system, converted

    def _convert_tools(self, tools: list[ToolDefinition]) -> list[dict[str, Any]]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": t.parameters,
            }
            for t in tools
        ]

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
            raise LLMAuthError("ANTHROPIC_API_KEY is not set")

        model_name = model or self.default_model
        system, msgs = self._convert_messages(messages)
        payload: dict[str, Any] = {
            "model": model_name,
            "messages": msgs,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system:
            payload["system"] = system
        if tools:
            payload["tools"] = self._convert_tools(tools)
            if tool_choice is not None:
                payload["tool_choice"] = tool_choice

        if self._client is not None:
            try:
                resp = await self._client.messages.create(**payload)
            except Exception as e:
                raise self._wrap_sdk_error(e) from e
            return self._parse_response(resp, model_name)

        return await self._http_chat(payload, model_name)

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
            raise LLMAuthError("ANTHROPIC_API_KEY is not set")

        model_name = model or self.default_model
        system, msgs = self._convert_messages(messages)
        payload: dict[str, Any] = {
            "model": model_name,
            "messages": msgs,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
        }
        if system:
            payload["system"] = system
        if tools:
            payload["tools"] = self._convert_tools(tools)

        if self._client is not None:
            try:
                async with self._client.messages.stream(**payload) as stream:
                    async for text in stream.text_stream:
                        yield text
            except Exception as e:
                raise self._wrap_sdk_error(e) from e
            return

        async for delta in self._http_stream(payload):
            yield delta

    # ── Response parsing ─────────────────────────────────────────────────────

    def _parse_response(self, resp: Any, model_name: str) -> LLMResponse:
        content_text = ""
        tool_calls: list[dict[str, Any]] | None = None
        for block in getattr(resp, "content", []) or []:
            btype = getattr(block, "type", None)
            if btype == "text":
                content_text += getattr(block, "text", "")
            elif btype == "tool_use":
                if tool_calls is None:
                    tool_calls = []
                tool_calls.append(
                    {
                        "id": getattr(block, "id", ""),
                        "type": "function",
                        "function": {
                            "name": getattr(block, "name", ""),
                            "arguments": getattr(block, "input", {}),
                        },
                    }
                )

        usage = None
        if getattr(resp, "usage", None):
            usage = {
                "input_tokens": getattr(resp.usage, "input_tokens", 0),
                "output_tokens": getattr(resp.usage, "output_tokens", 0),
            }

        return LLMResponse(
            content=content_text,
            model=getattr(resp, "model", model_name),
            provider=self.name,
            finish_reason=getattr(resp, "stop_reason", None),
            usage=usage,
            tool_calls=tool_calls,
        )

    async def _http_chat(self, payload: dict[str, Any], model_name: str) -> LLMResponse:
        import httpx

        headers = {
            "x-api-key": self.api_key or "",
            "anthropic-version": self.api_version,
            "content-type": "application/json",
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{self.api_base}/messages", json=payload, headers=headers)
        if resp.status_code == 401:
            raise LLMAuthError("Anthropic auth failed", status_code=401, response_body=resp.text)
        if resp.status_code >= 400:
            raise LLMProviderError(
                f"Anthropic error {resp.status_code}", status_code=resp.status_code, response_body=resp.text
            )
        data = resp.json()
        content_text = ""
        tool_calls: list[dict[str, Any]] | None = None
        for block in data.get("content", []):
            if block.get("type") == "text":
                content_text += block.get("text", "")
            elif block.get("type") == "tool_use":
                if tool_calls is None:
                    tool_calls = []
                tool_calls.append(
                    {
                        "id": block.get("id", ""),
                        "type": "function",
                        "function": {"name": block.get("name", ""), "arguments": block.get("input", {})},
                    }
                )
        return LLMResponse(
            content=content_text,
            model=data.get("model", model_name),
            provider=self.name,
            finish_reason=data.get("stop_reason"),
            usage=data.get("usage"),
            tool_calls=tool_calls,
            raw=data,
        )

    async def _http_stream(self, payload: dict[str, Any]) -> AsyncGenerator[str, None]:
        import httpx

        headers = {
            "x-api-key": self.api_key or "",
            "anthropic-version": self.api_version,
            "content-type": "application/json",
        }
        async with httpx.AsyncClient(timeout=120.0) as client, client.stream(
            "POST", f"{self.api_base}/messages", json=payload, headers=headers
        ) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise LLMProviderError(
                    f"Anthropic stream error {resp.status_code}",
                    status_code=resp.status_code,
                    response_body=body.decode(),
                )
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if obj.get("type") == "content_block_delta":
                    delta = obj.get("delta", {})
                    if delta.get("type") == "text_delta":
                        yield delta.get("text", "")

    def _wrap_sdk_error(self, e: Exception) -> LLMProviderError:
        msg = str(e)
        if "401" in msg or "auth" in msg.lower():
            return LLMAuthError(f"Anthropic auth failed: {msg}")
        if "timeout" in msg.lower():
            return LLMTimeoutError(f"Anthropic timeout: {msg}")
        return LLMProviderError(f"Anthropic error: {msg}")
