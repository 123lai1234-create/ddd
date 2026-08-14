"""
site_api/llm_stack/__routes_mcp.py - FastAPI routes for the MCP server.

Path prefix: `/mcp`

Exposes the MCP server as JSON-RPC 2.0 over HTTP. Clients (Claude
Desktop, Cursor, custom clients) can POST a JSON-RPC request to
`/mcp/jsonrpc` and receive a JSON-RPC response.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from site_api.llm_stack.mcp.server import MCPServer, PROTOCOL_VERSION

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mcp", tags=["MCP"])


# ── Server singleton ──────────────────────────────────────────────────────────


def get_mcp_server() -> MCPServer:
    return MCPServer()


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/info")
def mcp_info() -> dict[str, Any]:
    """Return the server's MCP info (protocol version, name, capabilities)."""
    server = get_mcp_server()
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "serverInfo": server.server_info(),
        "capabilities": server.capabilities(),
        "toolCount": len(server.toolset),
    }


@router.get("/tools")
def list_mcp_tools() -> dict[str, Any]:
    """List all MCP tools exposed by this server."""
    server = get_mcp_server()
    return {
        "count": len(server.toolset),
        "tools": server.toolset.list(),
    }


@router.post("/jsonrpc")
async def jsonrpc_endpoint(request: Request) -> dict[str, Any]:
    """Generic JSON-RPC 2.0 endpoint - accepts any single request."""
    try:
        body = await request.json()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON: {e}") from e

    server = get_mcp_server()
    response = await server.handle_request(body)
    if response is None:
        # Notification - return 204 No Content semantics.
        return {"status": "accepted"}
    return response


@router.post("/initialize")
async def initialize_endpoint() -> dict[str, Any]:
    """Convenience wrapper for the MCP `initialize` method."""
    server = get_mcp_server()
    init = {
        "method": "initialize",
        "params": {},
        "id": 0,
        "jsonrpc": "2.0",
    }
    response = await server.handle_request(init)
    return response or {"status": "accepted"}


@router.post("/tools/call")
async def call_tool(name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
    """Call an MCP tool by name."""
    server = get_mcp_server()
    result = await server.toolset.call(name, arguments or {})
    return {"name": name, "result": result}
