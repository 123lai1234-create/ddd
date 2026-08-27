"""
site_api/llm_stack/__routes_rag.py - FastAPI routes for the RAG module.

Path prefix: `/llm/rag`
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from site_api.llm_stack.rag import RAGChain
from site_api.llm_stack.rag.document import Document
from site_api.llm_stack.rag.text_splitter import TextSplitter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/llm/rag", tags=["LLM RAG"])


# ── A dedicated RAG chain (separate from the global singleton) ───────────────

_rag_chain: RAGChain | None = None


def get_rag_chain() -> RAGChain:
    global _rag_chain
    if _rag_chain is None:
        _rag_chain = RAGChain(retriever=None, top_k=5)
    return _rag_chain


# ── Models ────────────────────────────────────────────────────────────────────


class AddTextRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to add to the RAG index")
    source: str | None = Field(default=None, description="Optional source label")
    metadata: dict[str, Any] | None = Field(default=None, description="Optional metadata")


class AddTextResponse(BaseModel):
    chunks_added: int
    total_chunks: int


class IngestRequest(BaseModel):
    texts: list[AddTextRequest] = Field(..., description="List of texts to ingest")
    chunk_size: int | None = Field(default=None, ge=64, le=4000)
    chunk_overlap: int | None = Field(default=None, ge=0, le=2000)


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, description="User question")
    top_k: int | None = Field(default=None, ge=1, le=20)
    provider: str | None = None
    model: str | None = None
    stream: bool = False


class QueryResponse(BaseModel):
    answer: str
    model: str | None = None
    provider: str | None = None
    usage: dict[str, Any] | None = None
    sources: list[dict[str, Any]] = Field(default_factory=list)


class RetrieveRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)


class RetrieveResponse(BaseModel):
    results: list[dict[str, Any]]


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/status")
def rag_status() -> dict[str, Any]:
    """Return the current RAG state and embedding model."""
    chain = get_rag_chain()
    emb = chain.retriever.embedding
    return {
        "embedding_model": emb.name,
        "embedding_dim": emb.dimension,
        "indexed_chunks": len(chain.retriever.store),
        "top_k": chain.top_k,
    }


@router.post("/add", response_model=AddTextResponse)
async def add_text(request: AddTextRequest) -> AddTextResponse:
    """Add a single text to the RAG index."""
    chain = get_rag_chain()
    metadata = {**(request.metadata or {}), "source": request.source} if request.source else (request.metadata or {})
    added = await chain.add_text(request.text, metadata=metadata)
    return AddTextResponse(chunks_added=added, total_chunks=len(chain.retriever.store))


@router.post("/ingest", response_model=AddTextResponse)
async def ingest(request: IngestRequest) -> AddTextResponse:
    """Bulk-ingest a list of texts."""
    if not request.texts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="`texts` must not be empty")
    chain = get_rag_chain()
    if request.chunk_size or request.chunk_overlap:
        chain.retriever.splitter = TextSplitter(
            chunk_size=request.chunk_size or chain.retriever.splitter.chunk_size,
            chunk_overlap=request.chunk_overlap or chain.retriever.splitter.chunk_overlap,
        )
    docs = [
        Document(
            content=t.text,
            metadata={**(t.metadata or {}), "source": t.source} if t.source else (t.metadata or {}),
        )
        for t in request.texts
    ]
    added = await chain.add_documents(docs)
    return AddTextResponse(chunks_added=added, total_chunks=len(chain.retriever.store))


@router.post("/retrieve", response_model=RetrieveResponse)
async def retrieve(request: RetrieveRequest) -> RetrieveResponse:
    """Retrieve the top-K chunks without synthesising an answer."""
    chain = get_rag_chain()
    results = await chain.retriever.retrieve(request.query, top_k=request.top_k)
    return RetrieveResponse(
        results=[
            {
                "chunk_id": r.chunk.chunk_id,
                "doc_id": r.chunk.doc_id,
                "index": r.chunk.index,
                "score": r.score,
                "content": r.chunk.content,
                "metadata": r.chunk.metadata,
            }
            for r in results
        ]
    )


@router.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest) -> QueryResponse:
    """Run a full RAG query (retrieve -> synthesise)."""
    chain = get_rag_chain()
    if request.stream:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use /llm/rag/query/stream for streaming responses.",
        )
    try:
        resp = await chain.query(
            request.question,
            top_k=request.top_k,
            provider=request.provider,
            model=request.model,
        )
        return QueryResponse(
            answer=resp.answer,
            model=resp.model,
            provider=resp.provider,
            usage=resp.usage,
            sources=[
                {"chunk_id": r.chunk.chunk_id, "doc_id": r.chunk.doc_id, "score": r.score, "content": r.chunk.content}
                for r in resp.sources
            ],
        )
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e
    except Exception as e:
        logger.exception("RAG query failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"RAG error: {e}") from e


@router.post("/query/stream")
async def query_stream(request: QueryRequest):
    """Stream a RAG response."""
    chain = get_rag_chain()

    async def event_generator():
        try:
            async for chunk in chain.stream_query(
                request.question,
                top_k=request.top_k,
                provider=request.provider,
                model=request.model,
            ):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("RAG stream failed")
            yield f"data: [ERROR] {e}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
