"""
site_api/llm_stack/langgraph_layer/workflows.py — LangGraph-style workflows.

Implements a tiny but functional `StateGraph` with:
- Named nodes (async callables taking a `GraphState`)
- Static edges (`a -> b`)
- Conditional edges (`a -> b or c based on state`)
- Cyclic graph execution (loops until `done=True` or max iterations)

The API resembles LangGraph's `StateGraph` so existing LangGraph
workflows can be ported with minimal changes.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

from site_api.llm_stack.langgraph_layer.state import GraphState

logger = logging.getLogger(__name__)


Node = Callable[[GraphState], Any]
ConditionalEdge = Callable[[GraphState], str]


class StateGraph:
    """A minimal LangGraph-style state graph."""

    def __init__(self, *, name: str = "workflow", max_iterations: int = 25) -> None:
        self.name = name
        self.max_iterations = max_iterations
        self._nodes: dict[str, Node] = {}
        self._edges: dict[str, str] = {}
        self._conditional_edges: dict[str, tuple[ConditionalEdge, dict[str, str]]] = {}
        self._entry: str | None = None
        self._finish_nodes: set[str] = set()

    # ── Builder API ──────────────────────────────────────────────────────────

    def add_node(self, name: str, fn: Node) -> "StateGraph":
        if name in self._nodes:
            raise ValueError(f"Node {name!r} already added")
        self._nodes[name] = fn
        return self

    def set_entry_point(self, name: str) -> "StateGraph":
        if name not in self._nodes:
            raise ValueError(f"Unknown entry node: {name}")
        self._entry = name
        return self

    def add_edge(self, src: str, dst: str) -> "StateGraph":
        if src not in self._nodes:
            raise ValueError(f"Unknown source node: {src}")
        self._edges[src] = dst
        return self

    def add_conditional_edges(
        self,
        src: str,
        router: ConditionalEdge,
        branches: dict[str, str],
    ) -> "StateGraph":
        if src not in self._nodes:
            raise ValueError(f"Unknown source node: {src}")
        self._conditional_edges[src] = (router, branches)
        return self

    def set_finish_point(self, name: str) -> "StateGraph":
        if name not in self._nodes:
            raise ValueError(f"Unknown finish node: {name}")
        self._finish_nodes.add(name)
        return self

    # ── Execution ────────────────────────────────────────────────────────────

    async def arun(self, state: GraphState | None = None) -> GraphState:
        if not self._entry:
            raise RuntimeError("No entry point set")
        st = state or GraphState()
        current = self._entry
        for it in range(1, self.max_iterations + 1):
            logger.debug("[%s] iter=%d node=%s", self.name, it, current)
            node = self._nodes[current]
            result = node(st)
            if hasattr(result, "__await__"):
                await result
            if st.done or current in self._finish_nodes:
                st.done = True
                break
            # Decide next node.
            if current in self._conditional_edges:
                router, branches = self._conditional_edges[current]
                choice = router(st)
                next_node = branches.get(choice, current)
            elif current in self._edges:
                next_node = self._edges[current]
            else:
                # No more edges → terminate.
                st.done = True
                break
            if next_node != current:
                current = next_node
        else:
            logger.warning("[%s] hit max_iterations=%d", self.name, self.max_iterations)
            st.done = True
        return st

    # ── Introspection ───────────────────────────────────────────────────────

    def describe(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "entry": self._entry,
            "nodes": sorted(self._nodes.keys()),
            "edges": dict(self._edges),
            "conditional_edges": {
                src: {"branches": list(branches.keys())}
                for src, (_, branches) in self._conditional_edges.items()
            },
            "finish_nodes": sorted(self._finish_nodes),
        }


# ── Built-in node helpers ─────────────────────────────────────────────────────


async def llm_node(state: GraphState, *, prompt_key: str = "prompt", output_key: str = "answer") -> None:
    """An LLM node that reads `scratch[prompt_key]`, calls the LLM, and writes the result."""
    from site_api.llm_stack.unified_client import chat

    prompt = state.scratch.get(prompt_key, "")
    if not prompt:
        raise RuntimeError(f"LLM node missing {prompt_key!r} in state.scratch")
    resp = await chat(prompt)
    state.scratch[output_key] = resp.content
    state.scratch.setdefault("history", []).append(
        {"role": "user", "content": prompt, "node": prompt_key}
    )
    state.scratch["history"].append({"role": "assistant", "content": resp.content, "node": output_key})


async def rag_node(state: GraphState, *, question_key: str = "question", output_key: str = "answer") -> None:
    """A RAG node that reads `scratch[question_key]` and writes the synthesised answer."""
    from site_api.llm_stack.rag import rag_chain

    question = state.scratch.get(question_key, "")
    if not question:
        raise RuntimeError(f"RAG node missing {question_key!r} in state.scratch")
    resp = await rag_chain.query(question)
    state.scratch[output_key] = resp.answer
    state.scratch.setdefault("sources", []).extend(
        [{"chunk_id": r.chunk.chunk_id, "score": r.score, "content": r.chunk.content} for r in resp.sources]
    )


async def tool_node(state: GraphState, *, tool_name: str, args_key: str = "tool_args", output_key: str = "tool_result") -> None:
    """A node that calls a registered tool by name."""
    from site_api.llm_stack.tools import registry

    args = state.scratch.get(args_key, {}) or {}
    result = await registry.execute(tool_name, args)
    state.scratch[output_key] = result
