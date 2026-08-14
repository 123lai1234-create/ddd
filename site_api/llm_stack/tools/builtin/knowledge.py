"""
site_api/llm_stack/tools/builtin/knowledge.py — Knowledge-layer tools.

These tools wrap the existing bioinformatics / market data sources so
the LLM can query them directly.
"""

from __future__ import annotations

import json
from typing import Any

from site_api.llm_stack.tools.base import Tool, ToolResult


class SequenceLookupTool(Tool):
    """Look up a protein sequence from the cached sequence library."""

    @property
    def name(self) -> str:
        return "sequence_lookup"

    @property
    def description(self) -> str:
        return "Look up a protein / gene sequence from the cached sequence library by accession (e.g. P53_HUMAN) or gene symbol (e.g. TP53)."

    async def run(self, *, accession: str) -> ToolResult:
        if not accession or not accession.strip():
            return ToolResult(success=False, content="", error="accession is empty")
        try:
            from site_api.sequence_sources import fetch_sequence  # type: ignore

            seq = await fetch_sequence(accession)
            if seq is None:
                return ToolResult(success=False, content="", error=f"sequence {accession} not found")
            return ToolResult(
                success=True,
                content=json.dumps({"accession": accession, "sequence": seq[:500] + ("..." if len(seq) > 500 else "")}),
                data={"accession": accession, "length": len(seq)},
            )
        except Exception as e:
            return ToolResult(success=False, content="", error=f"sequence lookup failed: {e}")


class KnowledgeSearchTool(Tool):
    """Search the knowledge library (UniProt annotations, PubMed summaries)."""

    @property
    def name(self) -> str:
        return "knowledge_search"

    @property
    def description(self) -> str:
        return "Search the cached knowledge library (UniProt annotations, PubMed summaries) for a free-text query."

    async def run(self, *, query: str, limit: int = 5) -> ToolResult:
        if not query or not query.strip():
            return ToolResult(success=False, content="", error="query is empty")
        try:
            from site_api.knowledge_sources import search_knowledge  # type: ignore

            results = await search_knowledge(query=query, limit=int(limit))
            if not results:
                return ToolResult(success=True, content="No results found.", data={"results": []})
            lines = []
            for i, r in enumerate(results, 1):
                title = r.get("title", "(no title)")
                snippet = r.get("snippet", r.get("summary", ""))
                source = r.get("source", "")
                lines.append(f"{i}. {title}\n   {snippet}\n   source: {source}")
            return ToolResult(success=True, content="\n".join(lines), data={"results": results})
        except Exception as e:
            return ToolResult(success=False, content="", error=f"knowledge search failed: {e}")


class MarketSummaryTool(Tool):
    """Return the latest market summary (cached daily bars)."""

    @property
    def name(self) -> str:
        return "market_summary"

    @property
    def description(self) -> str:
        return "Return the latest market summary (TWSE / index / ETF / futures) cached in the database."

    async def run(self, **kwargs: Any) -> ToolResult:
        try:
            from site_api.market_sources import market_summary  # type: ignore

            summary = await market_summary()
            return ToolResult(success=True, content=json.dumps(summary, ensure_ascii=False, indent=2), data=summary)
        except Exception as e:
            return ToolResult(success=False, content="", error=f"market summary failed: {e}")
