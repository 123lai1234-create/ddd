"""
site_api/llm_stack/mcp/tools.py — Tool wrappers for the MCP server.

MCP tools are described by a `name`, `description`, and an `inputSchema`
(JSON Schema object). This module wraps existing `Tool` instances (and
plain async functions) into MCP-compatible descriptors.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any, Callable

from site_api.llm_stack.tools.base import Tool
from site_api.llm_stack.tools.registry import ToolRegistry


# ── MCP tool descriptor ──────────────────────────────────────────────────────


@dataclass
class MCPTool:
    """A tool exposed via MCP.

    Attributes:
        name: The unique tool name (snake_case).
        description: Plain-text description for the LLM.
        input_schema: JSON Schema describing the arguments.
        run: Async callable `(arguments: dict) -> Any`.
    """

    name: str
    description: str
    input_schema: dict[str, Any]
    run: Callable[..., Any]
    tags: list[str] = field(default_factory=list)

    def to_mcp_descriptor(self) -> dict[str, Any]:
        """Return the MCP `tools/list` descriptor."""
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
        }


# ── Conversion helpers ────────────────────────────────────────────────────────


def tool_to_mcp(tool: Tool) -> MCPTool:
    """Wrap an existing `Tool` instance as an `MCPTool`."""
    return MCPTool(
        name=tool.name,
        description=tool.description,
        input_schema=tool.parameters_schema(),
        run=tool.run,
        tags=["builtin"],
    )


def function_to_mcp(
    *,
    name: str,
    description: str,
    fn: Callable[..., Any],
    parameters: dict[str, Any] | None = None,
    tags: list[str] | None = None,
) -> MCPTool:
    """Wrap a plain async / sync function as an `MCPTool`."""
    if parameters is None:
        parameters = _derive_schema(fn)
    return MCPTool(
        name=name,
        description=description,
        input_schema=parameters,
        run=fn,
        tags=tags or [],
    )


def _derive_schema(fn: Callable[..., Any]) -> dict[str, Any]:
    """Derive a JSON-Schema from a function signature."""
    sig = inspect.signature(fn)
    try:
        hints = inspect.get_annotations(fn)
    except Exception:  # pragma: no cover
        hints = {}
    properties: dict[str, Any] = {}
    required: list[str] = []
    for param_name, param in sig.parameters.items():
        if param.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
            continue
        annotation = hints.get(param_name, str)
        properties[param_name] = _annotation_to_schema(annotation)
        if param.default is inspect.Parameter.empty:
            required.append(param_name)
    return {"type": "object", "properties": properties, "required": required}


_PRIMITIVE = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
    list: "array",
    dict: "object",
}


def _annotation_to_schema(annotation: Any) -> dict[str, Any]:
    if annotation in _PRIMITIVE:
        return {"type": _PRIMITIVE[annotation]}
    origin = getattr(annotation, "__origin__", None)
    if origin in (list, tuple):
        return {"type": "array"}
    if origin is dict:
        return {"type": "object"}
    return {"type": "string"}


# ── Bundled registry ──────────────────────────────────────────────────────────


class MCPToolset:
    """A collection of MCP tools that can be served by the MCP server."""

    def __init__(self) -> None:
        self._tools: dict[str, MCPTool] = {}

    def add(self, tool: MCPTool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"MCP tool '{tool.name}' already registered")
        self._tools[tool.name] = tool

    def remove(self, name: str) -> None:
        self._tools.pop(name, None)

    def get(self, name: str) -> MCPTool | None:
        return self._tools.get(name)

    def names(self) -> list[str]:
        return sorted(self._tools.keys())

    def list(self) -> list[dict[str, Any]]:
        return [t.to_mcp_descriptor() for t in self._tools.values()]

    async def call(self, name: str, arguments: dict[str, Any] | None) -> Any:
        tool = self._tools.get(name)
        if tool is None:
            return {"error": f"Tool '{name}' not found", "available": self.names()}
        try:
            result = tool.run(**(arguments or {}))
            if hasattr(result, "__await__"):
                result = await result
            return result
        except Exception as e:  # pragma: no cover
            return {"error": f"Tool '{name}' crashed: {e}"}

    def from_registry(self, registry: ToolRegistry, *, tags: list[str] | None = None) -> None:
        """Bulk-import all tools from a `ToolRegistry`."""
        for name in registry.names():
            t = registry.get(name)
            if t is None:
                continue
            mcp_tool = tool_to_mcp(t)
            if tags:
                mcp_tool.tags = list(set(mcp_tool.tags + tags))
            self._tools[name] = mcp_tool


# ── Defaults ──────────────────────────────────────────────────────────────────


def default_toolset() -> MCPToolset:
    """Build a default toolset with all built-in tools."""
    from site_api.llm_stack.tools.builtin.math_tools import (
        CalculatorTool,
        CurrentDateTimeTool,
        JsonExtractTool,
    )
    from site_api.llm_stack.tools.builtin.portfolio import (
        PortfolioPagesTool,
        ProjectStackTool,
        SummarizeMarkdownTool,
    )
    from site_api.llm_stack.tools.builtin.web import WebFetchTool, WebSearchTool

    ts = MCPToolset()
    for instance in (
        PortfolioPagesTool(),
        ProjectStackTool(),
        SummarizeMarkdownTool(),
        WebSearchTool(),
        WebFetchTool(),
        CalculatorTool(),
        CurrentDateTimeTool(),
        JsonExtractTool(),
    ):
        ts.add(tool_to_mcp(instance))
    return ts
