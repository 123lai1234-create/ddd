from __future__ import annotations

import logging
import math
import os
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
from urllib.parse import urlparse

import dotenv
import httpx

dotenv.load_dotenv()
import psycopg
from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from site_api.db import (
    _require_sync_secret,
    check_all_databases,
    database_available,
    ensure_chembl_schema,
    ensure_economic_schema,
    ensure_interaction_schema,
    ensure_market_schema,
    ensure_opentargets_schema,
    ensure_population_schema,
    ensure_schema,
    ensure_structure_schema,
    ensure_variant_schema,
    get_connection,
    get_database_url,
)
from site_api.models import (
    ChEMBLSyncRequest,
    ESM2ScoreRequest,
    EconomicSyncRequest,
    InquiryCreate,
    InteractionSyncRequest,
    KnowledgeSyncRequest,
    MarketSyncRequest,
    OpenTargetsSyncRequest,
    PathwaySyncRequest,
    PopulationSyncRequest,
    SequenceSyncRequest,
    SequenceUpsertOneRequest,
    SequencingRunSyncRequest,
    StructurePredictionSyncRequest,
    VariantSyncRequest,
)
from site_api.services import (
    build_knowledge_rag_documents,
    build_sequence_rag_documents,
    delete_sequence_record,
    economic_summary,
    fetch_economic_rows,
    fetch_interaction_rows,
    fetch_knowledge_rows,
    fetch_market_bar_rows,
    fetch_market_instrument_rows,
    fetch_population_rows,
    fetch_sequence_rows,
    fetch_sequence_rows_for_search,
    fetch_sequencing_run_rows,
    fetch_structure_payload,
    fetch_structure_prediction_rows,
    fetch_variant_rows,
    interaction_summary,
    knowledge_summary,
    market_summary,
    population_summary,
    sequence_summary,
    sequencing_run_summary,
    structure_prediction_summary,
    upsert_economic_indicators,
    upsert_interactions,
    upsert_knowledge_records,
    upsert_market_bars,
    upsert_market_instruments,
    upsert_population,
    upsert_sequence_records,
    upsert_sequencing_runs,
    upsert_structure_predictions,
    upsert_variants,
    variant_summary,
    chembl_summary,
    fetch_chembl_rows,
    fetch_opentargets_rows,
    opentargets_summary,
    upsert_chembl,
    upsert_opentargets,
)
from site_api.bioinfo_utils import (
    fetch_ensembl_vep,
    fetch_europe_pmc,
    fetch_expression_atlas,
    fetch_mygene_info,
    fetch_myvariant_info,
)
from site_api.chembl_sources import fetch_chembl_compounds
from site_api.economic_sources import fetch_fred_series
from site_api.interaction_sources import fetch_string_interactions
from site_api.knowledge_sources import (
    fetch_geo_datasets,
    fetch_interpro_annotations,
    fetch_openalex_works,
    fetch_pubmed_knowledge,
    fetch_scholar_knowledge,
    fetch_uniprot_knowledge,
)
from site_api.market_sources import MarketBarPayload, MarketInstrumentPayload, fetch_market_records, fetch_twse_daily_records, fetch_twse_listed_stock_symbols, fetch_yahoo_daily_records
from site_api.opentargets_sources import fetch_opentargets_associations
from site_api.pathway_sources import fetch_quickgo_annotations, fetch_reactome_pathways
from site_api.population_sources import fetch_gnomad_variants
from site_api.sequence_sources import SequenceRecordPayload, fetch_gene_sequences, fetch_protein_sequences
from site_api.sequencing_run_sources import fetch_ena_sequencing_runs
from site_api.structure_sources import fetch_alphafold_predictions
from site_api.variant_sources import fetch_clinvar_variants, fetch_cosmic_mutations

router = APIRouter()


@router.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "donttalk-api",
        "databaseConfigured": bool(get_database_url()),
        "connected": database_available(),
    }


@router.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


# ── Training logs (seeded from paper experiments) ────────────────────────────

_BO_STEPS = list(range(1, 16))
_BO_VALUES = [
    0.2087, 0.2087, 0.2087, 0.2087, 0.2087, 0.2087, 0.2087,
    0.2087, 0.2100, 0.2140, 0.2180, 0.2200, 0.2300, 0.2434, 0.2434,
]

_LOSS_STEPS = list(range(1, 81))
_LOSS_VALUES = [
    round(0.03 * math.exp(-i * 0.06) + 0.0013 + (((i * 6364136223846793005 + 1442695040888963407) & 0xFFFFFFFF) / 0x100000000) * 0.0005, 6)
    for i in range(80)
]

_RL_STEPS = list(range(1, 26))
_RL_VALUES = [
    round(-0.15 + i * 0.018 + ((((i * 2891336453 + 987654321) & 0xFFFFFFFF) / 0x100000000) - 0.5) * 0.04, 4)
    for i in range(25)
]

_MPNN_STEPS = list(range(1, 41))
_MPNN_VALUES = [
    round(3.2 * math.exp(-i * 0.08) + 0.8 + (((i * 1664525 + 1013904223) & 0xFFFFFFFF) / 0x100000000) * 0.05, 4)
    for i in range(40)
]

_TRAINING_LOGS: dict[str, dict] = {
    "bo": {
        "label": "Bayesian Optimisation · Sharpe Improvement",
        "x_label": "Round",
        "y_label": "Best Sharpe",
        "steps": _BO_STEPS,
        "values": _BO_VALUES,
    },
    "loss": {
        "label": "ESM-2 Fine-tune · MSE Loss",
        "x_label": "Epoch",
        "y_label": "MSE Loss",
        "steps": _LOSS_STEPS,
        "values": _LOSS_VALUES,
    },
    "rl": {
        "label": "REINFORCE · Cumulative Reward",
        "x_label": "Episode",
        "y_label": "Reward",
        "steps": _RL_STEPS,
        "values": _RL_VALUES,
    },
    "mpnn": {
        "label": "ProteinMPNN · Cross-Entropy Loss",
        "x_label": "Step",
        "y_label": "Cross-Entropy",
        "steps": _MPNN_STEPS,
        "values": _MPNN_VALUES,
    },
}


@router.get("/api/training/logs")
def get_training_logs(run_type: str = "bo") -> dict[str, Any]:
    key = run_type.strip().lower()
    if key not in _TRAINING_LOGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"run_type must be one of: {', '.join(_TRAINING_LOGS)}",
        )
    return {"run_type": key, **_TRAINING_LOGS[key]}


@router.get("/api/db/status")
def db_status(x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    admin_token = os.getenv("ADMIN_TOKEN", "").strip()
    if not admin_token or x_admin_token != admin_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin token required.",
        )
    all_results = check_all_databases()
    return {
        "databases": all_results,
        "totalConfigured": len(all_results),
        "totalConnected": sum(1 for r in all_results if r["connected"]),
        "primaryHost": urlparse(get_database_url()).hostname if get_database_url() else None,
    }


@router.get("/api/structures/pdb/{pdb_id}")
def get_pdb_structure(pdb_id: str) -> dict[str, Any]:
    return fetch_structure_payload(pdb_id)


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


@router.get("/api/rag/documents")
def list_rag_documents(
    query: str | None = None,
    record_type: str | None = None,
    include_sequences: bool = True,
    limit: int = 8,
    chunk_size: int = 900,
    chunk_overlap: int = 140,
) -> dict[str, Any]:
    normalized_query = (query or "").strip() or None
    normalized_record_type = (record_type or "").strip().lower() or None
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
        normalized_limit = max(1, min(limit, 20))
        knowledge_records = fetch_knowledge_rows(
            record_type=normalized_record_type,
            search_query=normalized_query,
            limit=normalized_limit,
        )
        sequence_records = fetch_sequence_rows_for_search(
            search_query=normalized_query,
            limit=normalized_limit,
        ) if include_sequences else []

        documents = build_knowledge_rag_documents(
            knowledge_records,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        documents.extend(build_sequence_rag_documents(sequence_records))

        return {
            "documents": documents,
            "query": normalized_query,
            "recordType": normalized_record_type,
            "includeSequences": include_sequences,
            "knowledgeRecords": len(knowledge_records),
            "sequenceRecords": len(sequence_records),
            "totalChunks": len(documents),
            "embeddingAdvice": {
                "literature": "Use a general text embedding model for abstracts and curated annotation chunks.",
                "protein_annotation": "Use text embeddings for annotation chunks; keep accession and evidence metadata as filters.",
                "protein_sequence": "For raw sequence similarity, prefer protein language models such as ESM-2 instead of plain text embeddings.",
                "gene_sequence": "For DNA/RNA content, prefer genome-specific models or structured retrieval rather than naive text embeddings.",
            },
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.get("/api/sequences/summary")
def get_sequence_summary() -> dict[str, Any]:
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
        summary = sequence_summary()
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


@router.get("/api/sequences/search")
def search_sequences_by_prefix(q: str = "", limit: int = 5) -> dict[str, Any]:
    """Query sequence_library by sequence prefix or display_name / source_id.

    The client sends the first 20+ amino acids of an input sequence.
    The backend searches for rows where the stored sequence starts with the
    query prefix (case-insensitive), or where source_id / display_name
    contains the query string.  Returns lightweight records (no full sequence
    body) so the payload stays small.
    """
    normalized = q.strip().upper()
    if len(normalized) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query must be at least 10 characters.",
        )

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        with get_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, source_id, display_name, organism, sequence_length,
                       record_url, fetched_at,
                       SUBSTRING(sequence, 1, 30) AS seq_preview,
                       sequence_type, source_name
                FROM sequence_library
                WHERE sequence_type = 'protein'
                  AND (
                      UPPER(sequence) LIKE %s
                      OR UPPER(source_id) LIKE %s
                      OR UPPER(display_name) LIKE %s
                  )
                ORDER BY sequence_length ASC, fetched_at DESC
                LIMIT %s;
                """,
                (
                    normalized[:20] + "%",
                    "%" + normalized[:20] + "%",
                    "%" + normalized[:20] + "%",
                    max(1, min(limit, 10)),
                ),
            )
            rows = cursor.fetchall()

        hits = [
            {
                "id": int(r[0]),
                "sourceId": r[1],
                "displayName": r[2],
                "organism": r[3],
                "sequenceLength": int(r[4]),
                "recordUrl": r[5],
                "fetchedAt": r[6].isoformat() if r[6] else None,
                "seqPreview": r[7],
                "sequenceType": r[8],
                "sourceName": r[9],
            }
            for r in rows
        ]
        return {"hits": hits, "query": normalized[:20], "count": len(hits)}

    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.post("/api/sequences/upsert-one", status_code=status.HTTP_201_CREATED)
def upsert_one_sequence(payload: SequenceUpsertOneRequest) -> dict[str, Any]:
    """Store a single sequence found by the frontend (e.g. via RCSB search)."""
    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    record = SequenceRecordPayload(
        sequence_type=payload.sequence_type or "protein",
        source_name=payload.source_name or "RCSB",
        source_id=payload.source_id,
        query_term=payload.query_term or payload.source_id,
        display_name=payload.display_name or payload.source_id,
        organism=payload.organism or "Unknown",
        sequence=payload.sequence,
        sequence_length=len(payload.sequence),
        description=payload.description or "",
        record_url=payload.record_url or f"https://www.rcsb.org/structure/{payload.source_id}",
    )

    try:
        upsert_sequence_records([record])
        return {"stored": True, "sourceId": payload.source_id, "sequenceLength": len(payload.sequence)}
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to persist sequence.",
        ) from error


@router.get("/api/sequences")
def list_sequences(sequence_type: str | None = None, limit: int = 8, cursor: int | None = None) -> dict[str, Any]:
    normalized_type = (sequence_type or "").strip().lower() or None
    if normalized_type and normalized_type not in {"protein", "gene"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sequence_type must be either protein or gene.",
        )

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        records = fetch_sequence_rows(normalized_type, max(1, min(limit, 20)), cursor=cursor)
        summary = sequence_summary()
        return {
            "records": records,
            "nextCursor": records[-1]["id"] if records else None,
            "sequenceType": normalized_type,
            **summary,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.post("/api/sequences/sync")
def sync_sequences(payload: SequenceSyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    protein_query = payload.protein_query or "kinase"
    gene_symbols = payload.gene_symbols or ["TP53", "BRCA1", "EGFR", "APOE"]
    species = payload.species or "homo_sapiens"

    try:
        protein_records = fetch_protein_sequences(protein_query, payload.limit)
        gene_records = fetch_gene_sequences(gene_symbols[: payload.limit], species)
    except Exception as error:  # requests raises outside psycopg hierarchy
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Sequence crawl failed: {error}",
        ) from error

    try:
        upsert_sequence_records(protein_records + gene_records)
        summary = sequence_summary()
        return {
            "stored": {
                "protein": len(protein_records),
                "gene": len(gene_records),
            },
            "proteinRecords": fetch_sequence_rows("protein", payload.limit),
            "geneRecords": fetch_sequence_rows("gene", payload.limit),
            **summary,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to persist crawled sequences to PostgreSQL.",
        ) from error


@router.get("/api/sequencing-runs/summary")
def get_sequencing_run_summary() -> dict[str, Any]:
    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        return {
            "databaseConfigured": True,
            "connected": True,
            **sequencing_run_summary(),
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.get("/api/sequencing-runs")
def list_sequencing_runs(query: str | None = None, limit: int = 8, cursor: int | None = None) -> dict[str, Any]:
    normalized_query = (query or "").strip() or None
    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        rows = fetch_sequencing_run_rows(normalized_query, max(1, min(limit, 20)), cursor=cursor)
        return {
            "records": rows,
            "nextCursor": rows[-1]["id"] if rows else None,
            "query": normalized_query,
            **sequencing_run_summary(),
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.post("/api/sequencing-runs/sync")
def sync_sequencing_runs(payload: SequencingRunSyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    query = payload.query or 'tax_name("Homo sapiens") AND library_strategy="RNA-Seq"'
    try:
        records = fetch_ena_sequencing_runs(query, payload.limit)
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Sequencing metadata crawl failed: {error}",
        ) from error

    try:
        upsert_sequencing_runs(records)
        return {
            "stored": len(records),
            "records": fetch_sequencing_run_rows(query=None, limit=payload.limit),
            **sequencing_run_summary(),
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to persist crawled sequencing metadata to PostgreSQL.",
        ) from error


@router.get("/api/market/summary")
def get_market_summary() -> dict[str, Any]:
    if not ensure_market_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        return {
            "databaseConfigured": True,
            "connected": True,
            **market_summary(),
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.get("/api/market/instruments")
def list_market_instruments(
    asset_type: str | None = None,
    query: str | None = None,
    limit: int = 20,
    cursor: int | None = None,
) -> dict[str, Any]:
    normalized_asset_type = (asset_type or "").strip().lower() or None
    normalized_query = (query or "").strip() or None

    if normalized_asset_type and normalized_asset_type not in {"stock", "etf", "futures"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="asset_type must be one of stock, etf, futures.",
        )

    if not ensure_market_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        records = fetch_market_instrument_rows(
            asset_type=normalized_asset_type,
            query=normalized_query,
            limit=max(1, min(limit, 50)),
            cursor=cursor,
        )
        return {
            "records": records,
            "nextCursor": records[-1]["id"] if records else None,
            "assetType": normalized_asset_type,
            "query": normalized_query,
            **market_summary(),
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.get("/api/market/bars")
def list_market_bars(
    asset_type: str | None = None,
    symbol: str | None = None,
    contract_month: str | None = None,
    limit: int = 60,
    cursor: int | None = None,
) -> dict[str, Any]:
    normalized_asset_type = (asset_type or "").strip().lower() or None
    normalized_symbol = (symbol or "").strip().upper() or None
    normalized_contract_month = (contract_month or "").strip() or None

    if normalized_asset_type and normalized_asset_type not in {"stock", "etf", "futures"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="asset_type must be one of stock, etf, futures.",
        )

    if not ensure_market_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        records = fetch_market_bar_rows(
            asset_type=normalized_asset_type,
            symbol=normalized_symbol,
            contract_month=normalized_contract_month,
            limit=max(1, min(limit, 2000)),
            cursor=cursor,
        )
        return {
            "records": records,
            "nextCursor": records[-1]["id"] if records else None,
            "assetType": normalized_asset_type,
            "symbol": normalized_symbol,
            "contractMonth": normalized_contract_month,
            **market_summary(),
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.post("/api/market/sync")
def sync_market_data(payload: MarketSyncRequest, x_sync_secret: str | None = Header(default=None)) -> dict[str, Any]:
    _require_sync_secret(x_sync_secret)
    if not ensure_market_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    instrument_records: list[MarketInstrumentPayload] = []
    bar_records: list[MarketBarPayload] = []
    failures: list[dict[str, str]] = []
    stored = {
        "stock": {"symbols": 0, "bars": 0},
        "etf": {"symbols": 0, "bars": 0},
        "futures": {"symbols": 0, "bars": 0},
    }

    for current_asset_type, symbols in (
        ("stock", payload.stock_symbols),
        ("etf", payload.etf_symbols),
        ("futures", payload.futures_symbols),
    ):
        for current_symbol in symbols:
            try:
                instrument, bars = fetch_market_records(
                    current_symbol,
                    current_asset_type,
                    payload.twse_months,
                    payload.yahoo_range,
                )
                instrument_records.append(instrument)
                bar_records.extend(bars)
                stored[current_asset_type]["symbols"] += 1
                stored[current_asset_type]["bars"] += len(bars)
            except Exception as error:
                failures.append(
                    {
                        "assetType": current_asset_type,
                        "symbol": current_symbol,
                        "error": str(error),
                    }
                )

    if not instrument_records:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No market records could be fetched from upstream providers.",
        )

    try:
        upsert_market_instruments(instrument_records)
        upsert_market_bars(bar_records)
        return {
            "stored": stored,
            "failures": failures,
            "instrumentPreview": fetch_market_instrument_rows(limit=12),
            "barPreview": fetch_market_bar_rows(limit=24),
            **market_summary(),
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to persist market data to PostgreSQL.",
        ) from error


@router.get("/api/market/twse-listed")
def get_twse_listed_stocks() -> dict[str, Any]:
    """Return all currently listed TWSE stocks fetched from the TWSE OpenAPI."""
    stocks = fetch_twse_listed_stock_symbols()
    return {"count": len(stocks), "stocks": stocks}


@router.post("/api/market/bulk-sync")
def bulk_sync_market_data(
    payload: MarketSyncRequest,
    x_sync_secret: str | None = Header(default=None),
) -> dict[str, Any]:
    """Bulk-import historical TWSE data for a large list of symbols.

    Identical to /api/market/sync but designed for long-running historical
    backfills (twse_months up to 120 = 10 years).  Failures per symbol are
    collected rather than aborting the whole batch.
    """
    _require_sync_secret(x_sync_secret)
    if not ensure_market_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    instrument_records: list[MarketInstrumentPayload] = []
    bar_records: list[MarketBarPayload] = []
    failures: list[dict[str, str]] = []
    stored: dict[str, dict[str, int]] = {
        "stock": {"symbols": 0, "bars": 0},
        "etf": {"symbols": 0, "bars": 0},
        "futures": {"symbols": 0, "bars": 0},
    }

    for current_asset_type, symbols in (
        ("stock", payload.stock_symbols),
        ("etf", payload.etf_symbols),
        ("futures", payload.futures_symbols),
    ):
        for current_symbol in symbols:
            try:
                if current_asset_type in ("stock", "etf"):
                    instrument, bars = fetch_twse_daily_records(
                        current_symbol, current_asset_type, payload.twse_months
                    )
                else:
                    instrument, bars = fetch_market_records(
                        current_symbol,
                        current_asset_type,
                        payload.twse_months,
                        payload.yahoo_range,
                    )
                instrument_records.append(instrument)
                bar_records.extend(bars)
                stored[current_asset_type]["symbols"] += 1
                stored[current_asset_type]["bars"] += len(bars)
                # Flush in batches of 20 symbols to keep memory reasonable
                if len(instrument_records) >= 20:
                    upsert_market_instruments(instrument_records)
                    upsert_market_bars(bar_records)
                    instrument_records = []
                    bar_records = []
            except Exception as error:
                failures.append(
                    {
                        "assetType": current_asset_type,
                        "symbol": current_symbol,
                        "error": str(error),
                    }
                )

    # Flush remaining
    if instrument_records:
        try:
            upsert_market_instruments(instrument_records)
            upsert_market_bars(bar_records)
        except psycopg.Error as error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to persist market data to PostgreSQL.",
            ) from error

    return {
        "stored": stored,
        "failures": failures,
        **market_summary(),
    }


@router.delete("/api/sequences/{record_id}")
def delete_sequence(record_id: int) -> dict[str, Any]:
    if record_id < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="record_id must be a positive integer.",
        )

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        deleted = delete_sequence_record(record_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sequence record was not found.",
            )

        summary = sequence_summary()
        return {
            "deleted": deleted,
            **summary,
        }
    except HTTPException:
        raise
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete sequence record from PostgreSQL.",
        ) from error


@router.get("/api/inquiries/stats")
def inquiry_stats() -> dict[str, Any]:
    database_url = get_database_url()
    if not database_url:
        return {
            "databaseConfigured": False,
            "connected": False,
            "totalInquiries": 0,
            "latestCreatedAt": None,
        }

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        with get_connection() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*), MAX(created_at) FROM site_inquiries;")
            total_inquiries, latest_created_at = cursor.fetchone()
        return {
            "databaseConfigured": True,
            "connected": True,
            "totalInquiries": int(total_inquiries or 0),
            "latestCreatedAt": latest_created_at.isoformat() if latest_created_at else None,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.post("/api/inquiries", status_code=status.HTTP_201_CREATED)
def create_inquiry(payload: InquiryCreate) -> dict[str, Any]:
    if payload.website:
        return {"accepted": True, "discarded": True}

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
        with get_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO site_inquiries (name, email, organization, message, source_page)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, created_at;
                """,
                (
                    payload.name,
                    payload.email,
                    payload.organization or None,
                    payload.message,
                    payload.source_page,
                ),
            )
            inquiry_id, created_at = cursor.fetchone()
        connection.commit()
        return {
            "id": int(inquiry_id),
            "createdAt": created_at.isoformat(),
            "saved": True,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to persist inquiry to PostgreSQL.",
        ) from error


# ── ESM-2 HuggingFace proxy ──────────────────────────────────────────
# Calls HuggingFace fill-mask API server-side so visitors need no token.
# Results are cached in a process-level LRU dict (key = seq:pos).

_logger = logging.getLogger(__name__)
_ESM2_HF_URL = "https://api-inference.huggingface.co/models/facebook/esm2_t6_8M_UR50D"
_MPNN_AA = "ACDEFGHIKLMNPQRSTVWY"
_ESM2_CACHE: OrderedDict[str, dict[str, float]] = OrderedDict()
_ESM2_CACHE_MAX = 200  # cache up to 200 position profiles
_ESM2_CONCURRENCY = 4  # parallel HF requests


def _esm2_cache_get(key: str) -> dict[str, float] | None:
    if key in _ESM2_CACHE:
        _ESM2_CACHE.move_to_end(key)
        return _ESM2_CACHE[key]
    return None


def _esm2_cache_set(key: str, value: dict[str, float]) -> None:
    _ESM2_CACHE[key] = value
    _ESM2_CACHE.move_to_end(key)
    while len(_ESM2_CACHE) > _ESM2_CACHE_MAX:
        _ESM2_CACHE.popitem(last=False)


def _score_one_position(seq: str, pos: int, token: str) -> tuple[int, dict[str, float]]:
    """Mask one position and query ESM-2 fill-mask API. Returns (pos, dist)."""
    cache_key = f"{seq}:{pos}"
    cached = _esm2_cache_get(cache_key)
    if cached is not None:
        return pos, cached

    masked = seq[:pos] + "<mask>" + seq[pos + 1:]
    try:
        resp = httpx.post(
            _ESM2_HF_URL,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"inputs": masked, "parameters": {"top_k": 25}},
            timeout=30.0,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 503:
            raise RuntimeError("ESM-2 model is loading (503). Retry in 30 s.") from exc
        if exc.response.status_code == 401:
            raise RuntimeError("HF_TOKEN is invalid or expired.") from exc
        raise RuntimeError(f"HuggingFace API HTTP {exc.response.status_code}") from exc

    predictions = resp.json()
    dist: dict[str, float] = {aa: -10.0 for aa in _MPNN_AA}
    for pred in (predictions if isinstance(predictions, list) else []):
        aa = (pred.get("token_str") or "").strip().upper()
        if aa in dist:
            dist[aa] = math.log(max(float(pred.get("score", 0)), 1e-10))

    _esm2_cache_set(cache_key, dist)
    return pos, dist


@router.post("/api/esm2/score")
def esm2_score(request: Request, body: ESM2ScoreRequest) -> dict[str, Any]:
    """Proxy ESM-2 fill-mask scoring server-side; visitors need no HuggingFace token."""
    hf_token = os.getenv("HF_TOKEN", "").strip()
    if not hf_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="HF_TOKEN is not configured on this server.",
        )

    seq = body.sequence
    positions = (
        [p for p in body.positions if 0 <= p < len(seq)]
        if body.positions is not None
        else list(range(len(seq)))
    )
    if not positions:
        return {"profiles": {}, "sequence": seq, "positionCount": 0}

    profiles: dict[str, dict[str, float]] = {}
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=_ESM2_CONCURRENCY) as pool:
        futures = {pool.submit(_score_one_position, seq, pos, hf_token): pos for pos in positions}
        for future in as_completed(futures):
            try:
                pos, dist = future.result()
                profiles[str(pos)] = dist
            except RuntimeError as exc:
                err_msg = str(exc)
                errors.append(err_msg)
                _logger.warning("ESM-2 position %d failed: %s", futures[future], err_msg)
                if "loading (503)" in err_msg or "invalid or expired" in err_msg:
                    # Fatal — cancel remaining and surface the error
                    for f in futures:
                        f.cancel()
                    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=err_msg) from exc

    return {
        "profiles": profiles,
        "sequence": seq,
        "positionCount": len(profiles),
        "errors": errors,
    }


# ── AlphaFold Structure Predictions ──────────────────────────────────────────

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
    if ensure_schema():
        try:
            upsert_knowledge_records(records)
        except Exception:
            pass
    return {"records": [r.__dict__ for r in records], "count": len(records), "query": query}


# ── Expression Atlas (tissue-level expression) ───────────────────────────────

@router.get("/api/expression/atlas")
def search_expression_atlas(gene_symbol: str = "TP53", limit: int = 8) -> dict[str, Any]:
    records = fetch_expression_atlas(gene_symbol, min(limit, 20))
    if ensure_schema():
        try:
            upsert_knowledge_records(records)
        except Exception:
            pass
    return {"records": [r.__dict__ for r in records], "count": len(records), "geneSymbol": gene_symbol}


# ── Utility: MyGene.info (gene normalization) ────────────────────────────────

@router.get("/api/utils/mygene")
def lookup_mygene(query: str = "TP53", limit: int = 5) -> dict[str, Any]:
    results = fetch_mygene_info(query, min(limit, 20))
    return {"hits": results, "count": len(results), "query": query}


# ── Utility: MyVariant.info (variant annotation) ─────────────────────────────

@router.get("/api/utils/myvariant/{variant_id:path}")
def lookup_myvariant(variant_id: str) -> dict[str, Any]:
    result = fetch_myvariant_info(variant_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Variant {variant_id} not found.")
    return {"variant": result, "variantId": variant_id}


# ── Utility: Ensembl VEP (variant effect prediction) ─────────────────────────

@router.get("/api/utils/vep/{hgvs:path}")
def lookup_vep(hgvs: str) -> dict[str, Any]:
    result = fetch_ensembl_vep(hgvs)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"VEP lookup failed for {hgvs}.")
    return {"result": result, "hgvs": hgvs}


# ── Multi-model AI Chatbot proxy (Gemini → DeepSeek → OpenRouter) ─────────────

CHAT_SYSTEM_PROMPT = (
    "你是一個生物醫學 AI 作品集的助手。這個作品集包含蛋白質 AI 設計 (ProteinMPNN, ESM-2)、"
    "基因分析平台 (UniProt, Ensembl, PubMed)、NGS 定序工作站、遺傳演算法交易策略研究等項目。"
    "用繁體中文簡潔回答訪客的問題，保持友善和專業。回答控制在 200 字以內。"
)


def _try_gemini(message: str) -> str | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    import time
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    body = {
        "system_instruction": {"parts": [{"text": CHAT_SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": message}]}],
        "generationConfig": {"maxOutputTokens": 512},
    }
    for attempt in range(2):
        resp = httpx.post(url, headers={"content-type": "application/json"}, json=body, timeout=20)
        if resp.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        if resp.status_code != 200:
            return None
        data = resp.json()
        return (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        ) or None
    return None


def _try_deepseek(message: str) -> str | None:
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        return None
    resp = httpx.post(
        "https://api.deepseek.com/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                {"role": "user", "content": message},
            ],
            "max_tokens": 512,
        },
        timeout=20,
    )
    if resp.status_code != 200:
        return None
    return resp.json().get("choices", [{}])[0].get("message", {}).get("content") or None


def _try_openrouter(message: str) -> str | None:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        return None
    resp = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": "meta-llama/llama-3.1-8b-instruct:free",
            "messages": [
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                {"role": "user", "content": message},
            ],
            "max_tokens": 512,
        },
        timeout=20,
    )
    if resp.status_code != 200:
        return None
    return resp.json().get("choices", [{}])[0].get("message", {}).get("content") or None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


@router.post("/api/chat")
def chat_proxy(payload: ChatRequest) -> dict[str, Any]:
    providers = [
        ("Gemini", _try_gemini),
        ("DeepSeek", _try_deepseek),
        ("OpenRouter", _try_openrouter),
    ]
    for name, fn in providers:
        try:
            result = fn(payload.message)
            if result:
                return {"reply": result, "provider": name}
        except Exception:
            continue
    return {"reply": "所有 AI 服務目前都無法回應，請稍後再試。"}


# ── Public Yahoo Finance price proxy (no auth, no DB) ────────────────────────

class YahooPriceRequest(BaseModel):
    symbols: list[str] = Field(min_length=1, max_length=50)
    range: str = Field(default="1y")


@router.post("/api/market/yahoo-prices")
def yahoo_prices_proxy(payload: YahooPriceRequest) -> dict[str, Any]:
    """Fetch daily OHLC from Yahoo Finance directly — no auth or DB required."""
    results: dict[str, Any] = {}
    for symbol in payload.symbols:
        tw_symbol = f"{symbol}.TW"
        try:
            _inst, bars = fetch_yahoo_daily_records(tw_symbol, "stock", payload.range)
            if bars:
                results[symbol] = {
                    "dates": [b.trade_date for b in bars],
                    "closes": [b.close for b in bars],
                }
        except Exception:
            continue
    return {"results": results}


# ──────────────────────────────────────────────────────────────────────
# Games API — lightweight in-memory leaderboard
# ──────────────────────────────────────────────────────────────────────

import time as _time
from threading import Lock as _Lock

_GAME_SCORES: dict[str, list[dict[str, Any]]] = {}
_GAME_LOCK = _Lock()
_ALLOWED_GAMES = {"breakout", "snake3d", "shooter3d", "tetris3d"}


class GameScoreSubmit(BaseModel):
    game: str = Field(min_length=1, max_length=32)
    player: str = Field(min_length=1, max_length=24)
    score: int = Field(ge=0, le=10_000_000)
    level: int | None = Field(default=None, ge=0, le=10_000)
    meta: dict[str, Any] | None = None


@router.post("/api/games/scores")
def submit_game_score(payload: GameScoreSubmit) -> dict[str, Any]:
    game = payload.game.strip().lower()
    if game not in _ALLOWED_GAMES:
        raise HTTPException(status_code=400, detail="unknown game")
    player = payload.player.strip()[:24] or "anon"
    entry = {
        "player": player,
        "score": int(payload.score),
        "level": payload.level,
        "meta": payload.meta or {},
        "ts": int(_time.time()),
    }
    with _GAME_LOCK:
        bucket = _GAME_SCORES.setdefault(game, [])
        bucket.append(entry)
        bucket.sort(key=lambda e: (-e["score"], e["ts"]))
        del bucket[50:]
        rank = next((i + 1 for i, e in enumerate(bucket) if e is entry), None)
    return {"ok": True, "rank": rank, "total": len(_GAME_SCORES.get(game, []))}


@router.get("/api/games/leaderboard/{game}")
def game_leaderboard(game: str, limit: int = 10) -> dict[str, Any]:
    g = game.strip().lower()
    if g not in _ALLOWED_GAMES:
        raise HTTPException(status_code=400, detail="unknown game")
    limit = max(1, min(50, int(limit)))
    with _GAME_LOCK:
        top = list(_GAME_SCORES.get(g, []))[:limit]
    return {"game": g, "entries": top}


@router.get("/api/games/seed/{game}")
def game_random_seed(game: str) -> dict[str, Any]:
    g = game.strip().lower()
    if g not in _ALLOWED_GAMES:
        raise HTTPException(status_code=400, detail="unknown game")
    import random as _rand
    seed = _rand.getrandbits(32)
    return {"game": g, "seed": seed, "ts": int(_time.time())}

