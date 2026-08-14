"""
site_api/llm_stack/providers/gemini_provider.py — Google Gemini provider.

Supports:
- Gemini 1.5 Pro / Flash
- Streaming (server-sent events)
- Function calling (translated to OpenAI-style tool_calls)
- Vision (image input)

The Gemini API differs from OpenAI:
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- Auth: `?key=API_KEY` query param or `x-goog-api-key` header
- Messages are `contents` with `parts` instead of `messages` with `role`/`content`.
- Tools are declared as `functionDeclarations`.

If the `google-generativeai` SDK is installed, we use it; otherwise we fall
back to direct httpx calls.
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


class GeminiProvider(BaseLLMProvider):
    """Google Gemini (Generative AI) provider."""

    name = "gemini"

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.api_base = self.api_base or os.getenv("GEMINI_API_BASE", "https://generativelanguage.googleapis.com/v1beta")
        self.api_key = self.api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        try:
            import google.generativeai as genai  # type: ignore

            if self.api_key:
                genai.configure(api_key=self.api_key)
            self._genai = genai
            self._has_sdk = True
        except ImportError:
            self._genai = None
            self._has_sdk = False
            logger.info("google-generativeai SDK not installed — using httpx fallback")

    def _default_model(self) -> str:
        return os.getenv("GEMINI_DEFAULT_MODEL", "gemini-1.5-flash")

    def is_configured(self) -> bool:
        return bool(self.api_key) or bool(os.getenv("GEMINI_API_KEY")) or bool(os.getenv("GOOGLE_API_KEY"))

    # ── Message conversion ───────────────────────────────────────────────────

    def _convert_messages(self, messages: list[LLMMessage]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Convert unified messages to Gemini's `contents` + `systemInstruction`.

        Gemini uses "user" and "model" roles (not "assistant"). We drop
        empty/duplicate consecutive roles.
        """
        system_parts: list[dict[str, Any]] = []
        contents: list[dict[str, Any]] = []
        for m in messages:
            if m.role == "system":
                system_parts.append({"text": m.content})
                continue
            role = "model" if m.role == "assistant" else "user"
            if m.role == "tool":
                # Gemini expects tool results as a `functionResponse` part.
                contents.append(
                    {
                        "role": "user",
                        "parts": [
                            {
                                "functionResponse": {
                                    "name": m.name or "",
                                    "response": {"result": m.content},
                                }
                            }
                        ],
                    }
                )
                continue
            contents.append({"role": role, "parts": [{"text": m.content or ""}]})
        system_instruction = {"parts": system_parts} if system_parts else None
        return contents, system_instruction or []

    def _convert_tools(self, tools: list[ToolDefinition]) -> list[dict[str, Any]] | None:
        if not tools:
            return None
        return [
            {
                "functionDeclarations": [
                    {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    }
                    for t in tools
                ]
            }
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
            raise LLMAuthError("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set")

        model_name = model or self.default_model
        contents, system_instruction = self._convert_messages(messages)
        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_instruction:
            payload["systemInstruction"] = system_instruction
        tool_payload = self._convert_tools(tools or [])
        if tool_payload:
            payload["tools"] = tool_payload

        if self._genai is not None:
            try:
                client = self._genai.GenerativeModel(model_name=model_name)
                resp = await _call_in_executor(
                    client.generate_content,
                    contents=contents,
                    generation_config=payload["generationConfig"],
                    tools=tools,
                )
            except Exception as e:
                raise self._wrap_sdk_error(e) from e
            return self._parse_sdk_response(resp, model_name)

        return await self._http_chat(model_name, payload)

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
            raise LLMAuthError("GEMINI_API_KEY is not set")

        model_name = model or self.default_model
        contents, system_instruction = self._convert_messages(messages)
        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
        }
        if system_instruction:
            payload["systemInstruction"] = system_instruction
        if tools:
            payload["tools"] = self._convert_tools(tools)

        async for delta in self._http_stream(model_name, payload):
            yield delta

    # ── Response parsing ─────────────────────────────────────────────────────

    def _parse_sdk_response(self, resp: Any, model_name: str) -> LLMResponse:
        content_text = ""
        tool_calls: list[dict[str, Any]] | None = None
        for cand in getattr(resp, "candidates", []) or []:
            for part in getattr(cand, "content", {}).parts or []:
                if getattr(part, "text", None):
                    content_text += part.text
                elif getattr(part, "function_call", None):
                    if tool_calls is None:
                        tool_calls = []
                    fc = part.function_call
                    args = dict(fc.args) if getattr(fc, "args", None) else {}
                    tool_calls.append(
                        {
                            "id": getattr(fc, "id", "") or f"{fc.name}-{len(tool_calls)}",
                            "type": "function",
                            "function": {"name": fc.name, "arguments": args},
                        }
                    )

        usage = None
        um = getattr(resp, "usage_metadata", None)
        if um:
            usage = {
                "prompt_tokens": getattr(um, "prompt_token_count", 0),
                "completion_tokens": getattr(um, "candidates_token_count", 0),
                "total_tokens": getattr(um, "total_token_count", 0),
            }

        return LLMResponse(
            content=content_text,
            model=model_name,
            provider=self.name,
            finish_reason=(getattr(resp, "candidates", [None])[0].finish_reason if getattr(resp, "candidates", None) else None),
            usage=usage,
            tool_calls=tool_calls,
        )

    async def _http_chat(self, model_name: str, payload: dict[str, Any]) -> LLMResponse:
        import httpx

        url = f"{self.api_base}/models/{model_name}:generateContent"
        params = {"key": self.api_key} if self.api_key else None
        headers = {"Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, params=params, json=payload, headers=headers)
        if resp.status_code in (401, 403):
            raise LLMAuthError("Gemini auth failed", status_code=resp.status_code, response_body=resp.text)
        if resp.status_code >= 400:
            raise LLMProviderError(
                f"Gemini error {resp.status_code}", status_code=resp.status_code, response_body=resp.text
            )
        data = resp.json()
        content_text = ""
        tool_calls: list[dict[str, Any]] | None = None
        for cand in data.get("candidates", []) or []:
            for part in cand.get("content", {}).get("parts", []) or []:
                if "text" in part:
                    content_text += part.get("text", "")
                elif "functionCall" in part:
                    if tool_calls is None:
                        tool_calls = []
                    fc = part["functionCall"]
                    tool_calls.append(
                        {
                            "id": fc.get("id", "") or f"{fc.get('name', 'tool')}-{len(tool_calls)}",
                            "type": "function",
                            "function": {"name": fc.get("name", ""), "arguments": fc.get("args", {})},
                        }
                    )

        usage = data.get("usageMetadata")
        return LLMResponse(
            content=content_text,
            model=model_name,
            provider=self.name,
            finish_reason=(data.get("candidates", [{}])[0].get("finishReason")),
            usage=usage,
            tool_calls=tool_calls,
            raw=data,
        )

    async def _http_stream(self, model_name: str, payload: dict[str, Any]) -> AsyncGenerator[str, None]:
        import httpx

        url = f"{self.api_base}/models/{model_name}:streamGenerateContent"
        params = {"key": self.api_key, "alt": "sse"} if self.api_key else {"alt": "sse"}
        headers = {"Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=120.0) as client, client.stream(
            "POST", url, params=params, json=payload, headers=headers
        ) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise LLMProviderError(
                    f"Gemini stream error {resp.status_code}",
                    status_code=resp.status_code,
                    response_body=body.decode(),
                )
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data:
                    continue
                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue
                for cand in obj.get("candidates", []) or []:
                    for part in cand.get("content", {}).get("parts", []) or []:
                        if "text" in part:
                            yield part.get("text", "")

    def _wrap_sdk_error(self, e: Exception) -> LLMProviderError:
        msg = str(e)
        if "API_KEY" in msg or "401" in msg or "403" in msg:
            return LLMAuthError(f"Gemini auth failed: {msg}")
        if "timeout" in msg.lower():
            return LLMTimeoutError(f"Gemini timeout: {msg}")
        return LLMProviderError(f"Gemini error: {msg}")


def _call_in_executor(func: Any, **kwargs: Any) -> Any:
    """Run a synchronous google-generativeai call in a thread executor."""
    import asyncio

    return asyncio.get_event_loop().run_in_executor(None, lambda: func(**kwargs))
