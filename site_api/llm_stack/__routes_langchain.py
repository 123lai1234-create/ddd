"""
site_api/llm_stack/__routes_langchain.py - FastAPI routes for LangChain-style chains & agents.

Path prefix: `/llm/lc`
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/llm/lc", tags=["LangChain"])


# ── Models ────────────────────────────────────────────────────────────────────


class LLMChainRequest(BaseModel):
    prompt_template: str = Field(..., description="Prompt template with {variable} placeholders")
    variables: dict[str, Any] = Field(default_factory=dict)
    system_prompt: str | None = None
    provider: str | None = None
    model: str | None = None
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=1, le=8192)
    output_key: str = Field(default="output")


class LLMChainResponse(BaseModel):
    output: str
    model: str | None = None
    provider: str | None = None
    usage: dict[str, Any] | None = None


class SequentialChainRequest(BaseModel):
    chains: list[LLMChainRequest] = Field(..., description="Ordered list of chains")
    inputs: dict[str, Any] = Field(default_factory=dict)


class SequentialChainResponse(BaseModel):
    state: dict[str, Any]


class AgentRequest(BaseModel):
    question: str = Field(..., min_length=1)
    provider: str | None = None
    model: str | None = None
    max_iterations: int = Field(default=8, ge=1, le=20)
    tool_names: list[str] | None = Field(default=None, description="Restrict to these tools (default: all)")


class AgentResponse(BaseModel):
    final_answer: str
    iterations: int
    steps: list[dict[str, Any]]


class RetrievalQARequest(BaseModel):
    question: str = Field(..., min_length=1)
    top_k: int | None = None
    provider: str | None = None
    text: str | None = Field(default=None, description="Optional text to ingest before querying")
    text_source: str | None = None


class RetrievalQAResponse(BaseModel):
    answer: str
    source_count: int
    model: str | None = None
    provider: str | None = None


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/status")
def lc_status() -> dict[str, Any]:
    """Return info about the LangChain layer."""
    from site_api.llm_stack.langchain_layer import LLMChain, RetrievalQA, ReActAgent, SequentialChain

    try:
        import langchain  # noqa: F401

        langchain_present = True
    except ImportError:
        langchain_present = False
    return {
        "langchain_installed": langchain_present,
        "available": ["LLMChain", "SequentialChain", "RetrievalQA", "ReActAgent"],
    }


@router.post("/chain", response_model=LLMChainResponse)
async def llm_chain(request: LLMChainRequest) -> LLMChainResponse:
    """Run a single LLMChain with the given template and variables."""
    from site_api.llm_stack.langchain_layer import LLMChain

    try:
        chain = LLMChain(
            prompt_template=request.prompt_template,
            system_prompt=request.system_prompt,
            provider=request.provider,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            output_key=request.output_key,
        )
        result = await chain.arun(**request.variables)
        return LLMChainResponse(
            output=result.get(request.output_key, ""),
            model=result.get("model"),
            provider=result.get("provider"),
            usage=result.get("usage"),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e
    except Exception as e:
        logger.exception("LLMChain failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"LLMChain error: {e}") from e


@router.post("/chain/sequential", response_model=SequentialChainResponse)
async def sequential_chain(request: SequentialChainRequest) -> SequentialChainResponse:
    """Run a sequence of LLMChains, threading outputs into inputs."""
    from site_api.llm_stack.langchain_layer import LLMChain, SequentialChain

    try:
        chains = [
            LLMChain(
                prompt_template=c.prompt_template,
                system_prompt=c.system_prompt,
                provider=c.provider,
                model=c.model,
                temperature=c.temperature,
                max_tokens=c.max_tokens,
                output_key=c.output_key,
            )
            for c in request.chains
        ]
        seq = SequentialChain(chains)
        result = await seq.arun(**request.inputs)
        return SequentialChainResponse(state=result)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e
    except Exception as e:
        logger.exception("SequentialChain failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"SequentialChain error: {e}") from e


@router.post("/agent", response_model=AgentResponse)
async def agent(request: AgentRequest) -> AgentResponse:
    """Run a ReAct agent with the configured tools."""
    from site_api.llm_stack.langchain_layer import ReActAgent
    from site_api.llm_stack.tools import ToolRegistry

    try:
        # Restrict tool registry if requested.
        if request.tool_names:
            full = _default_toolset()
            restricted = ToolRegistry()
            for n in request.tool_names:
                t = full.get(n)
                if t is not None:
                    restricted.register(t)
            tools = restricted
        else:
            tools = _default_toolset()

        agent_obj = ReActAgent(
            tools=tools,
            provider=request.provider,
            model=request.model,
            max_iterations=request.max_iterations,
        )
        result = await agent_obj.arun(request.question)
        steps = [
            {
                "thought": s.thought,
                "action": s.action,
                "tool_name": s.tool_name,
                "tool_input": s.tool_input,
                "observation": s.observation,
            }
            for s in result.steps
        ]
        return AgentResponse(
            final_answer=result.final_answer,
            iterations=result.iterations,
            steps=steps,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e
    except Exception as e:
        logger.exception("Agent failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Agent error: {e}") from e


@router.post("/retrieval-qa", response_model=RetrievalQAResponse)
async def retrieval_qa(request: RetrievalQARequest) -> RetrievalQAResponse:
    """Run a RetrievalQA chain (optionally ingesting text first)."""
    from site_api.llm_stack.langchain_layer import RetrievalQA

    try:
        qa = RetrievalQA(top_k=request.top_k or 5, provider=request.provider)
        if request.text:
            await qa.add_text(request.text, metadata={"source": request.text_source} if request.text_source else None)
        result = await qa.arun(request.question)
        return RetrievalQAResponse(
            answer=result.get("result", ""),
            source_count=len(result.get("source_documents", []) or []),
            model=result.get("model"),
            provider=result.get("provider"),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e
    except Exception as e:
        logger.exception("RetrievalQA failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"RetrievalQA error: {e}") from e


# ── Helpers ───────────────────────────────────────────────────────────────────


def _default_toolset() -> ToolRegistry:
    """Build a temporary ToolRegistry with all built-in tools."""
    from site_api.llm_stack.tools import ToolRegistry
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

    reg = ToolRegistry()
    for inst in (
        PortfolioPagesTool(),
        ProjectStackTool(),
        SummarizeMarkdownTool(),
        WebSearchTool(),
        WebFetchTool(),
        CalculatorTool(),
        CurrentDateTimeTool(),
        JsonExtractTool(),
    ):
        reg.register(inst)
    return reg
