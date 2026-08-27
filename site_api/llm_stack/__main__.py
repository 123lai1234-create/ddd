"""
site_api/llm_stack/__main__.py — CLI entry point: `python -m site_api.llm_stack <command>`

Commands:
    serve      Start the MCP server on stdio (alias for `mcp.server`).
    smoke      Run the smoke test (no API keys required).
    providers  List all LLM providers and their configuration status.
"""

from __future__ import annotations

import argparse
import asyncio
import sys


def cmd_serve() -> None:
    from site_api.llm_stack.mcp.server import main as mcp_main

    mcp_main()


def cmd_smoke() -> None:
    from site_api.llm_stack.__test_smoke import main as smoke_main

    sys.exit(asyncio.run(smoke_main()))


def cmd_providers() -> None:
    from site_api.llm_stack import list_providers

    for p in list_providers():
        print(f"  {p['name']:12s} configured={p['configured']!s:5s} default={p['default_model']}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m site_api.llm_stack")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("serve", help="Run the MCP server on stdio").set_defaults(func=cmd_serve)
    sub.add_parser("smoke", help="Run the smoke test").set_defaults(func=cmd_smoke)
    sub.add_parser("providers", help="List LLM providers").set_defaults(func=cmd_providers)
    args = parser.parse_args()
    args.func()


if __name__ == "__main__":
    main()
