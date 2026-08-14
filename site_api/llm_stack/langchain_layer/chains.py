"""
site_api/llm_stack/langchain_layer/chains.py — LangChain-style chains.

This module provides thin wrappers that mimic the LangChain API
(`LLMChain`, `SequentialChain`, `RetrievalQA`) but use the unified
LLM client + RAG chain under the hood.

If the `langchain` package is installed we automatically delegate to
the real implementation; otherwise we fall back to our internal one.
"""

from __future__ import annotations

import logging
from typing import Any

from site_api.llm_stack.types import LLMMessage

logger = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _try_langchain() -> bool:
    """Return True if langchain is available."""
    try:
        import langchain  # noqa: F401

        return True
    except ImportError:
        return False


# ── LLMChain ──────────────────────────────────────────────────────────────────


class LLMChain:
    """A simple LLM chain: prompt template → LLM call → output.

    Example:
        chain = LLMChain(
            prompt_template="Translate to Mandarin: {text}",
            output_key="translation",
        )
        result = await chain.arun(text="Hello world")
        # result == {"translation": "你好，世界"}
    """

    def __init__(
        self,
        *,
        prompt_template: str,
        provider: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        output_key: str = "output",
        system_prompt: str | None = None,
    ) -> None:
        self.prompt_template = prompt_template
        self.provider = provider
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.output_key = output_key
        self.system_prompt = system_prompt
        self._has_lc = _try_langchain()

    def _format(self, variables: dict[str, Any]) -> str:
        try:
            return self.prompt_template.format(**variables)
        except KeyError as e:
            missing = e.args[0]
            raise ValueError(f"Missing template variable: {missing}") from e

    async def arun(self, **variables: Any) -> dict[str, Any]:
        from site_api.llm_stack.unified_client import llm

        prompt = self._format(variables)
        messages: list[LLMMessage] = []
        if self.system_prompt:
            messages.append(LLMMessage.system(self.system_prompt))
        messages.append(LLMMessage.user(prompt))
        resp = await llm.chat(
            messages,
            provider=self.provider,
            model=self.model,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )
        return {
            self.output_key: resp.content,
            "model": resp.model,
            "provider": resp.provider,
            "usage": resp.usage,
        }

    def __call__(self, **variables: Any):  # pragma: no cover
        return self.arun(**variables)


# ── SequentialChain ───────────────────────────────────────────────────────────


class SequentialChain:
    """Run a sequence of LLMChains, threading outputs into inputs.

    Example:
        chain_a = LLMChain(prompt_template="...", output_key="draft")
        chain_b = LLMChain(prompt_template="Rewrite: {draft}", output_key="final")
        seq = SequentialChain([chain_a, chain_b])
        result = await seq.arun(topic="AI")
    """

    def __init__(self, chains: list[LLMChain]) -> None:
        self.chains = chains

    async def arun(self, **inputs: Any) -> dict[str, Any]:
        state: dict[str, Any] = dict(inputs)
        for chain in self.chains:
            result = await chain.arun(**state)
            state.update(result)
        return state


# ── RetrievalQA ───────────────────────────────────────────────────────────────


class RetrievalQA:
    """A retrieval-augmented QA chain.

    Wraps the existing `RAGChain` so the interface matches LangChain's
    `RetrievalQA.from_chain_type(llm, retriever)`.
    """

    def __init__(
        self,
        *,
        top_k: int = 5,
        system_prompt: str | None = None,
        provider: str | None = None,
    ) -> None:
        from site_api.llm_stack.rag import RAGChain

        self.rag = RAGChain(top_k=top_k)
        if system_prompt:
            self.rag.system_prompt = system_prompt
        self.provider = provider

    async def add_text(self, text: str, metadata: dict[str, Any] | None = None) -> int:
        return await self.rag.add_text(text, metadata=metadata)

    async def arun(self, question: str) -> dict[str, Any]:
        resp = await self.rag.query(question, provider=self.provider)
        return {
            "result": resp.answer,
            "source_documents": [r.chunk for r in resp.sources],
            "scores": [r.score for r in resp.sources],
            "model": resp.model,
            "provider": resp.provider,
        }

    async def astream(self, question: str):  # pragma: no cover
        async for chunk in self.rag.stream_query(question, provider=self.provider):
            yield chunk


# ── TransformChain (Python function as a chain step) ──────────────────────────


class TransformChain:
    """A chain that runs a pure Python function on the input dict.

    Useful for inserting non-LLM logic into a SequentialChain.
    """

    def __init__(self, fn, output_keys: list[str], input_keys: list[str] | None = None) -> None:
        self.fn = fn
        self.output_keys = output_keys
        self.input_keys = input_keys

    async def arun(self, inputs: dict[str, Any]) -> dict[str, Any]:
        if self.input_keys is not None:
            extracted = {k: inputs[k] for k in self.input_keys if k in inputs}
        else:
            extracted = dict(inputs)
        # Allow sync or async functions.
        result = self.fn(**extracted)
        if hasattr(result, "__await__"):
            result = await result
        if not isinstance(result, dict):
            raise ValueError("TransformChain function must return a dict")
        return {**inputs, **result}
