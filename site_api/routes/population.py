"""site_api.routes.population — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/population/summary")
def get_population_summary() -> dict[str, Any]:
    if not ensure_population_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    return {"databaseConfigured": True, "connected": True, **population_summary()}


@router.get("/api/population/variants")
def list_population_variants(gene_symbol: str | None = None, limit: int = 20, cursor: int | None = None) -> dict[str, Any]:
    if not ensure_population_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    rows = fetch_population_rows(gene_symbol, max(1, min(limit, 50)), cursor)
    return {"records": rows, "nextCursor": rows[-1]["id"] if rows else None, **population_summary()}


@router.post("/api/population/sync")
def sync_population(payload: PopulationSyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_population_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    records = fetch_gnomad_variants(payload.gene_symbol, payload.limit, payload.dataset)
    upsert_population(records)
    return {"stored": len(records), "records": fetch_population_rows(payload.gene_symbol, limit=payload.limit), **population_summary()}


# ── Protein Interactions (STRING) ─────────────────────────────────────────────
