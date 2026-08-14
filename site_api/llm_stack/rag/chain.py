"""
site_api/llm_stack/rag/chain.py — RAG chain.

A RAG chain glues together the retriever and an LLM provider. The
standard pattern is:

    1. Embed the user query.
    2. Retrieve the top-K chunks from the vector store.
    3. Build a prompt that includes the chunks as context.
    4. Call the LLM to synthesise the answer.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from site_api.llm_stack.providers.factory import get_configured_provider
from site_api.llm_stack.rag.retriever import RetrievalResult, Retriever
from site_api.llm_stack.types import LLMMessage, LLMResponse

logger = logging.getLogger(__name__)


DEFAULT_SYSTEM_PROMPT = """You are a knowledgeable assistant.
Use the provided context to answer the user's question.
If the context does not contain the answer, say you don't know rather than inventing.
Always cite the chunk index in square brackets, e.g. [1], [2]."""


@dataclass
class RAGResponse:
    """A RAG response: the LLM answer + the retrieved chunks."""

    answer: str
    sources: list[RetrievalResult] = field(default_factory=list)
    usage: dict[str, Any] | None = None
    model: str | None = None
    provider: str | None = None
    raw: LLMResponse | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "answer": self.answer,
            "model": self.model,
            "provider": self.provider,
            "usage": self.usage,
            "sources": [
                {"chunk_id": r.chunk.chunk_id, "doc_id": r.chunk.doc_id, "score": r.score, "content": r.chunk.content}
                for r in self.sources
            ],
        }


class RAGChain:
    """A retrieval-augmented generation chain."""

    def __init__(
        self,
        retriever: Retriever | None = None,
        *,
        system_prompt: str = DEFAULT_SYSTEM_PROMPT,
        top_k: int = 5,
    ) -> None:
        self.retriever = retriever or Retriever()
        self.system_prompt = system_prompt
        self.top_k = top_k

    # ── Ingest ───────────────────────────────────────────────────────────────

    async def add_text(self, text: str, metadata: dict[str, Any] | None = None) -> int:
        return await self.retriever.add_text(text, metadata=metadata)

    async def add_documents(self, documents: list[Any]) -> int:
        return await self.retriever.add_documents(documents)

    # ── Query ────────────────────────────────────────────────────────────────

    async def query(self, question: str, *, top_k: int | None = None, **kwargs: Any) -> RAGResponse:
        """Run a full RAG query: retrieve → build prompt → call LLM."""
        from site_api.llm_stack.unified_client import llm

        k = top_k or self.top_k
        results = await self.retriever.retrieve(question, top_k=k)
        if not results:
            # No context — fall back to plain chat.
            resp = await llm.chat(question, **kwargs)
            return RAGResponse(answer=resp.content, usage=resp.usage, model=resp.model, provider=resp.provider, raw=resp)

        context = self._format_context(results)
        messages = self._build_messages(question, context)
        resp = await llm.chat(messages, **kwargs)
        return RAGResponse(
            answer=resp.content,
            sources=results,
            usage=resp.usage,
            model=resp.model,
            provider=resp.provider,
            raw=resp,
        )

    async def stream_query(self, question: str, *, top_k: int | None = None, **kwargs: Any):
        """Stream a RAG response: yields text chunks."""
        from site_api.llm_stack.unified_client import llm

        k = top_k or self.top_k
        results = await self.retriever.retrieve(question, top_k=k)
        if not results:
            async for chunk in llm.stream_chat(question, **kwargs):
                yield chunk
            return
        context = self._format_context(results)
        messages = self._build_messages(question, context)
        async for chunk in llm.stream_chat(messages, **kwargs):
            yield chunk

    # ── Internals ────────────────────────────────────────────────────────────

    def _format_context(self, results: list[RetrievalResult]) -> str:
        blocks: list[str] = []
        for i, r in enumerate(results, 1):
            tag = r.chunk.metadata.get("source", r.chunk.doc_id)
            blocks.append(f"[{i}] (source: {tag}, score: {r.score:.3f})\n{r.chunk.content}")
        return "\n\n".join(blocks)

    def _build_messages(self, question: str, context: str) -> list[LLMMessage]:
        user_prompt = f"Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"
        return [
            LLMMessage.system(self.system_prompt),
            LLMMessage.user(user_prompt),
        ]


# ── Module-level singleton ────────────────────────────────────────────────────

rag_chain = RAGChain()
