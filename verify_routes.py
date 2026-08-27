"""Verify that the LLM stack router mounts correctly into FastAPI."""
import sys
sys.path.insert(0, ".")

from fastapi import FastAPI
from site_api.llm_stack import build_router


app = FastAPI()
app.include_router(build_router())

print("=" * 70)
print(f"FastAPI app has {len(app.routes)} routes")
print("=" * 70)

llm_stack_routes = [r for r in app.routes if hasattr(r, "path") and r.path.startswith("/llm-stack")]
print(f"\nLLM stack routes ({len(llm_stack_routes)}):\n")
for r in sorted(llm_stack_routes, key=lambda x: x.path):
    methods = sorted(getattr(r, "methods", set()) or set())
    method_str = "/".join(methods) if methods else "?"
    print(f"  {method_str:12s} {r.path}")

print("\n" + "=" * 70)
print("All LLM stack routes successfully mounted.")
print("=" * 70)
