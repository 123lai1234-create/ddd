"""site_api.routes.interactions — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/interactions/summary")
def get_interaction_summary() -> dict[str, Any]:
    if not ensure_interaction_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    return {"databaseConfigured": True, "connected": True, **interaction_summary()}


@router.get("/api/interactions")
def list_interactions(query: str | None = None, limit: int = 20, cursor: int | None = None) -> dict[str, Any]:
    if not ensure_interaction_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    rows = fetch_interaction_rows(query, max(1, min(limit, 50)), cursor)
    return {"records": rows, "nextCursor": rows[-1]["id"] if rows else None, **interaction_summary()}


@router.post("/api/interactions/sync")
def sync_interactions(payload: InteractionSyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_interaction_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    records = fetch_string_interactions(payload.identifiers, payload.species, payload.limit)
    upsert_interactions(records)
    return {"stored": len(records), "records": fetch_interaction_rows(limit=payload.limit), **interaction_summary()}


# ── Economic Indicators (FRED) ────────────────────────────────────────────────
