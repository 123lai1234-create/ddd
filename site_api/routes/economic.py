"""site_api.routes.economic — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/economic/summary")
def get_economic_summary() -> dict[str, Any]:
    if not ensure_economic_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    return {"databaseConfigured": True, "connected": True, **economic_summary()}


@router.get("/api/economic/indicators")
def list_economic_indicators(series_id: str | None = None, limit: int = 60, cursor: int | None = None) -> dict[str, Any]:
    if not ensure_economic_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    rows = fetch_economic_rows(series_id, max(1, min(limit, 200)), cursor)
    return {"records": rows, "nextCursor": rows[-1]["id"] if rows else None, **economic_summary()}


@router.post("/api/economic/sync")
def sync_economic(payload: EconomicSyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_economic_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    records = fetch_fred_series(payload.series_ids, payload.limit)
    upsert_economic_indicators(records)
    return {"stored": len(records), "records": fetch_economic_rows(limit=min(payload.limit, 60)), **economic_summary()}


# ── OpenTargets (gene–disease–drug) ──────────────────────────────────────────
