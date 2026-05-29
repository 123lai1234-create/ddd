"""site_api.routes.opentargets — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/opentargets/summary")
def get_opentargets_summary() -> dict[str, Any]:
    if not ensure_opentargets_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    return {"databaseConfigured": True, "connected": True, **opentargets_summary()}


@router.get("/api/opentargets")
def list_opentargets(gene_symbol: str | None = None, limit: int = 20, cursor: int | None = None) -> dict[str, Any]:
    if not ensure_opentargets_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    rows = fetch_opentargets_rows(gene_symbol, max(1, min(limit, 50)), cursor)
    return {"records": rows, "nextCursor": rows[-1]["id"] if rows else None, **opentargets_summary()}


@router.post("/api/opentargets/sync")
def sync_opentargets(payload: OpenTargetsSyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_opentargets_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    records = fetch_opentargets_associations(payload.gene_symbol, payload.limit)
    upsert_opentargets(records)
    return {"stored": len(records), "records": fetch_opentargets_rows(payload.gene_symbol, limit=payload.limit), **opentargets_summary()}


# ── ChEMBL (target–compound–bioactivity) ─────────────────────────────────────
