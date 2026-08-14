"""
site_api/llm_stack/rag/document.py — Document and chunk data classes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Document:
    """A document is a piece of source material with metadata.

    Attributes:
        content: The raw text content.
        metadata: Free-form metadata (e.g. source, URL, timestamp).
        doc_id: Unique identifier (auto-generated if missing).
    """

    content: str
    metadata: dict[str, Any] = field(default_factory=dict)
    doc_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_dict(self) -> dict[str, Any]:
        return {"doc_id": self.doc_id, "content": self.content, "metadata": self.metadata}


@dataclass
class Chunk:
    """A chunk is a piece of a document, ready for embedding."""

    content: str
    doc_id: str
    chunk_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    index: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)
    embedding: list[float] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "doc_id": self.doc_id,
            "index": self.index,
            "content": self.content,
            "metadata": self.metadata,
        }
