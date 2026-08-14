"""
site_api/llm_stack/tools/base.py — Tool Calling base classes.

A "Tool" is a function the LLM can invoke. Each tool has:
- name: unique identifier (must be a valid Python identifier / snake_case)
- description: human-readable description for the LLM
- parameters: JSON-Schema describing the arguments
- run(): async (or sync) callable that performs the action

Tools are exposed to LLMs via `ToolDefinition` (declared in `types.py`).
The same `ToolDefinition` is reused by the OpenAI, Anthropic, and Gemini
providers so a single tool can be re-used across all of them.
"""

from __future__ import annotations

import inspect
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable, get_type_hints

from site_api.llm_stack.types import ToolDefinition

logger = logging.getLogger(__name__)


# ── Tool result ───────────────────────────────────────────────────────────────


@dataclass
class ToolResult:
    """A structured result from a tool invocation.

    Attributes:
        success: Whether the tool ran successfully.
        content: The string content returned to the LLM.
        data: Optional structured payload (not sent to the LLM, but useful for tracing).
        error: Optional error message (only set if success=False).
    """

    success: bool
    content: str
    data: Any | None = None
    error: str | None = None

    def to_message(self) -> str:
        return self.content if self.success else f"[ERROR] {self.error or self.content}"


# ── Base Tool ─────────────────────────────────────────────────────────────────


class Tool(ABC):
    """Abstract base class for tools."""

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        ...

    @abstractmethod
    async def run(self, **kwargs: Any) -> ToolResult:
        ...

    def to_definition(self) -> ToolDefinition:
        """Return the JSON-Schema description of the tool."""
        params = self.parameters_schema()
        return ToolDefinition(name=self.name, description=self.description, parameters=params)

    def parameters_schema(self) -> dict[str, Any]:
        """Build a JSON-Schema from the `run` signature.

        Override to provide a custom schema (e.g. for tools with complex
        nested arguments).
        """
        sig = inspect.signature(self.run)
        hints = get_type_hints(self.run)
        properties: dict[str, Any] = {}
        required: list[str] = []
        for param_name, param in sig.parameters.items():
            if param_name == "self":
                continue
            if param.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
                continue
            annotation = hints.get(param_name, str)
            properties[param_name] = _python_type_to_json_schema(annotation)
            if param.default is inspect.Parameter.empty:
                required.append(param_name)
        return {
            "type": "object",
            "properties": properties,
            "required": required,
        }


# ── Function-based tool ───────────────────────────────────────────────────────


class FunctionTool(Tool):
    """Wrap a plain async (or sync) function as a tool.

    Example:
        async def fetch_weather(city: str) -> str:
            ...
        tool = FunctionTool(
            name="fetch_weather",
            description="Get the current weather for a city.",
            fn=fetch_weather,
        )
    """

    def __init__(
        self,
        *,
        name: str,
        description: str,
        fn: Callable[..., Any],
        parameters: dict[str, Any] | None = None,
    ) -> None:
        self._name = name
        self._description = description
        self._fn = fn
        self._custom_parameters = parameters

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    async def run(self, **kwargs: Any) -> ToolResult:
        try:
            result = self._fn(**kwargs)
            if hasattr(result, "__await__"):
                result = await result
            if isinstance(result, ToolResult):
                return result
            return ToolResult(success=True, content=str(result), data=result)
        except Exception as e:
            logger.exception("Tool %s failed", self._name)
            return ToolResult(success=False, content="", error=str(e))

    def parameters_schema(self) -> dict[str, Any]:
        if self._custom_parameters is not None:
            return self._custom_parameters
        return super().parameters_schema()


# ── Type helpers ──────────────────────────────────────────────────────────────


_PRIMITIVE_MAP: dict[Any, str] = {
    str: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
    list: "array",
    dict: "object",
    type(None): "null",
}


def _python_type_to_json_schema(annotation: Any) -> dict[str, Any]:
    """Best-effort Python-type → JSON-Schema conversion."""
    if annotation in _PRIMITIVE_MAP:
        return {"type": _PRIMITIVE_MAP[annotation]}
    origin = getattr(annotation, "__origin__", None)
    if origin is list:
        return {"type": "array"}
    if origin is dict:
        return {"type": "object"}
    if origin is type(None):
        return {"type": "null"}
    # Fallback — accept anything as a string.
    return {"type": "string"}


def parse_tool_arguments(raw: str | dict[str, Any]) -> dict[str, Any]:
    """Helper: parse a tool_calls.arguments payload (string or dict)."""
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"_raw": raw}
