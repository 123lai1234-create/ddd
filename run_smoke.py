"""Top-level smoke test runner — uses print + sys.exit, no newlines in -c."""
import sys
sys.path.insert(0, ".")

import asyncio
from site_api.llm_stack import (
    list_providers,
    rag_chain,
    registry,
    llm,
    chat,
    stream_chat,
    LLMMessage,
    LLMResponse,
)


async def main():
    print("=" * 60)
    print("LLM Stack Smoke Test")
    print("=" * 60)

    print("\n[1] list_providers():")
    print(list_providers())

    print("\n[2] Hash embedding:")
    from site_api.llm_stack.rag import get_embedding_model
    emb = get_embedding_model()
    v = await emb.embed("hello world")
    print(f"  dim={len(v)}, first 3={v[:3]}")

    print("\n[3] RAG chain:")
    await rag_chain.add_text("ESM-2 is a protein language model from Meta.", metadata={"source": "esm2.txt"})
    await rag_chain.add_text("ProteinMPNN designs protein sequences.", metadata={"source": "mpnn.txt"})
    results = await rag_chain.retriever.retrieve("What is ESM-2?", top_k=2)
    print(f"  retrieved {len(results)} chunks, top score={results[0].score:.3f}")
    for r in results:
        print(f"   - [{r.score:.3f}] {r.chunk.content[:80]}")

    print("\n[4] Tool registry (built-in tools):")
    from site_api.llm_stack.tools.builtin.math_tools import CalculatorTool, CurrentDateTimeTool
    from site_api.llm_stack.tools.builtin.portfolio import PortfolioPagesTool
    registry.register(CalculatorTool())
    registry.register(CurrentDateTimeTool())
    registry.register(PortfolioPagesTool())
    print(f"  registered: {registry.names()}")

    out = await registry.execute("calculator", {"expression": "2 + 3 * 4"})
    print(f"  calculator(2+3*4) = {out!r}")

    pages = await registry.execute("portfolio_pages", {})
    print(f"  portfolio_pages: {len(pages)} chars")

    print("\n[5] LangGraph StateGraph (echo nodes):")
    from site_api.llm_stack.langgraph_layer import GraphState, StateGraph
    g = StateGraph(name="smoke")
    g.add_node("a", lambda s: s.scratch.update({"a_out": "A"}))
    g.add_node("b", lambda s: s.scratch.update({"b_out": s.scratch.get("a_out", "") + "B"}))
    g.add_node("c", lambda s: s.scratch.update({"c_out": s.scratch.get("b_out", "") + "C"}))
    g.add_edge("a", "b")
    g.add_edge("b", "c")
    g.set_entry_point("a")
    g.set_finish_point("c")
    state = GraphState()
    result = await g.arun(state)
    print(f"  result: {result.scratch}")
    assert result.scratch.get("c_out") == "ABC"

    print("\n[6] MCP server:")
    from site_api.llm_stack.mcp import MCPServer, default_toolset
    server = MCPServer(toolset=default_toolset())
    info = await server.handle_request({"method": "initialize", "id": 1, "jsonrpc": "2.0"})
    print(f"  initialize: {info['result']['serverInfo']}")
    tools_resp = await server.handle_request({"method": "tools/list", "id": 2, "jsonrpc": "2.0"})
    print(f"  tools/list: {len(tools_resp['result']['tools'])} tools")
    call_resp = await server.handle_request({
        "method": "tools/call",
        "id": 3,
        "jsonrpc": "2.0",
        "params": {"name": "calculator", "arguments": {"expression": "10 * 10"}},
    })
    print(f"  tools/call calculator: {call_resp['result']}")

    print("\n[7] Module-level chat fn:")
    print("  chat is a coroutine function:", asyncio.iscoroutinefunction(chat))
    print("  stream_chat is async generator:", asyncio.iscoroutinefunction(stream_chat))

    print("\n" + "=" * 60)
    print("ALL SMOKE TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
