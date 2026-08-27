"""
site_api/llm_stack/tools/builtin/portfolio.py — Portfolio / project-related tools.

These tools let the LLM answer questions about the JT Lai portfolio
pages, protein design pipeline, and ongoing projects.
"""

from __future__ import annotations

import json
from typing import Any

from site_api.llm_stack.tools.base import Tool, ToolResult


class PortfolioPagesTool(Tool):
    """List the public portfolio pages with their URLs and short summaries."""

    @property
    def name(self) -> str:
        return "portfolio_pages"

    @property
    def description(self) -> str:
        return "List the portfolio pages (about, works, gene_ai, ngs, protein_mpnn, ...) with URLs and short summaries."

    async def run(self, **kwargs: Any) -> ToolResult:
        # Static metadata — kept in code so the LLM can answer without RAG.
        pages = [
            {"path": "about_me", "title": "About Me", "description": "自我介紹與研究興趣"},
            {"path": "works", "title": "作品總覽", "description": "研究 / 程式 / 多媒體作品列表"},
            {"path": "gene_ai", "title": "Gene AI", "description": "基因 / 蛋白質 AI 互動頁面"},
            {"path": "ngs", "title": "NGS", "description": "次世代定序分析流程"},
            {"path": "protein_mpnn", "title": "ProteinMPNN", "description": "ProteinMPNN 互動式序列設計"},
            {"path": "report", "title": "Project Report", "description": "專題報告"},
            {"path": "thesis", "title": "Thesis", "description": "論文 / 主題式研究"},
            {"path": "interview_prep", "title": "Interview Prep", "description": "面試準備頁面"},
            {"path": "music", "title": "Music", "description": "AI 音樂生成展示"},
            {"path": "stock", "title": "Stock Dashboard", "description": "台股 / ETF 儀表板"},
        ]
        return ToolResult(success=True, content=json.dumps(pages, ensure_ascii=False, indent=2), data=pages)


class ProjectStackTool(Tool):
    """Get the project's tech stack / architecture summary."""

    @property
    def name(self) -> str:
        return "project_stack"

    @property
    def description(self) -> str:
        return "Return a high-level overview of the project's tech stack (frontend, backend, ML, deployment)."

    async def run(self, **kwargs: Any) -> ToolResult:
        info = {
            "frontend": "Astro + React, static export, deployed to Vercel / Netlify / Cloudflare",
            "backend": "FastAPI + PostgreSQL (Neon / Supabase), Redis caching, slowapi rate limiting",
            "ml": "ESM-2 (HuggingFace), BoTorch / GPyTorch Bayesian Optimisation, ProteinMPNN, REINFORCE RL",
            "data_sources": [
                "UniProt / Ensembl (protein & gene sequences)",
                "NCBI PubMed (literature)",
                "OpenTargets (gene–disease–drug evidence)",
                "ChEMBL (bioactivity)",
                "Reactome / QuickGO (pathways)",
                "TWSE / TAIFEX (Taiwan market data)",
                "Yahoo Finance (international symbols)",
            ],
            "ai_platforms": "OpenAI GPT-4o, Anthropic Claude 3.5, Google Gemini 1.5, MiniMax M2 (via LiteLLM proxy)",
            "deployment": "Render (FastAPI + Postgres), Fly.io (proxy), Cloudflare Tunnel (LiteLLM)",
        }
        return ToolResult(success=True, content=json.dumps(info, ensure_ascii=False, indent=2), data=info)


class SummarizeMarkdownTool(Tool):
    """Trivial utility: summarise a long text by extracting the first sentences."""

    @property
    def name(self) -> str:
        return "summarize_text"

    @property
    def description(self) -> str:
        return "Summarise a long text. `text` is the input; `max_sentences` (default 3) controls the output length."

    async def run(self, *, text: str, max_sentences: int = 3) -> ToolResult:
        if not text or not text.strip():
            return ToolResult(success=False, content="", error="text is empty")
        # Naive sentence splitter — good enough for a tool stub.
        import re

        sentences = re.split(r"(?<=[.!?。！？])\s+", text.strip())
        sentences = [s.strip() for s in sentences if s.strip()]
        summary = " ".join(sentences[: int(max_sentences)])
        return ToolResult(success=True, content=summary, data={"summary": summary, "sentence_count": len(summary)})
