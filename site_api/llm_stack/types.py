"""
site_api/llm_stack/types.py — Shared LLM message and response types.

These are intentionally simple pydantic-style dataclasses that mirror the
OpenAI Chat Completions API shape, so they can be translated to/from
Anthropic Claude, Google Gemini, and MiniMax formats by the providers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


# ── Roles ─────────────────────────────────────────────────────────────────────

Role = Literal["system", "user", "assistant", "tool", "function"]


@dataclass
class LLMMessage:
    """A single chat message in a conversation.

    Attributes:
        role: One of 'system', 'user', 'assistant', 'tool', 'function'.
        content: The message text. May be empty for tool calls.
        name: Optional name of the author (for 'tool' / 'function' roles).
        tool_call_id: For 'tool' role messages, the originating call ID.
        tool_calls: For 'assistant' messages, list of tool call requests.
    """

    role: Role
    content: str
    name: str | None = None
    tool_call_id: str | None = None
    tool_calls: list[dict[str, Any]] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serialisable dict (filters out None values)."""
        out: dict[str, Any] = {"role": self.role, "content": self.content}
        if self.name:
            out["name"] = self.name
        if self.tool_call_id:
            out["tool_call_id"] = self.tool_call_id
        if self.tool_calls:
            out["tool_calls"] = self.tool_calls
        return out

    @classmethod
    def system(cls, content: str) -> "LLMMessage":
        return cls(role="system", content=content)

    @classmethod
    def user(cls, content: str) -> "LLMMessage":
        return cls(role="user", content=content)

    @classmethod
    def assistant(cls, content: str, tool_calls: list[dict[str, Any]] | None = None) -> "LLMMessage":
        return cls(role="assistant", content=content, tool_calls=tool_calls)


# ── Tool definition ───────────────────────────────────────────────────────────


@dataclass
class ToolDefinition:
    """JSON-Schema-style tool descriptor passed to LLMs that support tool calling.

    The shape mirrors OpenAI's `tools[].function` so it can be translated to
    Anthropic's `tools[].input_schema` and Gemini's `tools[].functionDeclarations`.
    """

    name: str
    description: str
    parameters: dict[str, Any] = field(default_factory=lambda: {
        "type": "object",
        "properties": {},
        "required": [],
    })

    def to_openai(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


# ── Response ──────────────────────────────────────────────────────────────────


@dataclass
class LLMResponse:
    """A unified LLM response, normalised across providers."""

    content: str
    model: str
    provider: str
    finish_reason: str | None = None
    usage: dict[str, Any] | None = None
    tool_calls: list[dict[str, Any]] | None = None
    raw: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "content": self.content,
            "model": self.model,
            "provider": self.provider,
            "finish_reason": self.finish_reason,
            "usage": self.usage,
            "tool_calls": self.tool_calls,
        }


# ── Streaming chunk ───────────────────────────────────────────────────────────


@dataclass
class LLMChunk:
    """A streaming chunk emitted by `stream_chat`."""

    content: str
    delta: str
    finish_reason: str | None = None
    tool_calls: list[dict[str, Any]] | None = None
