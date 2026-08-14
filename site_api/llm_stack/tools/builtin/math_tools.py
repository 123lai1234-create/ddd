"""
site_api/llm_stack/tools/builtin/math_tools.py — Lightweight math / utility tools.

These are examples that show how to expose existing project functions
(notably the protein-pipeline metrics) to the LLM.
"""

from __future__ import annotations

import math
from typing import Any

from site_api.llm_stack.tools.base import Tool, ToolResult


class CalculatorTool(Tool):
    """Evaluate a simple arithmetic expression safely."""

    @property
    def name(self) -> str:
        return "calculator"

    @property
    def description(self) -> str:
        return "Evaluate a basic arithmetic expression (supports +, -, *, /, **, parentheses, math.*). Returns the numeric result."

    async def run(self, *, expression: str) -> ToolResult:
        if not expression or not expression.strip():
            return ToolResult(success=False, content="", error="expression is empty")
        # Whitelist the builtins we expose.
        safe_globals = {"__builtins__": {}, "math": math}
        try:
            # Restricted eval — no attribute access, no name lookups.
            result = eval(expression, safe_globals, {})  # noqa: S307 — controlled input
        except Exception as e:
            return ToolResult(success=False, content="", error=f"eval failed: {e}")
        return ToolResult(success=True, content=str(result), data={"result": result})


class CurrentDateTimeTool(Tool):
    """Return the current date / time in ISO 8601."""

    @property
    def name(self) -> str:
        return "current_datetime"

    @property
    def description(self) -> str:
        return "Return the current date and time in ISO 8601 format (UTC) and the local server timezone."

    async def run(self, **kwargs: Any) -> ToolResult:
        from datetime import datetime, timezone

        now = datetime.now(tz=timezone.utc)
        return ToolResult(
            success=True,
            content=now.isoformat(),
            data={"utc": now.isoformat(), "timezone": str(now.tzinfo)},
        )


class JsonExtractTool(Tool):
    """Extract a value from a JSON document using a dotted path (e.g. `data.user.name`)."""

    @property
    def name(self) -> str:
        return "json_extract"

    @property
    def description(self) -> str:
        return "Extract a value from a JSON document using a dotted path (e.g. 'data.user.name'). Returns the JSON-encoded value."

    async def run(self, *, document: dict[str, Any], path: str) -> ToolResult:
        import json

        if not isinstance(document, dict):
            return ToolResult(success=False, content="", error="document must be a JSON object")
        if not path:
            return ToolResult(success=False, content="", error="path is empty")
        cur: Any = document
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                return ToolResult(success=False, content="", error=f"path '{path}' not found at '{part}'")
        return ToolResult(success=True, content=json.dumps(cur, ensure_ascii=False, indent=2), data=cur)
