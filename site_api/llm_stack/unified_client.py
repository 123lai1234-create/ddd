"""
site_api/llm_stack/unified_client.py — Top-level facade for the LLM stack.

Use the module-level `llm` singleton for the simplest usage:

    from site_api.llm_stack import llm, chat, stream_chat

    resp = await chat("Summarise protein folding in 3 sentences")
    async for chunk in stream_chat("Translate to Mandarin: ..."):
        print(chunk, end="")

The facade auto-selects the first configured provider (priority order:
minimax → openai → anthropic → gemini). You can force a provider by
passing `provider="..."` or set `LLM_PROVIDER=openai` in the environment.
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncGenerator
from typing import Any

from site_api.llm_stack.providers.factory import (
    get_configured_provider,
    get_provider,
    list_providers,
)
from site_api.llm_stack.types import (
    LLMMessage,
    LLMResponse,
    ToolDefinition,
)

# Re-export so callers can do `from site_api.llm_stack import LLMMessage`.
__all__ = [
    "UnifiedLLMClient",
    "llm",
    "chat",
    "stream_chat",
    "LLMResponse",
    "LLMMessage",
    "list_providers",
]

logger = logging.getLogger(__name__)


# ── Unified client ────────────────────────────────────────────────────────────


class UnifiedLLMClient:
    """Convenience facade that auto-selects the configured provider.

    All methods accept either a list of `LLMMessage` or a plain string
    (which is treated as a single user message). If `provider` is not
    specified, the first configured provider is chosen; otherwise the
    explicit provider is used.
    """

    def __init__(self, default_provider: str | None = None) -> None:
        self.default_provider = default_provider or os.getenv("LLM_PROVIDER")

    def _resolve(self, provider: str | None) -> Any:
        name = provider or self.default_provider
        if name:
            try:
                return get_provider(name)
            except KeyError as e:
                logger.warning("Unknown provider %s, falling back to auto-select", name)
        chosen = get_configured_provider()
        if chosen is None:
            raise RuntimeError(
                "No LLM provider is configured. Set one of "
                "OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY / MINIMAX_API_KEY."
            )
        return chosen

    # ── Loaders ──────────────────────────────────────────────────────────────

    @staticmethod
    def _coerce_messages(messages: str | list[LLMMessage] | list[dict[str, Any]]) -> list[LLMMessage]:
        if isinstance(messages, str):
            return [LLMMessage.user(messages)]
        if not messages:
            return []
        if all(isinstance(m, LLMMessage) for m in messages):
            return list(messages)  # type: ignore[arg-type]
        # Treat as dicts
        out: list[LLMMessage] = []
        for m in messages:  # type: ignore[union-attr]
            out.append(
                LLMMessage(
                    role=m.get("role", "user"),
                    content=m.get("content", ""),
                    name=m.get("name"),
                    tool_call_id=m.get("tool_call_id"),
                    tool_calls=m.get("tool_calls"),
                )
            )
        return out

    # ── Chat ─────────────────────────────────────────────────────────────────

    async def chat(
        self,
        messages: str | list[LLMMessage] | list[dict[str, Any]],
        *,
        provider: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        tools: list[ToolDefinition] | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        prov = self._resolve(provider)
        msgs = self._coerce_messages(messages)
        return await prov.chat(
            messages=msgs,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            **kwargs,
        )

    async def stream_chat(
        self,
        messages: str | list[LLMMessage] | list[dict[str, Any]],
        *,
        provider: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        tools: list[ToolDefinition] | None = None,
        **kwargs: Any,
    ) -> AsyncGenerator[str, None]:
        prov = self._resolve(provider)
        msgs = self._coerce_messages(messages)
        async for chunk in prov.stream_chat(
            messages=msgs,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            **kwargs,
        ):
            yield chunk

    # ── Tool calling helper ──────────────────────────────────────────────────

    async def chat_with_tool_loop(
        self,
        messages: list[LLMMessage],
        *,
        tools: list[ToolDefinition],
        tool_executor: Any,
        provider: str | None = None,
        model: str | None = None,
        max_iters: int = 5,
        temperature: float = 0.0,
    ) -> LLMResponse:
        """Run a tool-calling loop: call LLM, execute any tool_calls, append
        results, repeat until the LLM returns a final assistant message or
        `max_iters` is reached.

        Args:
            messages: The conversation history (mutated in-place).
            tools: Tools the LLM may invoke.
            tool_executor: Async callable `(name, args) -> str` (or sync).
            provider: Optional provider override.
            model: Optional model override.
            max_iters: Maximum loop iterations.
            temperature: Sampling temperature for the LLM.
        """
        prov = self._resolve(provider)
        for _ in range(max_iters):
            resp = await prov.chat(
                messages=messages,
                model=model,
                temperature=temperature,
                tools=tools,
            )
            if not resp.tool_calls:
                return resp
            # Append the assistant message that requested the tool calls.
            messages.append(
                LLMMessage.assistant(
                    content=resp.content or "",
                    tool_calls=resp.tool_calls,
                )
            )
            for tc in resp.tool_calls:
                fn = tc.get("function", {}) or {}
                name = fn.get("name", "")
                args = fn.get("arguments", {}) or {}
                if not isinstance(args, dict):
                    args = {"_raw": args}
                try:
                    if hasattr(tool_executor, "execute"):
                        result = await tool_executor.execute(name, args)
                    else:
                        result = tool_executor(name, args)
                    if hasattr(result, "__await__"):
                        result = await result
                except Exception as e:
                    result = f"Tool {name} failed: {e}"
                messages.append(
                    LLMMessage(
                        role="tool",
                        content=str(result),
                        name=name,
                        tool_call_id=tc.get("id"),
                    )
                )
        # Final call without tools to force a synthesised answer.
        return await prov.chat(messages=messages, model=model, temperature=temperature, tools=None)


# ── Module-level singleton ────────────────────────────────────────────────────

llm = UnifiedLLMClient()


async def chat(
    messages: str | list[LLMMessage] | list[dict[str, Any]],
    *,
    provider: str | None = None,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    **kwargs: Any,
) -> LLMResponse:
    return await llm.chat(
        messages,
        provider=provider,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        **kwargs,
    )


async def stream_chat(
    messages: str | list[LLMMessage] | list[dict[str, Any]],
    *,
    provider: str | None = None,
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    **kwargs: Any,
) -> AsyncGenerator[str, None]:
    async for chunk in llm.stream_chat(
        messages,
        provider=provider,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        **kwargs,
    ):
        yield chunk
