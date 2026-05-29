"""site_api.routes.literature — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/literature/europepmc")
def search_europe_pmc(query: str = "protein engineering", limit: int = 8) -> dict[str, Any]:
    records = fetch_europe_pmc(query, min(limit, 25))
    if ensure_schema():
        with contextlib.suppress(Exception):
            upsert_knowledge_records(records)
    return {"records": [r.__dict__ for r in records], "count": len(records), "query": query}


# ── Expression Atlas (tissue-level expression) ───────────────────────────────
