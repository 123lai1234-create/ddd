"""site_api.routes.pathways — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.post("/api/pathways/sync")
def sync_pathways(payload: PathwaySyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    records = fetch_reactome_pathways(payload.gene_symbol, limit=payload.limit)
    if payload.uniprot_id:
        records.extend(fetch_quickgo_annotations(payload.uniprot_id, limit=payload.limit))
    upsert_knowledge_records(records)
    return {"stored": len(records), **knowledge_summary()}


# ── Europe PMC (enhanced literature) ─────────────────────────────────────────
