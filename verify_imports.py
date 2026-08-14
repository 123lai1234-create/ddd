"""Verify all llm_stack modules can be imported without FastAPI."""
import sys
import importlib
sys.path.insert(0, ".")

modules = [
    "site_api.llm_stack",
    "site_api.llm_stack.types",
    "site_api.llm_stack.providers",
    "site_api.llm_stack.providers.base",
    "site_api.llm_stack.providers.factory",
    "site_api.llm_stack.providers.openai_provider",
    "site_api.llm_stack.providers.anthropic_provider",
    "site_api.llm_stack.providers.gemini_provider",
    "site_api.llm_stack.providers.minimax_provider",
    "site_api.llm_stack.unified_client",
    "site_api.llm_stack.tools",
    "site_api.llm_stack.tools.base",
    "site_api.llm_stack.tools.registry",
    "site_api.llm_stack.tools.builtin",
    "site_api.llm_stack.tools.builtin.portfolio",
    "site_api.llm_stack.tools.builtin.web",
    "site_api.llm_stack.tools.builtin.knowledge",
    "site_api.llm_stack.tools.builtin.math_tools",
    "site_api.llm_stack.rag",
    "site_api.llm_stack.rag.document",
    "site_api.llm_stack.rag.text_splitter",
    "site_api.llm_stack.rag.embedding",
    "site_api.llm_stack.rag.vector_store",
    "site_api.llm_stack.rag.retriever",
    "site_api.llm_stack.rag.chain",
    "site_api.llm_stack.mcp",
    "site_api.llm_stack.mcp.tools",
    "site_api.llm_stack.mcp.server",
    "site_api.llm_stack.langchain_layer",
    "site_api.llm_stack.langchain_layer.chains",
    "site_api.llm_stack.langchain_layer.agents",
    "site_api.llm_stack.langgraph_layer",
    "site_api.llm_stack.langgraph_layer.state",
    "site_api.llm_stack.langgraph_layer.workflows",
]

print("=" * 70)
print("LLM Stack module import verification")
print("=" * 70)

errors = []
for m in modules:
    try:
        importlib.import_module(m)
        print(f"  [OK]   {m}")
    except Exception as e:
        print(f"  [FAIL] {m}: {e}")
        errors.append((m, e))

print()
print("=" * 70)
print(f"Total: {len(modules)} modules, {len(errors)} errors")
print("=" * 70)

if errors:
    print("\nFailures:")
    for m, e in errors:
        print(f"  - {m}: {type(e).__name__}: {e}")
    sys.exit(1)
else:
    print("\nAll LLM stack modules imported successfully.")
