"""
site_api/llm_stack — Unified LLM Integration Stack.

This package provides a unified interface for:
- Multiple LLM providers (OpenAI, Anthropic Claude, Google Gemini, MiniMax)
- Model Context Protocol (MCP) server and tools
- Tool calling framework
- Retrieval-Augmented Generation (RAG)
- LangChain chains and agents
- LangGraph workflows

All modules are designed to be optionally-enabled — if a dependency is missing,
the relevant module falls back to a no-op / stub implementation so the rest
of the application remains operational.
"""

from __future__ import annotations

# Re-export the most common entry points so callers can simply do:
#   from site_api.llm_stack import llm, tool_registry, rag_chain, mcp_server
from site_api.llm_stack.unified_client import (
    UnifiedLLMClient,
    llm,
    chat,
    stream_chat,
    LLMResponse,
    LLMMessage,
)
from site_api.llm_stack.providers.factory import (
    get_provider,
    get_configured_provider,
    list_providers,
    register_provider,
)
from site_api.llm_stack.providers.base import BaseLLMProvider as LLMProvider

# Tool calling
from site_api.llm_stack.tools import (
    Tool,
    FunctionTool,
    ToolResult,
    ToolRegistry,
    registry,
    tool,
)

# RAG
from site_api.llm_stack.rag import (
    Document,
    Chunk,
    EmbeddingModel,
    HashEmbeddingModel,
    OpenAIEmbeddingModel,
    Retriever,
    RAGChain,
    RAGResponse,
    rag_chain,
    VectorStore,
    TextSplitter,
    get_embedding_model,
)

# MCP
from site_api.llm_stack.mcp import (
    MCPServer,
    MCPTool,
    MCPToolset,
    default_toolset,
)

# LangChain-style
from site_api.llm_stack.langchain_layer import (
    LLMChain,
    SequentialChain,
    RetrievalQA,
    TransformChain,
    ReActAgent,
    AgentResult,
    run_agent,
)

# LangGraph-style
from site_api.llm_stack.langgraph_layer import (
    GraphState,
    StateGraph,
    llm_node,
    rag_node,
    tool_node,
)

__all__ = [
    # Core
    "UnifiedLLMClient",
    "llm",
    "chat",
    "stream_chat",
    "LLMResponse",
    "LLMMessage",
    "LLMProvider",
    "get_provider",
    "get_configured_provider",
    "register_provider",
    "list_providers",
    # Tools
    "Tool",
    "FunctionTool",
    "ToolResult",
    "ToolRegistry",
    "registry",
    "tool",
    # RAG
    "Document",
    "Chunk",
    "EmbeddingModel",
    "HashEmbeddingModel",
    "OpenAIEmbeddingModel",
    "Retriever",
    "RAGChain",
    "RAGResponse",
    "rag_chain",
    "VectorStore",
    "TextSplitter",
    "get_embedding_model",
    # MCP
    "MCPServer",
    "MCPTool",
    "MCPToolset",
    "default_toolset",
    # LangChain
    "LLMChain",
    "SequentialChain",
    "RetrievalQA",
    "TransformChain",
    "ReActAgent",
    "AgentResult",
    "run_agent",
    # LangGraph
    "GraphState",
    "StateGraph",
    "llm_node",
    "rag_node",
    "tool_node",
]

__version__ = "1.0.0"
