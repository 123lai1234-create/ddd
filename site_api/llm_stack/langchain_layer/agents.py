"""
site_api/llm_stack/langchain_layer/agents.py — LangChain-style agents.

An Agent is an LLM-driven loop that picks a tool to call at each step.
We implement the same `ReAct` (reason + act) pattern using the unified
tool registry and LLM client — no external dependency required.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from site_api.llm_stack.tools.registry import ToolRegistry
from site_api.llm_stack.types import LLMMessage, ToolDefinition

logger = logging.getLogger(__name__)


REACT_SYSTEM_PROMPT = """You are a helpful agent with access to tools.

Use the following format for each step:

Thought: describe what you are thinking
Action: the next action to take — either:
  - Call: <tool_name>(<json_arguments>)
  - Finish: <final answer>

You may take multiple steps. When you are confident you have the answer,
use Finish to provide it.

Available tools:
{tool_descriptions}
"""


@dataclass
class AgentStep:
    """A single step in the agent's reasoning trace."""

    thought: str
    action: str
    tool_name: str | None = None
    tool_input: dict[str, Any] | None = None
    observation: str | None = None


@dataclass
class AgentResult:
    """The final result of an agent run."""

    final_answer: str
    steps: list[AgentStep] = field(default_factory=list)
    iterations: int = 0


# ── Helpers ──────────────────────────────────────────────────────────────────


def _format_tool_descriptions(tools: list[ToolDefinition]) -> str:
    blocks: list[str] = []
    for t in tools:
        params = t.parameters.get("properties", {})
        param_desc = ", ".join(f"{k}: {v.get('type', 'string')}" for k, v in params.items())
        blocks.append(f"- {t.name}({param_desc}) — {t.description}")
    return "\n".join(blocks)


_ACTION_RE = re.compile(
    r"Action:\s*(?P<action>Call|Finish)\s*:\s*(?P<rest>.*?)(?=\n(?:Thought|Action|Final Answer|$)|\Z)",
    re.DOTALL | re.IGNORECASE,
)


def _parse_action(text: str) -> tuple[str, str, dict[str, Any] | None]:
    """Parse the LLM output into (kind, payload, parsed_args)."""
    match = _ACTION_RE.search(text)
    if not match:
        return "Finish", text.strip(), None
    action = match.group("action").lower()
    rest = match.group("rest").strip()
    if action == "finish":
        return "Finish", rest, None
    # action == "call"
    # Expect: tool_name(json_args)
    m = re.match(r"^(?P<name>\w+)\s*\((?P<args>.*)\)\s*$", rest, re.DOTALL)
    if not m:
        return "Finish", rest, None
    name = m.group("name")
    args_str = m.group("args").strip()
    # Try to parse as JSON first.
    try:
        args = json.loads(args_str)
    except json.JSONDecodeError:
        # Fall back to a simple key=value parser.
        args = {}
        for part in re.findall(r'(\w+)\s*[:=]\s*("[^"]*"|\'[^\']*\'|\S+)', args_str):
            key, value = part
            value = value.strip()
            if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]
            args[key] = value
    return "Call", name, args


# ── Agent ─────────────────────────────────────────────────────────────────────


class ReActAgent:
    """A ReAct-style agent that uses the unified LLM client + tool registry."""

    def __init__(
        self,
        tools: ToolRegistry,
        *,
        provider: str | None = None,
        model: str | None = None,
        max_iterations: int = 8,
        temperature: float = 0.0,
    ) -> None:
        self.tools = tools
        self.provider = provider
        self.model = model
        self.max_iterations = max_iterations
        self.temperature = temperature

    def _system_prompt(self) -> str:
        return REACT_SYSTEM_PROMPT.format(tool_descriptions=_format_tool_descriptions(self.tools.definitions()))

    async def arun(self, question: str) -> AgentResult:
        from site_api.llm_stack.unified_client import llm

        messages: list[LLMMessage] = [
            LLMMessage.system(self._system_prompt()),
            LLMMessage.user(f"Question: {question}\n\nThought:"),
        ]
        steps: list[AgentStep] = []
        for iteration in range(1, self.max_iterations + 1):
            resp = await llm.chat(
                messages,
                provider=self.provider,
                model=self.model,
                temperature=self.temperature,
            )
            text = resp.content or ""
            kind, payload, parsed = _parse_action(text)
            if kind == "Finish":
                # Extract any "Final Answer:" prefix if present.
                answer = re.sub(r"^\s*Final Answer\s*:\s*", "", payload, flags=re.IGNORECASE).strip()
                steps.append(AgentStep(thought=text, action="Finish"))
                return AgentResult(final_answer=answer, steps=steps, iterations=iteration)
            # Call
            tool_name = payload
            observation = await self.tools.execute(tool_name, parsed or {})
            step = AgentStep(
                thought=text,
                action="Call",
                tool_name=tool_name,
                tool_input=parsed,
                observation=observation,
            )
            steps.append(step)
            messages.append(LLMMessage.assistant(text))
            messages.append(
                LLMMessage.user(f"Observation: {observation}\n\nThought:")
            )
        # Ran out of iterations.
        return AgentResult(
            final_answer="[AGENT] Reached max iterations without finding an answer.",
            steps=steps,
            iterations=self.max_iterations,
        )


# ── Higher-level helper ───────────────────────────────────────────────────────


async def run_agent(
    question: str,
    *,
    tools: ToolRegistry | None = None,
    provider: str | None = None,
    model: str | None = None,
    max_iterations: int = 8,
) -> AgentResult:
    """Convenience function: run an agent with the default tools."""
    if tools is None:
        from site_api.llm_stack.tools import registry

        tools = registry
    agent = ReActAgent(tools=tools, provider=provider, model=model, max_iterations=max_iterations)
    return await agent.arun(question)
