"""
site_api/llm_stack/__routes_langgraph.py - FastAPI routes for LangGraph-style workflows.

Path prefix: `/llm/lg`
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/llm/lg", tags=["LangGraph"])


# ── Models ────────────────────────────────────────────────────────────────────


class GraphNodeSpec(BaseModel):
    name: str
    type: str = Field(..., description="llm | rag | tool | echo")
    prompt_key: str | None = None
    output_key: str | None = None
    question_key: str | None = None
    tool_name: str | None = None
    args_key: str | None = None


class GraphEdgeSpec(BaseModel):
    src: str
    dst: str


class ConditionalEdgeSpec(BaseModel):
    src: str
    router: str = Field(..., description="always | key_equals | key_exists")
    key: str | None = None
    equals: Any | None = None
    on_true: str
    on_false: str


class GraphRequest(BaseModel):
    name: str = "workflow"
    nodes: list[GraphNodeSpec]
    edges: list[GraphEdgeSpec] = Field(default_factory=list)
    conditional_edges: list[ConditionalEdgeSpec] = Field(default_factory=list)
    entry_point: str
    finish_points: list[str] = Field(default_factory=list)
    inputs: dict[str, Any] = Field(default_factory=dict)
    max_iterations: int = Field(default=25, ge=1, le=500)


class GraphResponse(BaseModel):
    state: dict[str, Any]
    done: bool
    iterations: int


# ── Built-in workflow templates ────────────────────────────────────────────────


# Pre-defined graphs we can run by name.
_TEMPLATES: dict[str, dict[str, Any]] = {}


def _register_templates() -> None:
    """Register example workflow templates."""
    _TEMPLATES["rag_then_summarise"] = {
        "name": "rag_then_summarise",
        "nodes": [
            {"name": "retrieve", "type": "rag", "question_key": "question", "output_key": "answer"},
            {"name": "summarise", "type": "llm", "prompt_key": "summarise_prompt", "output_key": "summary"},
        ],
        "edges": [
            {"src": "retrieve", "dst": "summarise"},
        ],
        "entry_point": "retrieve",
        "finish_points": ["summarise"],
    }
    _TEMPLATES["tool_lookup_chain"] = {
        "name": "tool_lookup_chain",
        "nodes": [
            {"name": "get_time", "type": "tool", "tool_name": "current_datetime", "args_key": "time_args", "output_key": "time"},
            {"name": "lookup", "type": "tool", "tool_name": "portfolio_pages", "args_key": "lookup_args", "output_key": "pages"},
            {"name": "compose", "type": "llm", "prompt_key": "compose_prompt", "output_key": "answer"},
        ],
        "edges": [
            {"src": "get_time", "dst": "lookup"},
            {"src": "lookup", "dst": "compose"},
        ],
        "entry_point": "get_time",
        "finish_points": ["compose"],
    }


_register_templates()


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/templates")
def list_templates() -> dict[str, Any]:
    """List pre-defined workflow templates."""
    return {"templates": list(_TEMPLATES.keys())}


@router.get("/template/{name}")
def get_template(name: str) -> dict[str, Any]:
    """Return a pre-defined template by name."""
    if name not in _TEMPLATES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Template {name!r} not found")
    return _TEMPLATES[name]


@router.post("/run", response_model=GraphResponse)
async def run_graph(request: GraphRequest) -> GraphResponse:
    """Build and run a graph from the given spec."""
    from site_api.llm_stack.langgraph_layer import GraphState, StateGraph, llm_node, rag_node, tool_node

    try:
        graph = StateGraph(name=request.name, max_iterations=request.max_iterations)
        for node in request.nodes:
            t = node.type.lower()
            if t == "llm":
                out_k = node.output_key or "answer"
                in_k = node.prompt_key or "prompt"

                async def llm_factory(in_k=in_k, out_k=out_k):
                    async def _node(state: GraphState) -> None:
                        await llm_node(state, prompt_key=in_k, output_key=out_k)
                    return _node

                graph.add_node(node.name, await llm_factory())
            elif t == "rag":
                in_k = node.question_key or "question"
                out_k = node.output_key or "answer"

                async def rag_factory(in_k=in_k, out_k=out_k):
                    async def _node(state: GraphState) -> None:
                        await rag_node(state, question_key=in_k, output_key=out_k)
                    return _node

                graph.add_node(node.name, await rag_factory())
            elif t == "tool":
                tool_name = node.tool_name or ""
                out_k = node.output_key or "tool_result"
                in_k = node.args_key or "tool_args"

                async def tool_factory(tool_name=tool_name, in_k=in_k, out_k=out_k):
                    async def _node(state: GraphState) -> None:
                        await tool_node(state, tool_name=tool_name, args_key=in_k, output_key=out_k)
                    return _node

                graph.add_node(node.name, await tool_factory())
            elif t == "echo":
                out_k = node.output_key or "echo"

                async def echo_factory(out_k=out_k):
                    async def _node(state: GraphState) -> None:
                        state.scratch[out_k] = state.scratch.get("input", "")
                    return _node

                graph.add_node(node.name, await echo_factory())
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown node type: {t}",
                )

        graph.set_entry_point(request.entry_point)
        for e in request.edges:
            graph.add_edge(e.src, e.dst)
        for ce in request.conditional_edges:
            router_fn = _build_router(ce)
            graph.add_conditional_edges(ce.src, router_fn, {True: ce.on_true, False: ce.on_false})
        for fp in request.finish_points:
            graph.set_finish_point(fp)

        state = GraphState()
        state.scratch.update(request.inputs)
        result = await graph.arun(state)
        return GraphResponse(state=result.to_dict(), done=result.done, iterations=0)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Graph execution failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Graph error: {e}") from e


@router.post("/run/{template_name}", response_model=GraphResponse)
async def run_template(template_name: str, inputs: dict[str, Any]) -> GraphResponse:
    """Run a pre-defined template with the given inputs."""
    if template_name not in _TEMPLATES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Template {template_name!r} not found")
    spec = _TEMPLATES[template_name]
    request = GraphRequest(
        name=spec["name"],
        nodes=[GraphNodeSpec(**n) for n in spec["nodes"]],
        edges=[GraphEdgeSpec(**e) for e in spec.get("edges", [])],
        entry_point=spec["entry_point"],
        finish_points=spec.get("finish_points", []),
        inputs=inputs,
    )
    return await run_graph(request)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _build_router(ce: ConditionalEdgeSpec):
    """Build a router function from a conditional edge spec."""
    if ce.router == "always":
        return lambda state: True
    if ce.router == "key_equals":
        if not ce.key:
            raise ValueError("key_equals router requires a `key` field")

        def router(state) -> bool:
            return state.scratch.get(ce.key) == ce.equals

        return router
    if ce.router == "key_exists":
        if not ce.key:
            raise ValueError("key_exists router requires a `key` field")

        def router(state) -> bool:
            return ce.key in state.scratch

        return router
    raise ValueError(f"Unknown router: {ce.router}")
