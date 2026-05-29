"""site_api.routes.knowledge — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/knowledge/summary")
def get_knowledge_summary() -> dict[str, Any]:
    database_url = get_database_url()
    if not database_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DATABASE_URL is not configured.",
        )

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        summary = knowledge_summary()
        return {
            "databaseConfigured": True,
            "connected": True,
            **summary,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.get("/api/knowledge")
def list_knowledge(
    record_type: str | None = None,
    source_name: str | None = None,
    query: str | None = None,
    limit: int = 8,
    cursor: int | None = None,
) -> dict[str, Any]:
    normalized_record_type = (record_type or "").strip().lower() or None
    normalized_source_name = (source_name or "").strip() or None
    normalized_query = (query or "").strip() or None

    if normalized_record_type and normalized_record_type not in {"protein_annotation", "literature"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="record_type must be either protein_annotation or literature.",
        )

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        records = fetch_knowledge_rows(
            record_type=normalized_record_type,
            source_name=normalized_source_name,
            search_query=normalized_query,
            limit=max(1, min(limit, 20)),
            cursor=cursor,
        )
        summary = knowledge_summary()
        return {
            "records": records,
            "nextCursor": records[-1]["id"] if records else None,
            "recordType": normalized_record_type,
            "sourceName": normalized_source_name,
            "query": normalized_query,
            **summary,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.post("/api/knowledge/sync")
def sync_knowledge(payload: KnowledgeSyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    protein_query = payload.protein_query or "kinase"
    literature_query = payload.literature_query or protein_query

    try:
        protein_records = fetch_uniprot_knowledge(protein_query, payload.limit)
        literature_records = fetch_pubmed_knowledge(literature_query, payload.limit)
        scholar_records = fetch_scholar_knowledge(payload.scholar_query or literature_query, payload.limit) if payload.scholar_query or literature_query else []
        geo_records = fetch_geo_datasets(payload.geo_query, payload.limit) if payload.geo_query else []
        openalex_records = fetch_openalex_works(payload.openalex_query, payload.limit) if payload.openalex_query else []
        interpro_records: list = []
        for uid in (payload.interpro_uniprot_ids or [])[:4]:
            interpro_records.extend(fetch_interpro_annotations(uid, payload.limit))
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Knowledge crawl failed: {error}",
        ) from error

    all_records = protein_records + literature_records + scholar_records + geo_records + openalex_records + interpro_records
    try:
        upsert_knowledge_records(all_records)
        summary = knowledge_summary()
        return {
            "stored": {
                "proteinAnnotation": len(protein_records),
                "literature": len(literature_records),
                "scholar": len(scholar_records),
                "geo": len(geo_records),
                "openalex": len(openalex_records),
                "interpro": len(interpro_records),
            },
            "proteinAnnotationRecords": fetch_knowledge_rows(record_type="protein_annotation", limit=payload.limit),
            "literatureRecords": fetch_knowledge_rows(record_type="literature", limit=payload.limit),
            **summary,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to persist crawled knowledge to PostgreSQL.",
        ) from error


@router.get("/api/variants/summary")
def get_variant_summary() -> dict[str, Any]:
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
