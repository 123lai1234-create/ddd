"""
site_api/llm_stack/rag/__init__.py — RAG module exports.
"""

from __future__ import annotations

from site_api.llm_stack.rag.chain import RAGChain, RAGResponse, rag_chain
from site_api.llm_stack.rag.document import Chunk, Document
from site_api.llm_stack.rag.embedding import (
    EmbeddingModel,
    HashEmbeddingModel,
    OpenAIEmbeddingModel,
    cosine_similarity,
    get_embedding_model,
)
from site_api.llm_stack.rag.retriever import Retriever, RetrievalResult
from site_api.llm_stack.rag.text_splitter import TextSplitter, split_into_sentences
from site_api.llm_stack.rag.vector_store import VectorStore

__all__ = [
    "Document",
    "Chunk",
    "EmbeddingModel",
    "HashEmbeddingModel",
    "OpenAIEmbeddingModel",
    "get_embedding_model",
    "cosine_similarity",
    "TextSplitter",
    "split_into_sentences",
    "VectorStore",
    "Retriever",
    "RetrievalResult",
    "RAGChain",
    "RAGResponse",
    "rag_chain",
]
