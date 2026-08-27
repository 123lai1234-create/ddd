"""
site_api/llm_stack/rag/text_splitter.py — Text chunking utilities.

We implement a simple recursive character splitter that mirrors the
behaviour of LangChain's `RecursiveCharacterTextSplitter` without
taking a dependency on langchain.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class TextSplitter:
    """Recursive character text splitter.

    Attributes:
        chunk_size: Target chunk size in characters.
        chunk_overlap: Number of characters to overlap between chunks.
        separators: Ordered list of separators to use.
    """

    chunk_size: int = 800
    chunk_overlap: int = 120
    separators: tuple[str, ...] = ("\n\n", "\n", "。", "！", "？", ". ", "? ", "! ", " ", "")

    def split(self, text: str) -> list[str]:
        """Split the text into chunks."""
        text = (text or "").strip()
        if not text:
            return []
        if len(text) <= self.chunk_size:
            return [text]
        return self._split_recursive(text, self.separators)

    def _split_recursive(self, text: str, separators: tuple[str, ...]) -> list[str]:
        if not separators:
            # Fall back to hard-coded chunks.
            return self._hard_chunk(text)
        sep = separators[0]
        rest = separators[1:]
        if sep == "":
            return self._hard_chunk(text)
        parts = text.split(sep)
        chunks: list[str] = []
        for part in parts:
            part = (part + sep) if part != parts[-1] else part
            if len(part) <= self.chunk_size:
                chunks.append(part)
            else:
                chunks.extend(self._split_recursive(part, rest))
        # Merge small adjacent chunks and apply overlap.
        merged = self._merge_with_overlap(chunks)
        return [c for c in merged if c.strip()]

    def _hard_chunk(self, text: str) -> list[str]:
        return [text[i : i + self.chunk_size] for i in range(0, len(text), self.chunk_size)]

    def _merge_with_overlap(self, chunks: list[str]) -> list[str]:
        merged: list[str] = []
        for chunk in chunks:
            if not merged:
                merged.append(chunk)
                continue
            prev = merged[-1]
            if len(prev) + len(chunk) <= self.chunk_size:
                merged[-1] = prev + chunk
            else:
                # Apply overlap from the previous chunk.
                overlap = prev[-self.chunk_overlap :] if self.chunk_overlap > 0 else ""
                merged.append(overlap + chunk)
        return merged


def split_into_sentences(text: str) -> list[str]:
    """Crude sentence splitter (English + 中文 punctuation)."""
    if not text:
        return []
    parts = re.split(r"(?<=[.!?。！？])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]
