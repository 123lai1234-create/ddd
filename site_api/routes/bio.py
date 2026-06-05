
from fastapi import APIRouter

router = APIRouter()

# ── End of imports ──

# ── Routes ──
    if not ensure_variant_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    return {"databaseConfigured": True, "connected": True, **variant_summary()}


@router.get("/api/variants")
def list_variants(gene_symbol: str | None = None, limit: int = 20, cursor: int | None = None) -> dict[str, Any]:
    if not ensure_variant_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    rows = fetch_variant_rows(gene_symbol, max(1, min(limit, 50)), cursor)
    return {"records": rows, "nextCursor": rows[-1]["id"] if rows else None, **variant_summary()}


@router.post("/api/variants/sync")
def sync_variants(payload: VariantSyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_variant_schema():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready.")
    records = fetch_clinvar_variants(payload.gene_symbol, payload.limit)
    if payload.include_cosmic:
        records.extend(fetch_cosmic_mutations(payload.gene_symbol, payload.limit))
    upsert_variants(records)
    return {"stored": len(records), "records": fetch_variant_rows(payload.gene_symbol, limit=payload.limit), **variant_summary()}


# ── Population Allele Frequencies (gnomAD) ────────────────────────────────────

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

@router.get("/api/literature/europepmc")
def search_europe_pmc(query: str = "protein engineering", limit: int = 8) -> dict[str, Any]:
    records = fetch_europe_pmc(query, min(limit, 25))

__all__ = ["router"]