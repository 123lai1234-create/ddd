"""
site_api/llm_stack/mcp/server.py — Model Context Protocol (MCP) server.

Implements the JSON-RPC 2.0 protocol used by MCP for tool discovery and
invocation. The server can be exposed:

1. **Stdio** — for direct integration with Claude Desktop / Cursor /
   other MCP clients that spawn the server as a subprocess.
2. **HTTP+SSE** — for use over the network (Streamable HTTP transport).
3. **Internal FastAPI** — see `mcp_routes.py` for the FastAPI router.

The implementation follows the MCP spec (2025-03-26):
- `initialize` → returns server info & capabilities
- `tools/list` → returns the available tool descriptors
- `tools/call` → invokes a tool and returns the result
- `ping` → health check
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from dataclasses import dataclass, field
from typing import Any

from site_api.llm_stack.mcp.tools import MCPToolset, default_toolset

logger = logging.getLogger(__name__)


# ── Server info ───────────────────────────────────────────────────────────────


PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "jt-lai-portfolio-mcp"
SERVER_VERSION = "1.0.0"


@dataclass
class MCPServer:
    """A Model Context Protocol server.

    Args:
        toolset: Tool collection to expose.
        name: Server name (used in `initialize`).
        version: Server version.
    """

    toolset: MCPToolset = field(default_factory=default_toolset)
    name: str = SERVER_NAME
    version: str = SERVER_VERSION

    # ── Capabilities ─────────────────────────────────────────────────────────

    def capabilities(self) -> dict[str, Any]:
        return {"tools": {"listChanged": False}}

    def server_info(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "version": self.version,
            "protocolVersion": PROTOCOL_VERSION,
        }

    # ── JSON-RPC dispatch ────────────────────────────────────────────────────

    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any] | None:
        """Dispatch a JSON-RPC 2.0 request and return the response dict.

        Returns `None` for notifications (no `id` field).
        """
        method = request.get("method")
        params = request.get("params") or {}
        req_id = request.get("id")

        if method == "initialize":
            return self._ok(req_id, self._initialize(params))
        if method == "tools/list":
            return self._ok(req_id, {"tools": self.toolset.list()})
        if method == "tools/call":
            return await self._call_tool(req_id, params)
        if method == "ping":
            return self._ok(req_id, {"pong": True})
        if method == "notifications/initialized":
            return None  # notification, no response
        return self._error(req_id, -32601, f"Method not found: {method}")

    def _initialize(self, params: dict[str, Any]) -> dict[str, Any]:
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": self.capabilities(),
            "serverInfo": self.server_info(),
        }

    async def _call_tool(self, req_id: Any, params: dict[str, Any]) -> dict[str, Any]:
        name = params.get("name", "")
        arguments = params.get("arguments") or {}
        logger.info("MCP tool call: %s args=%s", name, list(arguments.keys()))
        result = await self.toolset.call(name, arguments)
        # The toolset may return: a `ToolResult` instance, a string, a dict,
        # or any python object. Convert to a JSON-safe string for MCP.
        if hasattr(result, "to_message"):
            text = result.to_message()
            is_error = bool(getattr(result, "error", None))
        elif isinstance(result, dict) and "error" in result:
            text = json.dumps(result, ensure_ascii=False, default=str)
            is_error = True
        elif isinstance(result, str):
            text = result
            is_error = False
        else:
            try:
                text = json.dumps(result, ensure_ascii=False, default=str)
            except Exception:
                text = str(result)
            is_error = False
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "content": [{"type": "text", "text": text}],
                "isError": is_error,
            },
        }

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _ok(req_id: Any, result: Any) -> dict[str, Any]:
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    @staticmethod
    def _error(req_id: Any, code: int, message: str) -> dict[str, Any]:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": code, "message": message},
        }

    # ── Stdio transport ──────────────────────────────────────────────────────

    async def run_stdio(self) -> None:
        """Run the server over stdio (JSON-RPC, one message per line)."""
        loop = asyncio.get_event_loop()
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await loop.connect_read_pipe(lambda: protocol, sys.stdin)

        writer_transport, writer_protocol = await loop.connect_write_pipe(asyncio.StreamReaderProtocol, sys.stdout)
        # Use a thin wrapper around the write transport.
        writer = asyncio.StreamWriter(writer_transport, writer_protocol, reader, loop)

        while True:
            try:
                line = await reader.readline()
            except (asyncio.IncompleteReadError, ConnectionError):
                break
            if not line:
                break
            try:
                request = json.loads(line.decode("utf-8"))
            except json.JSONDecodeError as e:
                err = self._error(None, -32700, f"Parse error: {e}")
                writer.write((json.dumps(err) + "\n").encode("utf-8"))
                await writer.drain()
                continue
            response = await self.handle_request(request)
            if response is not None:
                writer.write((json.dumps(response) + "\n").encode("utf-8"))
                await writer.drain()


# ── CLI entry point ───────────────────────────────────────────────────────────


def main() -> None:
    """Entry point: `python -m site_api.llm_stack.mcp.server`."""
    logging.basicConfig(level=logging.INFO)
    server = MCPServer()
    try:
        asyncio.run(server.run_stdio())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":  # pragma: no cover
    main()
