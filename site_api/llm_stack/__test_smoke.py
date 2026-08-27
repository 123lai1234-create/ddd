"""
site_api/llm_stack/__test_smoke.py — Quick smoke test (no API keys required).

Run:
    python -m site_api.llm_stack.__test_smoke
"""

from __future__ import annotations

import asyncio
import json
import sys


async def main() -> int:
    print("=" * 70)
    print("LLM Stack smoke test")
    print("=" * 70)

    # 1. Imports
    print("\n[1/8] Importing llm_stack ...")
    from site_api import llm_stack

    print("  providers:", [p["name"] for p in llm_stack.list_providers()])

    # 2. Hash embedding
    print("\n[2/8] Hash embedding (no API key) ...")
    emb = llm_stack.get_embedding_model()
    v = await emb.embed("hello world")
    assert len(v) == emb.dimension, f"dim mismatch: {len(v)} vs {emb.dimension}"
    print(f"  dimension: {emb.dimension}, L2 norm: {sum(x*x for x in v) ** 0.5:.3f}")

    # 3. RAG chain
    print("\n[3/8] RAG chain (add + retrieve) ...")
    await llm_stack.rag_chain.add_text(
        "ESM-2 is a protein language model from Meta. It is trained on UniRef sequences.",
        metadata={"source": "esm2.txt"},
    )
    await llm_stack.rag_chain.add_text(
        "ProteinMPNN is a graph neural network that designs protein sequences conditioned on a backbone structure.",
        metadata={"source": "mpnn.txt"},
    )
    results = await llm_stack.rag_chain.retriever.retrieve("What is ESM-2?", top_k=2)
    assert results, "retriever returned no results"
    print(f"  retrieved {len(results)} chunks, top score: {results[0].score:.3f}")
    for r in results:
        print(f"  - [{r.score:.3f}] {r.chunk.content[:80]}...")

    # 4. Tool registry
    print("\n[4/8] Tool registry & built-in tools ...")
    from site_api.llm_stack.tools import registry
    from site_api.llm_stack.tools.builtin.math_tools import CalculatorTool
    from site_api.llm_stack.tools.builtin.portfolio import PortfolioPagesTool

    if "calculator" not in registry:
        registry.register(CalculatorTool())
    if "portfolio_pages" not in registry:
        registry.register(PortfolioPagesTool())
    print(f"  registered tools: {registry.names()}")

    out = await registry.execute("calculator", {"expression": "2 + 3 * 4"})
    print(f"  calculator(2+3*4) = {out!r}")
    assert "14" in out, f"unexpected calculator result: {out!r}"

    pages = await registry.execute("portfolio_pages", {})
    pages_data = json.loads(pages)
    print(f"  portfolio_pages returned {len(pages_data)} pages")

    # 5. StateGraph (no LLM needed if we use echo nodes)
    print("\n[5/8] LangGraph StateGraph with echo nodes ...")
    from site_api.llm_stack.langgraph_layer import GraphState, StateGraph

    graph = StateGraph(name="smoke")
    graph.add_node("a", lambda s: s.scratch.update({"a_out": "A"}))
    graph.add_node("b", lambda s: s.scratch.update({"b_out": s.scratch.get("a_out", "") + "B"}))
    graph.add_edge("a", "b")
    graph.set_entry_point("a")
    graph.set_finish_point("b")
    state = GraphState()
    result = await graph.arun(state)
    assert result.done
    assert result.scratch.get("b_out") == "AB", f"got {result.scratch.get('b_out')!r}"
    print(f"  graph produced: {result.scratch}")

    # 6. MCP server
    print("\n[6/8] MCP server (info / tools/list) ...")
    from site_api.llm_stack.mcp import MCPServer, default_toolset

    server = MCPServer(toolset=default_toolset())
    info = server.handle_request({"method": "initialize", "id": 1, "jsonrpc": "2.0"})
    assert info and "result" in info
    print(f"  initialize -> {info['result']['serverInfo']}")
    tools_resp = await server.handle_request({"method": "tools/list", "id": 2, "jsonrpc": "2.0"})
    print(f"  tools/list -> {len(tools_resp['result']['tools'])} tools")

    # 7. Tool call via MCP
    print("\n[7/8] MCP tool call (calculator) ...")
    call_resp = await server.handle_request(
        {
            "method": "tools/call",
            "id": 3,
            "jsonrpc": "2.0",
            "params": {"name": "calculator", "arguments": {"expression": "10 * 10"}},
        }
    )
    print(f"  tools/call -> {call_resp['result']}")

    # 8. Factory
    print("\n[8/8] Provider factory list_providers ...")
    for p in llm_stack.list_providers():
        print(f"  - {p['name']}: configured={p['configured']}, default={p['default_model']}")

    print("\n" + "=" * 70)
    print("All smoke tests passed.")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
