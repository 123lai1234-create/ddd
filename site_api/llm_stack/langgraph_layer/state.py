"""
site_api/llm_stack/langgraph_layer/state.py — Typed state for graph workflows.

We follow the LangGraph convention of passing a typed `dict` between
nodes. Each node receives the current state and returns a partial
update that is merged back into the state.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class GraphState:
    """Shared state for a LangGraph-style workflow.

    Attributes:
        messages: A list of plain dicts (role/content) representing the conversation.
        scratch: A free-form dict for nodes to share intermediate values.
        next_node: Override which node runs next (set by conditional edges).
        done: True when the workflow should terminate.
        metadata: Free-form metadata for tracing.
    """

    messages: list[dict[str, Any]] = field(default_factory=list)
    scratch: dict[str, Any] = field(default_factory=dict)
    next_node: str | None = None
    done: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)

    def update(self, **kwargs: Any) -> None:
        for k, v in kwargs.items():
            if hasattr(self, k):
                setattr(self, k, v)
            else:
                self.scratch[k] = v

    def to_dict(self) -> dict[str, Any]:
        return {
            "messages": list(self.messages),
            "scratch": dict(self.scratch),
            "next_node": self.next_node,
            "done": self.done,
            "metadata": dict(self.metadata),
        }
