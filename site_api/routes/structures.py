"""site_api.routes.structures — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/structures/pdb/{pdb_id}")
def get_pdb_structure(pdb_id: str) -> dict[str, Any]:
    return fetch_structure_payload(pdb_id)


@router.get("/api/structures/predictions/summary")
def get_structure_prediction_summary() -> dict[str, Any]:
    if not ensure_structure_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    return {"databaseConfigured": True, "connected": True, **structure_prediction_summary()}


@router.get("/api/structures/predictions")
def list_structure_predictions(uniprot_id: str | None = None, limit: int = 20, cursor: int | None = None) -> dict[str, Any]:
    if not ensure_structure_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    rows = fetch_structure_prediction_rows(uniprot_id, max(1, min(limit, 50)), cursor)
    return {"records": rows, "nextCursor": rows[-1]["id"] if rows else None, **structure_prediction_summary()}


@router.post("/api/structures/predictions/sync")
def sync_structure_predictions(payload: StructurePredictionSyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_structure_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    records = fetch_alphafold_predictions(payload.uniprot_ids, payload.limit)
    upsert_structure_predictions(records)
    return {"stored": len(records), "records": fetch_structure_prediction_rows(limit=payload.limit), **structure_prediction_summary()}


# ── Clinical Variants (ClinVar + COSMIC) ─────────────────────────────────────
