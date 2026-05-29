"""site_api.routes.expression — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/expression/atlas")
def search_expression_atlas(gene_symbol: str = "TP53", limit: int = 8) -> dict[str, Any]:
    records = fetch_expression_atlas(gene_symbol, min(limit, 20))
    if ensure_schema():
        with contextlib.suppress(Exception):
            upsert_knowledge_records(records)
    return {"records": [r.__dict__ for r in records], "count": len(records), "geneSymbol": gene_symbol}


# ── Utility: MyGene.info (gene normalization) ────────────────────────────────
