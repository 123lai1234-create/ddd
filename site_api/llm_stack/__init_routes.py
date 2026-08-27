"""
site_api/llm_stack/__init_routes.py - Aggregate router for the LLM stack.

This module combines all the LLM stack routers (LLM, tools, RAG, MCP,
LangChain, LangGraph) into a single `/llm-stack` APIRouter that can be
mounted in the main FastAPI app.

It also exposes a `mount_llm_stack(app)` convenience function that
attaches the aggregate router directly to the FastAPI application.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, FastAPI

from site_api.llm_stack.__routes_langchain import router as langchain_router
from site_api.llm_stack.__routes_langgraph import router as langgraph_router
from site_api.llm_stack.__routes_llm import router as llm_router
from site_api.llm_stack.__routes_mcp import router as mcp_router
from site_api.llm_stack.__routes_rag import router as rag_router
from site_api.llm_stack.__routes_tools import router as tools_router

logger = logging.getLogger(__name__)


# ── Aggregate router ──────────────────────────────────────────────────────────


def build_router() -> APIRouter:
    """Return a single APIRouter that mounts every LLM stack sub-router.

    The aggregate router is exposed at `/llm-stack` so it doesn't
    collide with the existing `/ai` (`routes_minimax.py`) routes.
    """
    api = APIRouter(prefix="/llm-stack", tags=["LLM Stack"])

    @api.get("/")
    def root() -> dict:
        """Top-level info about the LLM stack."""
        return {
            "module": "site_api.llm_stack",
            "version": "1.0.0",
            "sub_routers": {
                "llm": "/llm-stack/llm",
                "tools": "/llm-stack/tools",
                "rag": "/llm-stack/rag",
                "mcp": "/llm-stack/mcp",
                "langchain": "/llm-stack/lc",
                "langgraph": "/llm-stack/lg",
            },
            "endpoints": [
                "GET  /llm-stack/llm/providers",
                "GET  /llm-stack/llm/status",
                "POST /llm-stack/llm/chat",
                "POST /llm-stack/llm/chat/stream",
                "GET  /llm-stack/llm/provider/{name}",
                "GET  /llm-stack/tools",
                "POST /llm-stack/tools/call",
                "POST /llm-stack/tools/chat",
                "GET  /llm-stack/rag/status",
                "POST /llm-stack/rag/add",
                "POST /llm-stack/rag/ingest",
                "POST /llm-stack/rag/retrieve",
                "POST /llm-stack/rag/query",
                "POST /llm-stack/rag/query/stream",
                "GET  /llm-stack/mcp/info",
                "GET  /llm-stack/mcp/tools",
                "POST /llm-stack/mcp/jsonrpc",
                "POST /llm-stack/mcp/initialize",
                "POST /llm-stack/mcp/tools/call",
                "GET  /llm-stack/lc/status",
                "POST /llm-stack/lc/chain",
                "POST /llm-stack/lc/chain/sequential",
                "POST /llm-stack/lc/agent",
                "POST /llm-stack/lc/retrieval-qa",
                "GET  /llm-stack/lg/templates",
                "GET  /llm-stack/lg/template/{name}",
                "POST /llm-stack/lg/run",
                "POST /llm-stack/lg/run/{template_name}",
            ],
        }

    # Mount all sub-routers. We use a small prefix because the sub-routers
    # already define their own (e.g. `/llm`, `/llm/tools`, `/llm/rag`).
    api.include_router(llm_router, prefix="/llm")
    api.include_router(tools_router, prefix="/llm/tools")
    api.include_router(rag_router, prefix="/llm/rag")
    api.include_router(mcp_router, prefix="/mcp")
    api.include_router(langchain_router, prefix="/lc")
    api.include_router(langgraph_router, prefix="/lg")
    return api


def mount_llm_stack(app: FastAPI) -> None:
    """Attach the LLM stack router to the given FastAPI app."""
    app.include_router(build_router())
    logger.info("Mounted LLM stack at /llm-stack")


__all__ = ["build_router", "mount_llm_stack"]
