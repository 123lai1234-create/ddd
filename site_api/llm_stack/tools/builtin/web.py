"""
site_api/llm_stack/tools/builtin/web.py — Web search / fetch tools.

These tools wrap the existing `minimax_client.web_search` so the LLM
can fetch current information even when no direct RAG index is available.
"""

from __future__ import annotations

from typing import Any

from site_api.llm_stack.tools.base import Tool, ToolResult


class WebSearchTool(Tool):
    """Search the web using the MiniMax search API (or fallback to DuckDuckGo)."""

    @property
    def name(self) -> str:
        return "web_search"

    @property
    def description(self) -> str:
        return "Search the web for a query and return the top results (titles, snippets, URLs). Useful for questions about current events."

    async def run(self, *, query: str, num_results: int = 5) -> ToolResult:
        if not query or not query.strip():
            return ToolResult(success=False, content="", error="query is empty")
        try:
            from site_api.minimax_client import web_search  # type: ignore

            result = await web_search(query=query, num_results=int(num_results))
            data = result.get("data", []) if isinstance(result, dict) else []
            if not data:
                return ToolResult(
                    success=True,
                    content="No web results returned.",
                    data={"results": []},
                )
            lines = []
            for i, r in enumerate(data, 1):
                title = r.get("title", "(no title)")
                snippet = r.get("snippet", r.get("content", ""))
                url = r.get("url", "")
                lines.append(f"{i}. {title}\n   {snippet}\n   {url}")
            return ToolResult(
                success=True,
                content="\n".join(lines),
                data={"results": data},
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=f"web_search failed: {e}")


class WebFetchTool(Tool):
    """Fetch a URL and return its text content (truncated)."""

    @property
    def name(self) -> str:
        return "web_fetch"

    @property
    def description(self) -> str:
        return "Fetch a URL and return its main text content (truncated). Useful for reading articles or documentation pages."

    async def run(self, *, url: str, max_chars: int = 4000) -> ToolResult:
        if not url or not url.strip():
            return ToolResult(success=False, content="", error="url is empty")
        try:
            import httpx

            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (LLM-Bot)"})
            if resp.status_code >= 400:
                return ToolResult(success=False, content="", error=f"HTTP {resp.status_code}")
            text = resp.text
            if len(text) > max_chars:
                text = text[: int(max_chars)] + "\n\n[truncated]"
            return ToolResult(success=True, content=text, data={"url": url, "length": len(text)})
        except Exception as e:
            return ToolResult(success=False, content="", error=f"fetch failed: {e}")
