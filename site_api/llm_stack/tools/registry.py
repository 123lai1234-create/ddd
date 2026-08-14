"""
site_api/llm_stack/tools/registry.py — Tool registry and executor.

The registry stores tools by name, exposes them as `ToolDefinition`s for
the LLM, and provides an async executor that runs a tool call and
returns the result as a string.
"""

from __future__ import annotations

import logging
from typing import Any

from site_api.llm_stack.tools.base import Tool, ToolResult, parse_tool_arguments
from site_api.llm_stack.types import ToolDefinition

logger = logging.getLogger(__name__)


class ToolRegistry:
    """A registry of tools that can be invoked by an LLM."""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    # ── Registration ────────────────────────────────────────────────────────

    def register(self, tool: Tool) -> Tool:
        if tool.name in self._tools:
            logger.warning("Tool %s already registered — overwriting", tool.name)
        self._tools[tool.name] = tool
        return tool

    def unregister(self, name: str) -> None:
        self._tools.pop(name, None)

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return sorted(self._tools.keys())

    def __len__(self) -> int:
        return len(self._tools)

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    # ── Conversion to LLM definitions ───────────────────────────────────────

    def definitions(self) -> list[ToolDefinition]:
        return [t.to_definition() for t in self._tools.values()]

    # ── Execution ───────────────────────────────────────────────────────────

    async def execute(self, name: str, arguments: dict[str, Any] | str) -> str:
        """Execute a tool and return its result as a string."""
        tool = self._tools.get(name)
        if tool is None:
            return f"[ERROR] Tool '{name}' not found. Available tools: {self.names()}"
        args = parse_tool_arguments(arguments) if isinstance(arguments, str) else arguments
        try:
            result = await tool.run(**args)
        except Exception as e:
            logger.exception("Tool %s crashed", name)
            return f"[ERROR] Tool '{name}' crashed: {e}"
        return result.to_message()

    async def execute_tool_call(self, tool_call: dict[str, Any]) -> str:
        """Execute a single OpenAI-style `tool_call` dict."""
        fn = tool_call.get("function", {}) or {}
        name = fn.get("name", "")
        args = fn.get("arguments", {})
        return await self.execute(name, args)


# ── Module-level singleton ────────────────────────────────────────────────────

registry = ToolRegistry()


def tool(*, name: str | None = None, description: str | None = None):
    """Decorator that wraps a function as a Tool and registers it.

    Example:
        @tool(name="fetch_weather", description="Get current weather")
        async def fetch_weather(city: str) -> str:
            ...
    """

    def decorator(fn):
        from site_api.llm_stack.tools.base import FunctionTool

        tool_name = name or fn.__name__
        tool_desc = description or (fn.__doc__ or "").strip().splitlines()[0] if fn.__doc__ else ""
        registry.register(FunctionTool(name=tool_name, description=tool_desc, fn=fn))
        return fn

    return decorator
