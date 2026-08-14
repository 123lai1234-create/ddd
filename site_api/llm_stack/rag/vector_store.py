"""
site_api/llm_stack/rag/vector_store.py — Simple in-memory vector store.

A vector store maps chunk IDs to embeddings and supports top-K similarity
search. We ship a pure-Python implementation (good enough for prototypes
and small to medium corpora) and an optional PostgreSQL-backed
implementation that uses the existing `pgvector` extension when available.
"""

from __future__ import annotations

import logging
import math
from typing import Any

from site_api.llm_stack.rag.document import Chunk
from site_api.llm_stack.rag.embedding import cosine_similarity

logger = logging.getLogger(__name__)


class VectorStore:
    """In-memory vector store with cosine similarity search."""

    def __init__(self) -> None:
        self._chunks: dict[str, Chunk] = {}

    # ── Ingest ───────────────────────────────────────────────────────────────

    def add(self, chunk: Chunk) -> None:
        if chunk.embedding is None:
            raise ValueError("Chunk must have an embedding before adding to the vector store")
        self._chunks[chunk.chunk_id] = chunk

    def add_many(self, chunks: list[Chunk]) -> None:
        for c in chunks:
            self.add(c)

    def clear(self) -> None:
        self._chunks.clear()

    # ── Lookup ───────────────────────────────────────────────────────────────

    def get(self, chunk_id: str) -> Chunk | None:
        return self._chunks.get(chunk_id)

    def __len__(self) -> int:
        return len(self._chunks)

    def items(self) -> list[Chunk]:
        return list(self._chunks.values())

    # ── Search ───────────────────────────────────────────────────────────────

    def search(self, query_embedding: list[float], *, top_k: int = 5) -> list[tuple[Chunk, float]]:
        """Return the top-K chunks ranked by cosine similarity."""
        if not self._chunks:
            return []
        scored: list[tuple[Chunk, float]] = []
        for chunk in self._chunks.values():
            if chunk.embedding is None:
                continue
            sim = cosine_similarity(query_embedding, chunk.embedding)
            scored.append((chunk, sim))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[: max(1, int(top_k))]

    # ── Serialisation ────────────────────────────────────────────────────────

    def to_dict(self) -> dict[str, Any]:
        return {
            "size": len(self._chunks),
            "chunks": [c.to_dict() for c in self._chunks.values()],
        }
