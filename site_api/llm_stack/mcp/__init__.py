"""
site_api/llm_stack/mcp/__init__.py — MCP server / client exports.
"""

from __future__ import annotations

from site_api.llm_stack.mcp.server import MCPServer, main as mcp_main
from site_api.llm_stack.mcp.tools import (
    MCPTool,
    MCPToolset,
    default_toolset,
    function_to_mcp,
    tool_to_mcp,
)

__all__ = [
    "MCPServer",
    "MCPTool",
    "MCPToolset",
    "default_toolset",
    "tool_to_mcp",
    "function_to_mcp",
    "mcp_main",
]
