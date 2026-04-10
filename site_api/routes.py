from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse

import psycopg
from fastapi import APIRouter, Header, HTTPException, status

from site_api.db import (
    _require_sync_secret,
    check_all_databases,
    database_available,
    ensure_market_schema,
    ensure_schema,
    get_connection,
    get_database_url,
)
from site_api.models import (
    InquiryCreate,
    KnowledgeSyncRequest,
    MarketSyncRequest,
    SequenceSyncRequest,
    SequenceUpsertOneRequest,
    SequencingRunSyncRequest,
)
from site_api.services import (
    build_knowledge_rag_documents,
    build_sequence_rag_documents,
    delete_sequence_record,
    fetch_knowledge_rows,
    fetch_market_bar_rows,
    fetch_market_instrument_rows,
    fetch_sequence_rows,
    fetch_sequence_rows_for_search,
    fetch_sequencing_run_rows,
    fetch_structure_payload,
    knowledge_summary,
    market_summary,
    sequence_summary,
    sequencing_run_summary,
    upsert_knowledge_records,
    upsert_market_bars,
    upsert_market_instruments,
    upsert_sequence_records,
    upsert_sequencing_runs,
)
from site_api.knowledge_sources import fetch_pubmed_knowledge, fetch_uniprot_knowledge
from site_api.market_sources import MarketBarPayload, MarketInstrumentPayload, fetch_market_records
from site_api.sequence_sources import SequenceRecordPayload, fetch_gene_sequences, fetch_protein_sequences
from site_api.sequencing_run_sources import fetch_ena_sequencing_runs

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
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Knowledge crawl failed: {error}",
        ) from error

    try:
        upsert_knowledge_records(protein_records + literature_records)
        summary = knowledge_summary()
        return {
            "stored": {
                "proteinAnnotation": len(protein_records),
                "literature": len(literature_records),
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
            limit=max(1, min(limit, 200)),
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
