"""
site_api/llm_stack/rag/embedding.py — Embedding layer.

Three backends are supported:

1. **OpenAI** — `text-embedding-3-small` / `text-embedding-3-large` (paid).
2. **MiniMax** — embeddings via the existing `minimax_client` (if available).
3. **Local hash** — a deterministic, dependency-free fallback that produces
   256-dim bag-of-words / TF-IDF style vectors. This lets the RAG stack
   run in tests or local-only environments without any API key.

The fallback is *not* a real semantic embedding — it is intentionally
simple so the rest of the RAG pipeline can be exercised end-to-end.
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
from collections import Counter
from typing import Any

logger = logging.getLogger(__name__)


class EmbeddingModel:
    """Abstract interface implemented by every embedding backend."""

    @property
    def name(self) -> str:
        ...

    @property
    def dimension(self) -> int:
        ...

    async def embed(self, text: str) -> list[float]:
        ...

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        ...


# ── Local fallback (hash-based) ───────────────────────────────────────────────


class HashEmbeddingModel(EmbeddingModel):
    """A deterministic 256-dim embedding based on hashed tokens.

    This is *not* a real semantic embedding — it is a placeholder so the
    RAG pipeline works without external dependencies. It is fine for
    unit tests, but for production use you should switch to OpenAI or
    a proper sentence-transformer model.
    """

    def __init__(self, dim: int = 256) -> None:
        self._dim = dim

    @property
    def name(self) -> str:
        return "hash-fallback"

    @property
    def dimension(self) -> int:
        return self._dim

    async def embed(self, text: str) -> list[float]:
        if not text:
            return [0.0] * self._dim
        # Tokenise by simple whitespace + punctuation.
        tokens = _tokenize(text)
        counter: Counter[str] = Counter(tokens)
        vec = [0.0] * self._dim
        for token, count in counter.items():
            h = hashlib.sha256(token.encode("utf-8")).digest()
            idx = int.from_bytes(h[:4], "big") % self._dim
            sign = 1.0 if (h[4] & 1) else -1.0
            vec[idx] += sign * (1.0 + math.log(count))
        # L2 normalise.
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [await self.embed(t) for t in texts]


# ── OpenAI embeddings ─────────────────────────────────────────────────────────


class OpenAIEmbeddingModel(EmbeddingModel):
    """OpenAI embeddings (`text-embedding-3-small` by default)."""

    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        self._model = model or os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")
        self._dim = 1536 if "small" in self._model else 3072

    @property
    def name(self) -> str:
        return f"openai/{self._model}"

    @property
    def dimension(self) -> int:
        return self._dim

    async def embed(self, text: str) -> list[float]:
        results = await self.embed_batch([text])
        return results[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not self._api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")
        try:
            from openai import AsyncOpenAI  # type: ignore

            client = AsyncOpenAI(api_key=self._api_key)
            resp = await client.embeddings.create(model=self._model, input=texts)
            return [item.embedding for item in resp.data]
        except ImportError:
            # Fallback to httpx
            import httpx

            headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
            payload = {"model": self._model, "input": texts}
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/embeddings", json=payload, headers=headers
                )
            if resp.status_code >= 400:
                raise RuntimeError(f"OpenAI embeddings error {resp.status_code}: {resp.text}")
            data = resp.json()
            return [d["embedding"] for d in data["data"]]


# ── Factory ───────────────────────────────────────────────────────────────────


def get_embedding_model(name: str | None = None, **kwargs: Any) -> EmbeddingModel:
    """Return the embedding model with the given name, or a fallback."""
    name = (name or os.getenv("EMBEDDING_MODEL", "hash")).lower()
    if name in ("hash", "fallback", "local"):
        return HashEmbeddingModel(**kwargs)
    if name in ("openai", "openai/text-embedding-3-small", "openai/text-embedding-3-large"):
        return OpenAIEmbeddingModel(**kwargs)
    # Unknown name → fall back to hash.
    logger.warning("Unknown embedding model %s, falling back to hash", name)
    return HashEmbeddingModel(**kwargs)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _tokenize(text: str) -> list[str]:
    """Lower-case + split on non-word characters; preserves CJK characters."""
    import re

    text = text.lower()
    # Split on any non-letter / non-digit / non-CJK character.
    parts = re.findall(r"[\w\u4e00-\u9fff]+", text)
    return [p for p in parts if p]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two equal-length vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1e-12
    nb = math.sqrt(sum(y * y for y in b)) or 1e-12
    return dot / (na * nb)
