"""
site_api/llm_stack/rag/retriever.py — Retriever + ingest pipeline.

The retriever combines an embedding model with a vector store. It
exposes a single `retrieve(query, top_k)` method that returns the
top-K chunks most relevant to the query.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from site_api.llm_stack.rag.document import Chunk, Document
from site_api.llm_stack.rag.embedding import EmbeddingModel, get_embedding_model
from site_api.llm_stack.rag.text_splitter import TextSplitter
from site_api.llm_stack.rag.vector_store import VectorStore

logger = logging.getLogger(__name__)


@dataclass
class RetrievalResult:
    """A single retrieval result (chunk + similarity)."""

    chunk: Chunk
    score: float


class Retriever:
    """A retriever that scores chunks against a query embedding."""

    def __init__(
        self,
        embedding_model: EmbeddingModel | None = None,
        vector_store: VectorStore | None = None,
        splitter: TextSplitter | None = None,
    ) -> None:
        self.embedding = embedding_model or get_embedding_model()
        self.store = vector_store or VectorStore()
        self.splitter = splitter or TextSplitter()

    # ── Ingest ───────────────────────────────────────────────────────────────

    async def add_documents(self, documents: list[Document]) -> int:
        """Chunk, embed, and store the given documents. Returns the number of chunks added."""
        chunks: list[Chunk] = []
        for doc in documents:
            for idx, text in enumerate(self.splitter.split(doc.content)):
                chunks.append(
                    Chunk(
                        content=text,
                        doc_id=doc.doc_id,
                        index=idx,
                        metadata={**doc.metadata, "doc_id": doc.doc_id},
                    )
                )
        if not chunks:
            return 0
        # Embed in one batch.
        vectors = await self.embedding.embed_batch([c.content for c in chunks])
        for c, v in zip(chunks, vectors):
            c.embedding = v
        self.store.add_many(chunks)
        return len(chunks)

    async def add_text(self, text: str, metadata: dict[str, Any] | None = None) -> int:
        return await self.add_documents([Document(content=text, metadata=metadata or {})])

    # ── Search ───────────────────────────────────────────────────────────────

    async def retrieve(self, query: str, *, top_k: int = 5) -> list[RetrievalResult]:
        vec = await self.embedding.embed(query)
        scored = self.store.search(vec, top_k=top_k)
        return [RetrievalResult(chunk=c, score=s) for c, s in scored]

    async def retrieve_with_context(
        self, query: str, *, top_k: int = 5, max_chars: int = 4000
    ) -> list[RetrievalResult]:
        """Retrieve and concatenate adjacent chunks from the same document."""
        results = await self.retrieve(query, top_k=top_k)
        # Group by doc_id, then by chunk index; concatenate in order.
        seen: dict[str, list[Chunk]] = {}
        for r in results:
            seen.setdefault(r.chunk.doc_id, []).append(r.chunk)
        merged: list[RetrievalResult] = []
        for doc_id, chunks in seen.items():
            chunks.sort(key=lambda c: c.index)
            combined = "\n\n".join(c.content for c in chunks)
            if len(combined) > max_chars:
                combined = combined[: max_chars] + "\n\n[truncated]"
            merged.append(
                RetrievalResult(
                    chunk=Chunk(
                        content=combined,
                        doc_id=doc_id,
                        metadata={"merged": len(chunks)},
                    ),
                    score=results[0].score if results else 0.0,
                )
            )
        return merged
