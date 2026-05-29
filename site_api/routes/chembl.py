"""site_api.routes.chembl — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/chembl/summary")
def get_chembl_summary() -> dict[str, Any]:
    if not ensure_chembl_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    return {"databaseConfigured": True, "connected": True, **chembl_summary()}


@router.get("/api/chembl")
def list_chembl(gene_symbol: str | None = None, limit: int = 20, cursor: int | None = None) -> dict[str, Any]:
    if not ensure_chembl_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    rows = fetch_chembl_rows(gene_symbol, max(1, min(limit, 50)), cursor)
    return {"records": rows, "nextCursor": rows[-1]["id"] if rows else None, **chembl_summary()}


@router.post("/api/chembl/sync")
def sync_chembl(payload: ChEMBLSyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_chembl_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    records = fetch_chembl_compounds(payload.gene_symbol, payload.limit)
    upsert_chembl(records)
    return {"stored": len(records), "records": fetch_chembl_rows(payload.gene_symbol, limit=payload.limit), **chembl_summary()}


# ── QuickGO + Reactome (pathways, GO terms) ──────────────────────────────────
