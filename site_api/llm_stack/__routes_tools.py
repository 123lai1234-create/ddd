"""
site_api/llm_stack/__routes_tools.py — FastAPI routes for tool calling.

Path prefix: `/llm/tools`
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from site_api.llm_stack.tools import registry
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

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/llm/tools", tags=["LLM Tools"])


# ── Bootstrap ─────────────────────────────────────────────────────────────────


def ensure_default_tools() -> None:
    """Register built-in tools if they haven't been registered yet."""
    if "portfolio_pages" in registry:
        return
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
        registry.register(instance)


ensure_default_tools()


# ── Models ────────────────────────────────────────────────────────────────────


class ToolCallRequest(BaseModel):
    name: str = Field(..., description="Tool name")
    arguments: dict[str, Any] = Field(default_factory=dict, description="Tool arguments")


class ToolCallResponse(BaseModel):
    name: str
    success: bool
    content: str
    error: str | None = None


class ChatWithToolsRequest(BaseModel):
    question: str = Field(..., description="User question")
    provider: str | None = None
    model: str | None = None
    max_iterations: int = Field(default=5, ge=1, le=10)
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)


class ChatWithToolsResponse(BaseModel):
    answer: str
    iterations: int
    model: str | None = None
    provider: str | None = None
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("")
def list_tools() -> dict[str, Any]:
    """List all available tools."""
    return {
        "count": len(registry),
        "names": registry.names(),
        "tools": [
            {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters_schema(),
            }
            for t in registry._tools.values()  # noqa: SLF001 — internal
        ],
    }


@router.post("/call", response_model=ToolCallResponse)
async def call_tool(request: ToolCallRequest) -> ToolCallResponse:
    """Execute a single tool by name."""
    if request.name not in registry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool '{request.name}' not found. Available: {registry.names()}",
        )
    try:
        result = await registry.execute(request.name, request.arguments)
        return ToolCallResponse(name=request.name, success=True, content=result)
    except Exception as e:
        logger.exception("Tool call failed")
        return ToolCallResponse(name=request.name, success=False, content="", error=str(e))


@router.post("/chat", response_model=ChatWithToolsResponse)
async def chat_with_tools(request: ChatWithToolsRequest) -> ChatWithToolsResponse:
    """Run a tool-calling loop: the LLM picks a tool, we execute it, repeat."""
    from site_api.llm_stack.unified_client import llm
    from site_api.llm_stack.types import LLMMessage

    messages: list[LLMMessage] = [LLMMessage.user(request.question)]
    tool_calls_made: list[dict[str, Any]] = []
    iterations = 0
    final = None
    try:
        for it in range(1, request.max_iterations + 1):
            iterations = it
            resp = await llm.chat(
                messages,
                provider=request.provider,
                model=request.model,
                temperature=request.temperature,
                tools=registry.definitions(),
            )
            if not resp.tool_calls:
                final = resp
                break
            # Append the assistant's tool call message.
            messages.append(
                LLMMessage.assistant(
                    content=resp.content or "",
                    tool_calls=resp.tool_calls,
                )
            )
            for tc in resp.tool_calls:
                fn = tc.get("function", {}) or {}
                name = fn.get("name", "")
                args = fn.get("arguments", {})
                tool_calls_made.append({"name": name, "arguments": args})
                result = await registry.execute(name, args)
                messages.append(
                    LLMMessage(
                        role="tool",
                        content=result,
                        name=name,
                        tool_call_id=tc.get("id"),
                    )
                )
        if final is None:
            final = await llm.chat(
                messages,
                provider=request.provider,
                model=request.model,
                temperature=request.temperature,
            )
        return ChatWithToolsResponse(
            answer=final.content,
            iterations=iterations,
            model=final.model,
            provider=final.provider,
            tool_calls=tool_calls_made,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e
    except Exception as e:
        logger.exception("Tool-chained chat failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"LLM error: {e}") from e
