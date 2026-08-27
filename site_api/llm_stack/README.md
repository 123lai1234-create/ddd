# LLM Stack — Unified LLM Integration for the JT Lai Portfolio

`site_api/llm_stack/` is a self-contained module that exposes a unified
interface for five closely related capabilities:

| Capability | Sub-package | Notes |
|------------|-------------|-------|
| **LLM providers** | `providers/` | OpenAI, Anthropic (Claude), Google Gemini, MiniMax |
| **Tool Calling** | `tools/` | Pluggable tool registry with built-in tools |
| **RAG** | `rag/` | Chunking + embedding + in-memory vector store + retriever |
| **MCP** | `mcp/` | JSON-RPC 2.0 Model Context Protocol server (stdio & HTTP) |
| **LangChain** | `langchain_layer/` | `LLMChain`, `SequentialChain`, `RetrievalQA`, `ReActAgent` |
| **LangGraph** | `langgraph_layer/` | Typed state graph with conditional edges |

All modules are designed to **gracefully fall back** when their underlying
SDK is missing — for example, the Gemini provider works without
`google-generativeai` installed by falling back to direct HTTP calls.

The whole stack is exposed via FastAPI under `/llm-stack/...` so it
sits alongside the existing `/ai` (MiniMax) routes.

---

## 1. Quick Start

```python
# Programmatic use
from site_api.llm_stack import llm, chat, stream_chat, rag_chain, registry, default_toolset

# 1. Plain chat (auto-selects the first configured provider)
resp = await chat("Translate to Mandarin: 'Hello, world!'")

# 2. Force a specific provider
resp = await chat("Summarise protein folding", provider="openai", model="gpt-4o-mini")

# 3. Streaming
async for chunk in stream_chat("Write a haiku about RNA"):
    print(chunk, end="")

# 4. RAG
await rag_chain.add_text("ESM-2 is a protein language model from Meta ...")
answer = await rag_chain.query("What is ESM-2?")
```

### Tool calling

```python
from site_api.llm_stack import llm, registry
from site_api.llm_stack.tools.builtin.portfolio import PortfolioPagesTool

registry.register(PortfolioPagesTool())
resp = await llm.chat_with_tool_loop(
    [LLMMessage.user("List the portfolio pages")],
    tools=registry.definitions(),
    tool_executor=registry,
)
```

### MCP server

```bash
# 1. Run as a stdio MCP server (for Claude Desktop / Cursor)
python -m site_api.llm_stack.mcp.server

# 2. Or expose via HTTP — already mounted at /llm-stack/mcp in the FastAPI app
curl http://localhost:8000/llm-stack/mcp/info
curl -X POST http://localhost:8000/llm-stack/mcp/jsonrpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### LangGraph-style workflow

```python
from site_api.llm_stack.langgraph_layer import StateGraph, GraphState, llm_node, rag_node

graph = StateGraph()
graph.add_node("retrieve", ...)
graph.add_node("summarise", ...)
graph.add_edge("retrieve", "summarise")
graph.set_entry_point("retrieve")
graph.set_finish_point("summarise")

state = GraphState()
state.scratch["question"] = "What is ESM-2?"
state.scratch["summarise_prompt"] = "Summarise: {answer}"
result = await graph.arun(state)
```

---

## 2. Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `OPENAI_API_KEY` | OpenAI chat / embeddings | — |
| `OPENAI_API_BASE` | Override OpenAI base URL | `https://api.openai.com/v1` |
| `OPENAI_DEFAULT_MODEL` | Default chat model | `gpt-4o-mini` |
| `OPENAI_EMBEDDING_MODEL` | Default embedding model | `text-embedding-3-small` |
| `ANTHROPIC_API_KEY` | Anthropic Claude | — |
| `ANTHROPIC_API_BASE` | Override Anthropic base URL | `https://api.anthropic.com/v1` |
| `ANTHROPIC_API_VERSION` | API version header | `2023-06-01` |
| `ANTHROPIC_DEFAULT_MODEL` | Default chat model | `claude-3-5-sonnet-20241022` |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Google Gemini | — |
| `GEMINI_API_BASE` | Override Gemini base URL | `https://generativelanguage.googleapis.com/v1beta` |
| `GEMINI_DEFAULT_MODEL` | Default chat model | `gemini-1.5-flash` |
| `MINIMAX_API_KEY` | MiniMax (existing) | — |
| `MINIMAX_API_BASE` | MiniMax base URL | `https://api.minimaxi.com/v1` |
| `LITELLM_PROXY_URL` | If set, route MiniMax through LiteLLM | — |
| `MINIMAX_DEFAULT_MODEL` | Default MiniMax model | `MiniMax-M2` |
| `LLM_PROVIDER` | Force a specific provider | auto-detect |
| `EMBEDDING_MODEL` | `hash` or `openai` | `hash` |

---

## 3. HTTP Endpoints (FastAPI)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/llm-stack/` | Stack info |
| GET | `/llm-stack/llm/providers` | List providers & config status |
| GET | `/llm-stack/llm/status` | Active provider |
| POST | `/llm-stack/llm/chat` | Chat completion |
| POST | `/llm-stack/llm/chat/stream` | Streaming (SSE) |
| GET | `/llm-stack/llm/provider/{name}` | Provider info |
| GET | `/llm-stack/tools` | List tools |
| POST | `/llm-stack/tools/call` | Execute a single tool |
| POST | `/llm-stack/tools/chat` | Tool-calling loop |
| GET | `/llm-stack/rag/status` | RAG state |
| POST | `/llm-stack/rag/add` | Add a single text |
| POST | `/llm-stack/rag/ingest` | Bulk ingest |
| POST | `/llm-stack/rag/retrieve` | Retrieve top-K chunks |
| POST | `/llm-stack/rag/query` | RAG query |
| POST | `/llm-stack/rag/query/stream` | Streaming RAG |
| GET | `/llm-stack/mcp/info` | MCP server info |
| GET | `/llm-stack/mcp/tools` | List MCP tools |
| POST | `/llm-stack/mcp/jsonrpc` | Generic JSON-RPC 2.0 |
| POST | `/llm-stack/mcp/initialize` | MCP initialize |
| POST | `/llm-stack/mcp/tools/call` | Call an MCP tool |
| GET | `/llm-stack/lc/status` | LangChain status |
| POST | `/llm-stack/lc/chain` | Run LLMChain |
| POST | `/llm-stack/lc/chain/sequential` | SequentialChain |
| POST | `/llm-stack/lc/agent` | ReActAgent |
| POST | `/llm-stack/lc/retrieval-qa` | RetrievalQA |
| GET | `/llm-stack/lg/templates` | List workflow templates |
| GET | `/llm-stack/lg/template/{name}` | Get a template |
| POST | `/llm-stack/lg/run` | Run a graph spec |
| POST | `/llm-stack/lg/run/{template_name}` | Run a template |

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  site_api.llm_stack (Unified Facade)                                    │
│                                                                         │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌──────────┐  │
│  │   OpenAI      │  │   Anthropic   │  │   Gemini      │  │ MiniMax  │  │
│  │   Provider    │  │   Provider    │  │   Provider    │  │ Provider │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └──────────┘  │
│         │                  │                  │                │         │
│         └──────────┬───────┴──────────┬───────┴────────┬───────┘         │
│                    ▼                  ▼                ▼                 │
│              ┌─────────────────────────────────────────────┐             │
│              │  UnifiedLLMClient (provider / model picker) │             │
│              └─────────────────────────────────────────────┘             │
│                                    │                                    │
│            ┌────────────────┬──────┴──────┬─────────────────┐            │
│            ▼                ▼             ▼                 ▼            │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐    │
│  │ Tool Registry │  │  RAG Chain   │  │  MCP Server  │  │ Lang-    │    │
│  │ (built-in +   │  │ (chunk / embed│  │ (JSON-RPC 2.0)│  │ Chain /  │    │
│  │  custom)      │  │  / retrieve)  │  │              │  │ LangGraph│    │
│  └───────────────┘  └──────────────┘  └──────────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        FastAPI Router (/llm-stack/...)
```

---

## 5. Adding Custom Tools

```python
from site_api.llm_stack.tools import registry, FunctionTool

async def fetch_weather(city: str) -> str:
    # ... call your weather API ...
    return f"It's 25°C in {city}"

registry.register(FunctionTool(
    name="fetch_weather",
    description="Get the current weather for a city.",
    fn=fetch_weather,
))
```

Or wrap an existing `Tool` subclass:

```python
from site_api.llm_stack.tools.base import Tool, ToolResult

class MyTool(Tool):
    @property
    def name(self) -> str: return "my_tool"
    @property
    def description(self) -> str: return "Does something useful."
    async def run(self, **kwargs) -> ToolResult:
        return ToolResult(success=True, content="done")

registry.register(MyTool())
```

---

## 6. Adding Custom LLM Providers

```python
from site_api.llm_stack.providers.factory import register_provider
from site_api.llm_stack.providers.base import BaseLLMProvider

class MyProvider(BaseLLMProvider):
    name = "myprovider"
    def _default_model(self): return "my-model"
    def is_configured(self): return True
    async def chat(self, messages, *, model=None, **kwargs):
        from site_api.llm_stack.types import LLMResponse
        return LLMResponse(content="hi", model=model or self.default_model, provider=self.name)
    async def stream_chat(self, messages, *, model=None, **kwargs):
        yield "hi"

register_provider("myprovider", MyProvider)
```

---

## 7. Testing

```bash
# Smoke test (no LLM keys required)
python -c "from site_api import llm_stack; print(llm_stack.list_providers())"

# Run the MCP server on stdio
python -m site_api.llm_stack.mcp.server
```

The hash-based embedding fallback lets the RAG pipeline run end-to-end
without any API key (useful for unit tests and CI).
