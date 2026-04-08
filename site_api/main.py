from __future__ import annotations

import logging
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen

import psycopg
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from site_api.knowledge_sources import KnowledgeRecordPayload, fetch_pubmed_knowledge, fetch_uniprot_knowledge
from site_api.market_sources import MarketBarPayload, MarketInstrumentPayload, fetch_market_records
from site_api.sequence_sources import SequenceRecordPayload, fetch_gene_sequences, fetch_protein_sequences
from site_api.sequencing_run_sources import SequencingRunPayload, fetch_ena_sequencing_runs


CREATE_INQUIRIES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS site_inquiries (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    organization VARCHAR(160),
    message TEXT NOT NULL,
    source_page VARCHAR(120) NOT NULL DEFAULT 'about_me.html',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

CREATE_SEQUENCE_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS sequence_library (
    id BIGSERIAL PRIMARY KEY,
    sequence_type VARCHAR(16) NOT NULL,
    source_name VARCHAR(32) NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    query_term VARCHAR(160) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    organism VARCHAR(160) NOT NULL,
    sequence TEXT NOT NULL,
    sequence_length INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    record_url TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(sequence_type, source_name, source_id)
);
"""

CREATE_KNOWLEDGE_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS knowledge_library (
    id BIGSERIAL PRIMARY KEY,
    record_type VARCHAR(32) NOT NULL,
    source_name VARCHAR(64) NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    query_term VARCHAR(200) NOT NULL,
    title VARCHAR(500) NOT NULL,
    organism VARCHAR(160) NOT NULL DEFAULT '',
    summary_text TEXT NOT NULL DEFAULT '',
    content_text TEXT NOT NULL DEFAULT '',
    keywords TEXT NOT NULL DEFAULT '',
    record_url TEXT NOT NULL DEFAULT '',
    published_at VARCHAR(64) NOT NULL DEFAULT '',
    raw_payload TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(record_type, source_name, source_id)
);
"""

CREATE_SEQUENCING_RUN_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS sequencing_run_library (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(32) NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    query_term VARCHAR(240) NOT NULL,
    study_accession VARCHAR(64) NOT NULL DEFAULT '',
    experiment_accession VARCHAR(64) NOT NULL DEFAULT '',
    sample_accession VARCHAR(64) NOT NULL DEFAULT '',
    organism VARCHAR(160) NOT NULL DEFAULT '',
    library_strategy VARCHAR(64) NOT NULL DEFAULT '',
    library_source VARCHAR(64) NOT NULL DEFAULT '',
    library_layout VARCHAR(32) NOT NULL DEFAULT '',
    instrument_platform VARCHAR(64) NOT NULL DEFAULT '',
    instrument_model VARCHAR(160) NOT NULL DEFAULT '',
    read_count BIGINT,
    base_count BIGINT,
    fastq_bytes BIGINT,
    published_at VARCHAR(64) NOT NULL DEFAULT '',
    ftp_url TEXT NOT NULL DEFAULT '',
    record_url TEXT NOT NULL DEFAULT '',
    raw_payload TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_name, source_id)
);
"""

CREATE_MARKET_INSTRUMENTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS market_instruments (
    id BIGSERIAL PRIMARY KEY,
    asset_type VARCHAR(16) NOT NULL,
    source_name VARCHAR(32) NOT NULL,
    symbol VARCHAR(64) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    market VARCHAR(64) NOT NULL DEFAULT '',
    currency VARCHAR(16) NOT NULL DEFAULT '',
    exchange_name VARCHAR(120) NOT NULL DEFAULT '',
    reference_url TEXT NOT NULL DEFAULT '',
    metadata_text TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_name, symbol)
);
"""

CREATE_MARKET_PRICE_BARS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS market_price_bars (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(32) NOT NULL,
    symbol VARCHAR(64) NOT NULL,
    asset_type VARCHAR(16) NOT NULL,
    market VARCHAR(64) NOT NULL DEFAULT '',
    contract_month VARCHAR(16) NOT NULL DEFAULT '',
    trade_date DATE NOT NULL,
    open_price DOUBLE PRECISION,
    high_price DOUBLE PRECISION,
    low_price DOUBLE PRECISION,
    close_price DOUBLE PRECISION,
    settlement_price DOUBLE PRECISION,
    volume BIGINT,
    turnover DOUBLE PRECISION,
    open_interest BIGINT,
    change_value DOUBLE PRECISION,
    raw_payload TEXT NOT NULL DEFAULT '',
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

ALTER_MARKET_PRICE_BARS_ADD_CONTRACT_MONTH_SQL = """
ALTER TABLE market_price_bars
ADD COLUMN IF NOT EXISTS contract_month VARCHAR(16) NOT NULL DEFAULT '';
"""

DROP_LEGACY_MARKET_PRICE_BARS_UNIQUE_SQL = """
DO $$
DECLARE legacy_constraint_name text;
BEGIN
        SELECT con.conname
            INTO legacy_constraint_name
            FROM pg_constraint AS con
            JOIN pg_class AS rel ON rel.oid = con.conrelid
            JOIN pg_namespace AS ns ON ns.oid = rel.relnamespace
         WHERE rel.relname = 'market_price_bars'
             AND ns.nspname = current_schema()
             AND con.contype = 'u'
             AND ARRAY(
                        SELECT att.attname
                            FROM unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord)
                            JOIN pg_attribute AS att
                                ON att.attrelid = rel.oid
                             AND att.attnum = cols.attnum
                         ORDER BY cols.ord
             ) = ARRAY['source_name', 'symbol', 'trade_date'];

        IF legacy_constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE market_price_bars DROP CONSTRAINT %I', legacy_constraint_name);
        END IF;
END $$;
"""

CREATE_MARKET_PRICE_BARS_UNIQUE_INDEX_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS market_price_bars_source_symbol_contract_trade_date_uidx
        ON market_price_bars (source_name, symbol, contract_month, trade_date);
"""

UPSERT_SEQUENCE_LIBRARY_SQL = """
INSERT INTO sequence_library (
    sequence_type,
    source_name,
    source_id,
    query_term,
    display_name,
    organism,
    sequence,
    sequence_length,
    description,
    record_url,
    fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (sequence_type, source_name, source_id)
DO UPDATE SET
    query_term = EXCLUDED.query_term,
    display_name = EXCLUDED.display_name,
    organism = EXCLUDED.organism,
    sequence = EXCLUDED.sequence,
    sequence_length = EXCLUDED.sequence_length,
    description = EXCLUDED.description,
    record_url = EXCLUDED.record_url,
    fetched_at = NOW();
"""

UPSERT_KNOWLEDGE_LIBRARY_SQL = """
INSERT INTO knowledge_library (
    record_type,
    source_name,
    source_id,
    query_term,
    title,
    organism,
    summary_text,
    content_text,
    keywords,
    record_url,
    published_at,
    raw_payload,
    fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (record_type, source_name, source_id)
DO UPDATE SET
    query_term = EXCLUDED.query_term,
    title = EXCLUDED.title,
    organism = EXCLUDED.organism,
    summary_text = EXCLUDED.summary_text,
    content_text = EXCLUDED.content_text,
    keywords = EXCLUDED.keywords,
    record_url = EXCLUDED.record_url,
    published_at = EXCLUDED.published_at,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

UPSERT_SEQUENCING_RUN_LIBRARY_SQL = """
INSERT INTO sequencing_run_library (
    source_name,
    source_id,
    query_term,
    study_accession,
    experiment_accession,
    sample_accession,
    organism,
    library_strategy,
    library_source,
    library_layout,
    instrument_platform,
    instrument_model,
    read_count,
    base_count,
    fastq_bytes,
    published_at,
    ftp_url,
    record_url,
    raw_payload,
    fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, source_id)
DO UPDATE SET
    query_term = EXCLUDED.query_term,
    study_accession = EXCLUDED.study_accession,
    experiment_accession = EXCLUDED.experiment_accession,
    sample_accession = EXCLUDED.sample_accession,
    organism = EXCLUDED.organism,
    library_strategy = EXCLUDED.library_strategy,
    library_source = EXCLUDED.library_source,
    library_layout = EXCLUDED.library_layout,
    instrument_platform = EXCLUDED.instrument_platform,
    instrument_model = EXCLUDED.instrument_model,
    read_count = EXCLUDED.read_count,
    base_count = EXCLUDED.base_count,
    fastq_bytes = EXCLUDED.fastq_bytes,
    published_at = EXCLUDED.published_at,
    ftp_url = EXCLUDED.ftp_url,
    record_url = EXCLUDED.record_url,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

UPSERT_MARKET_INSTRUMENTS_SQL = """
INSERT INTO market_instruments (
    asset_type,
    source_name,
    symbol,
    display_name,
    market,
    currency,
    exchange_name,
    reference_url,
    metadata_text,
    fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, symbol)
DO UPDATE SET
    asset_type = EXCLUDED.asset_type,
    display_name = EXCLUDED.display_name,
    market = EXCLUDED.market,
    currency = EXCLUDED.currency,
    exchange_name = EXCLUDED.exchange_name,
    reference_url = EXCLUDED.reference_url,
    metadata_text = EXCLUDED.metadata_text,
    fetched_at = NOW();
"""

UPSERT_MARKET_PRICE_BARS_SQL = """
INSERT INTO market_price_bars (
    source_name,
    symbol,
    asset_type,
    market,
    contract_month,
    trade_date,
    open_price,
    high_price,
    low_price,
    close_price,
    settlement_price,
    volume,
    turnover,
    open_interest,
    change_value,
    raw_payload,
    fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, symbol, contract_month, trade_date)
DO UPDATE SET
    asset_type = EXCLUDED.asset_type,
    market = EXCLUDED.market,
    contract_month = EXCLUDED.contract_month,
    open_price = EXCLUDED.open_price,
    high_price = EXCLUDED.high_price,
    low_price = EXCLUDED.low_price,
    close_price = EXCLUDED.close_price,
    settlement_price = EXCLUDED.settlement_price,
    volume = EXCLUDED.volume,
    turnover = EXCLUDED.turnover,
    open_interest = EXCLUDED.open_interest,
    change_value = EXCLUDED.change_value,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""


logger = logging.getLogger(__name__)
SCHEMA_READY = False
LAST_DATABASE_ERROR = ""


class InquiryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    organization: str = Field(default="", max_length=160)
    message: str = Field(min_length=10, max_length=4000)
    source_page: str = Field(default="about_me.html", max_length=120)
    website: str = Field(default="", max_length=200)

    @field_validator("name", "email", "organization", "message", "source_page", mode="before")
    @classmethod
    def strip_strings(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if "@" not in value or value.endswith("@"):
            raise ValueError("Please provide a valid email address.")
        return value


class SequenceSyncRequest(BaseModel):
    protein_query: str = Field(default="kinase")
    gene_symbols: list[str] = Field(default_factory=lambda: ["TP53", "BRCA1", "EGFR", "APOE"])
    species: str = Field(default="homo_sapiens")
    limit: int = Field(default=4, ge=1, le=8)

    @field_validator("protein_query", "species", mode="before")
    @classmethod
    def strip_scalar_fields(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @field_validator("gene_symbols", mode="before")
    @classmethod
    def normalize_gene_symbols(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            value = value.split(",")
        cleaned: list[str] = []
        for item in value:
            normalized = str(item).strip().upper()
            if normalized and normalized not in cleaned:
                cleaned.append(normalized)
        return cleaned[:8]


class KnowledgeSyncRequest(BaseModel):
    protein_query: str = Field(default="kinase")
    literature_query: str = Field(default="kinase AND cancer")
    limit: int = Field(default=4, ge=1, le=8)

    @field_validator("protein_query", "literature_query", mode="before")
    @classmethod
    def strip_query_fields(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class SequencingRunSyncRequest(BaseModel):
    query: str = Field(default='tax_name("Homo sapiens") AND library_strategy="RNA-Seq"')
    limit: int = Field(default=4, ge=1, le=12)

    @field_validator("query", mode="before")
    @classmethod
    def strip_query(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class MarketSyncRequest(BaseModel):
    stock_symbols: list[str] = Field(default_factory=lambda: ["2330", "2317"])
    etf_symbols: list[str] = Field(default_factory=lambda: ["0050", "0056"])
    futures_symbols: list[str] = Field(default_factory=lambda: ["ES=F", "NQ=F"])
    twse_months: int = Field(default=3, ge=1, le=12)
    yahoo_range: str = Field(default="3mo")

    @field_validator("stock_symbols", "etf_symbols", "futures_symbols", mode="before")
    @classmethod
    def normalize_symbol_list(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            value = value.split(",")

        cleaned: list[str] = []
        for item in value:
            normalized = str(item or "").strip().upper()
            if normalized and normalized not in cleaned:
                cleaned.append(normalized)
        return cleaned[:20]

    @field_validator("yahoo_range", mode="before")
    @classmethod
    def validate_yahoo_range(cls, value: Any) -> str:
        normalized = str(value or "3mo").strip().lower() or "3mo"
        allowed_ranges = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}
        if normalized not in allowed_ranges:
            raise ValueError("yahoo_range must be one of 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max.")
        return normalized


def gc_content(sequence: str) -> float:
    if not sequence:
        return 0.0
    gc_count = sum(1 for base in sequence.upper() if base in {"G", "C"})
    return round((gc_count / len(sequence)) * 100, 2)


def serialize_sequence_row(row: tuple[Any, ...]) -> dict[str, Any]:
    (
        row_id,
        sequence_type,
        source_name,
        source_id,
        query_term,
        display_name,
        organism,
        sequence,
        sequence_length,
        description,
        record_url,
        fetched_at,
    ) = row

    return {
        "id": int(row_id),
        "sequenceType": sequence_type,
        "sourceName": source_name,
        "sourceId": source_id,
        "queryTerm": query_term,
        "displayName": display_name,
        "organism": organism,
        "sequence": sequence,
        "sequenceLength": int(sequence_length),
        "description": description,
        "recordUrl": record_url,
        "fetchedAt": fetched_at.isoformat() if fetched_at else None,
        "gcContent": gc_content(sequence) if sequence_type == "gene" else None,
    }


def fetch_sequence_rows(sequence_type: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
    query = """
        SELECT id, sequence_type, source_name, source_id, query_term, display_name,
               organism, sequence, sequence_length, description, record_url, fetched_at
        FROM sequence_library
    """
    params: list[Any] = []

    if sequence_type:
        query += " WHERE sequence_type = %s"
        params.append(sequence_type)

    query += " ORDER BY fetched_at DESC, id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            rows = cursor.fetchall()

    return [serialize_sequence_row(row) for row in rows]


def sequence_summary() -> dict[str, Any]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT sequence_type, COUNT(*), MAX(fetched_at)
                FROM sequence_library
                GROUP BY sequence_type
                ORDER BY sequence_type;
                """
            )
            rows = cursor.fetchall()

    counts = {"protein": 0, "gene": 0}
    latest_fetched_at = None
    for sequence_type, count, fetched_at in rows:
        counts[str(sequence_type)] = int(count or 0)
        if fetched_at and (latest_fetched_at is None or fetched_at > latest_fetched_at):
            latest_fetched_at = fetched_at

    return {
        "proteinCount": counts["protein"],
        "geneCount": counts["gene"],
        "latestFetchedAt": latest_fetched_at.isoformat() if latest_fetched_at else None,
    }


def serialize_knowledge_row(row: tuple[Any, ...]) -> dict[str, Any]:
    (
        row_id,
        record_type,
        source_name,
        source_id,
        query_term,
        title,
        organism,
        summary_text,
        content_text,
        keywords,
        record_url,
        published_at,
        fetched_at,
    ) = row

    keyword_items = [item.strip() for item in str(keywords or "").split(",") if item.strip()]
    return {
        "id": int(row_id),
        "recordType": record_type,
        "sourceName": source_name,
        "sourceId": source_id,
        "queryTerm": query_term,
        "title": title,
        "organism": organism,
        "summaryText": summary_text,
        "contentText": content_text,
        "keywords": keyword_items,
        "recordUrl": record_url,
        "publishedAt": published_at or None,
        "fetchedAt": fetched_at.isoformat() if fetched_at else None,
    }


def fetch_knowledge_rows(
    record_type: str | None = None,
    source_name: str | None = None,
    search_query: str | None = None,
    limit: int = 8,
) -> list[dict[str, Any]]:
    query = """
        SELECT id, record_type, source_name, source_id, query_term, title,
               organism, summary_text, content_text, keywords, record_url,
               published_at, fetched_at
        FROM knowledge_library
    """
    conditions: list[str] = []
    params: list[Any] = []

    if record_type:
        conditions.append("record_type = %s")
        params.append(record_type)

    if source_name:
        conditions.append("source_name = %s")
        params.append(source_name)

    if search_query:
        like_query = f"%{search_query}%"
        conditions.append("(query_term ILIKE %s OR title ILIKE %s OR summary_text ILIKE %s OR content_text ILIKE %s OR keywords ILIKE %s)")
        params.extend([like_query, like_query, like_query, like_query, like_query])

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY fetched_at DESC, id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            rows = cursor.fetchall()

    return [serialize_knowledge_row(row) for row in rows]


def knowledge_summary() -> dict[str, Any]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT record_type, COUNT(*), MAX(fetched_at)
                FROM knowledge_library
                GROUP BY record_type
                ORDER BY record_type;
                """
            )
            rows = cursor.fetchall()

    counts = {"protein_annotation": 0, "literature": 0}
    latest_fetched_at = None
    for record_type, count, fetched_at in rows:
        counts[str(record_type)] = int(count or 0)
        if fetched_at and (latest_fetched_at is None or fetched_at > latest_fetched_at):
            latest_fetched_at = fetched_at

    return {
        "proteinAnnotationCount": counts["protein_annotation"],
        "literatureCount": counts["literature"],
        "latestFetchedAt": latest_fetched_at.isoformat() if latest_fetched_at else None,
    }


def fetch_sequence_rows_for_search(search_query: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
    query = """
        SELECT id, sequence_type, source_name, source_id, query_term, display_name,
               organism, sequence, sequence_length, description, record_url, fetched_at
        FROM sequence_library
    """
    params: list[Any] = []

    if search_query:
        like_query = f"%{search_query}%"
        query += " WHERE (query_term ILIKE %s OR display_name ILIKE %s OR organism ILIKE %s OR source_id ILIKE %s OR description ILIKE %s)"
        params.extend([like_query, like_query, like_query, like_query, like_query])

    query += " ORDER BY fetched_at DESC, id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            rows = cursor.fetchall()

    return [serialize_sequence_row(row) for row in rows]


def chunk_text_for_rag(text: str, chunk_size: int = 900, chunk_overlap: int = 140) -> list[str]:
    normalized = " ".join(str(text or "").split())
    if not normalized:
        return []

    normalized_chunk_size = max(240, min(chunk_size, 2200))
    normalized_overlap = max(0, min(chunk_overlap, normalized_chunk_size // 3))
    if len(normalized) <= normalized_chunk_size:
        return [normalized]

    chunks: list[str] = []
    start = 0
    text_length = len(normalized)
    while start < text_length:
        end = min(start + normalized_chunk_size, text_length)
        if end < text_length:
            boundary_candidates = [
                normalized.rfind(". ", start, end),
                normalized.rfind("; ", start, end),
                normalized.rfind("。", start, end),
                normalized.rfind(" ", start, end),
            ]
            boundary = max(boundary_candidates)
            if boundary > start + normalized_chunk_size // 2:
                end = boundary + 1

        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= text_length:
            break

        next_start = max(end - normalized_overlap, start + 1)
        if next_start <= start:
            break
        start = next_start

    return chunks


def build_knowledge_rag_documents(
    records: list[dict[str, Any]],
    chunk_size: int = 900,
    chunk_overlap: int = 140,
) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for record in records:
        source_name = str(record.get("sourceName") or "source").strip()
        source_id = str(record.get("sourceId") or "unknown").strip()
        document_id = f"knowledge:{source_name.lower().replace(' ', '_')}:{source_id}"
        base_text = record.get("contentText") or record.get("summaryText") or record.get("title") or ""
        preamble = f"Title: {record.get('title') or 'Untitled'}. Source: {source_name}."
        if record.get("organism"):
            preamble += f" Organism: {record['organism']}."
        if record.get("queryTerm"):
            preamble += f" Query: {record['queryTerm']}."

        chunks = chunk_text_for_rag(f"{preamble} {base_text}", chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        for index, chunk in enumerate(chunks):
            documents.append(
                {
                    "documentId": document_id,
                    "chunkId": f"{document_id}:{index}",
                    "sourceKind": "knowledge",
                    "recordType": record.get("recordType"),
                    "title": record.get("title"),
                    "text": chunk,
                    "embeddingHint": "text-embedding",
                    "metadata": {
                        "sourceName": source_name,
                        "sourceId": source_id,
                        "queryTerm": record.get("queryTerm"),
                        "organism": record.get("organism"),
                        "recordUrl": record.get("recordUrl"),
                        "publishedAt": record.get("publishedAt"),
                        "keywords": record.get("keywords") or [],
                    },
                }
            )

    return documents


def build_sequence_rag_documents(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for record in records:
        sequence_type = str(record.get("sequenceType") or "sequence").strip()
        source_name = str(record.get("sourceName") or "source").strip()
        source_id = str(record.get("sourceId") or "unknown").strip()
        document_id = f"sequence:{sequence_type}:{source_id}"
        sequence_value = str(record.get("sequence") or "").strip().upper()
        sequence_preview = sequence_value[:24] + ("..." if len(sequence_value) > 24 else "")
        text = (
            f"{sequence_type.capitalize()} sequence record for {record.get('displayName') or source_id}. "
            f"Organism: {record.get('organism') or 'Unknown'}. "
            f"Source: {source_name} ({source_id}). "
            f"Length: {record.get('sequenceLength') or 0}. "
            f"Description: {record.get('description') or 'No description available.'} "
            f"Query term: {record.get('queryTerm') or '-'}"
        )

        documents.append(
            {
                "documentId": document_id,
                "chunkId": f"{document_id}:0",
                "sourceKind": "sequence",
                "recordType": f"{sequence_type}_sequence",
                "title": record.get("displayName"),
                "text": text,
                "embeddingHint": "protein-language-model" if sequence_type == "protein" else "genome-language-model",
                "metadata": {
                    "sourceName": source_name,
                    "sourceId": source_id,
                    "queryTerm": record.get("queryTerm"),
                    "organism": record.get("organism"),
                    "sequenceLength": record.get("sequenceLength"),
                    "sequencePreview": sequence_preview,
                    "sequence": sequence_value,
                    "recordUrl": record.get("recordUrl"),
                    "fetchedAt": record.get("fetchedAt"),
                    "description": record.get("description"),
                },
            }
        )

    return documents


def upsert_sequence_records(records: list[SequenceRecordPayload]) -> None:
    if not records:
        return

    with get_connection() as connection:
        with connection.cursor() as cursor:
            for record in records:
                cursor.execute(
                    UPSERT_SEQUENCE_LIBRARY_SQL,
                    (
                        record.sequence_type,
                        record.source_name,
                        record.source_id,
                        record.query_term,
                        record.display_name,
                        record.organism,
                        record.sequence,
                        record.sequence_length,
                        record.description,
                        record.record_url,
                    ),
                )
        connection.commit()


def upsert_knowledge_records(records: list[KnowledgeRecordPayload]) -> None:
    if not records:
        return

    with get_connection() as connection:
        with connection.cursor() as cursor:
            for record in records:
                cursor.execute(
                    UPSERT_KNOWLEDGE_LIBRARY_SQL,
                    (
                        record.record_type,
                        record.source_name,
                        record.source_id,
                        record.query_term,
                        record.title,
                        record.organism,
                        record.summary_text,
                        record.content_text,
                        record.keywords,
                        record.record_url,
                        record.published_at,
                        record.raw_payload,
                    ),
                )
        connection.commit()


def serialize_sequencing_run_row(row: tuple[Any, ...]) -> dict[str, Any]:
    (
        row_id,
        source_name,
        source_id,
        query_term,
        study_accession,
        experiment_accession,
        sample_accession,
        organism,
        library_strategy,
        library_source,
        library_layout,
        instrument_platform,
        instrument_model,
        read_count,
        base_count,
        fastq_bytes,
        published_at,
        ftp_url,
        record_url,
        fetched_at,
    ) = row

    return {
        "id": int(row_id),
        "sourceName": source_name,
        "sourceId": source_id,
        "queryTerm": query_term,
        "studyAccession": study_accession,
        "experimentAccession": experiment_accession,
        "sampleAccession": sample_accession,
        "organism": organism,
        "libraryStrategy": library_strategy,
        "librarySource": library_source,
        "libraryLayout": library_layout,
        "instrumentPlatform": instrument_platform,
        "instrumentModel": instrument_model,
        "readCount": int(read_count) if read_count is not None else None,
        "baseCount": int(base_count) if base_count is not None else None,
        "fastqBytes": int(fastq_bytes) if fastq_bytes is not None else None,
        "publishedAt": published_at or None,
        "ftpUrl": ftp_url or None,
        "recordUrl": record_url or None,
        "fetchedAt": fetched_at.isoformat() if fetched_at else None,
    }


def fetch_sequencing_run_rows(query: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
    sql = """
        SELECT id, source_name, source_id, query_term, study_accession,
               experiment_accession, sample_accession, organism, library_strategy,
               library_source, library_layout, instrument_platform, instrument_model,
               read_count, base_count, fastq_bytes, published_at, ftp_url,
               record_url, fetched_at
        FROM sequencing_run_library
    """
    params: list[Any] = []

    if query:
        like_query = f"%{query}%"
        sql += " WHERE (query_term ILIKE %s OR source_id ILIKE %s OR study_accession ILIKE %s OR sample_accession ILIKE %s OR organism ILIKE %s OR library_strategy ILIKE %s)"
        params.extend([like_query, like_query, like_query, like_query, like_query, like_query])

    sql += " ORDER BY fetched_at DESC, id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall()

    return [serialize_sequencing_run_row(row) for row in rows]


def sequencing_run_summary() -> dict[str, Any]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*), COUNT(DISTINCT organism), COUNT(DISTINCT study_accession), MAX(fetched_at)
                FROM sequencing_run_library;
                """
            )
            total_runs, organism_count, study_count, latest_fetched_at = cursor.fetchone()

    return {
        "runCount": int(total_runs or 0),
        "organismCount": int(organism_count or 0),
        "studyCount": int(study_count or 0),
        "latestFetchedAt": latest_fetched_at.isoformat() if latest_fetched_at else None,
    }


def upsert_sequencing_runs(records: list[SequencingRunPayload]) -> None:
    if not records:
        return

    with get_connection() as connection:
        with connection.cursor() as cursor:
            for record in records:
                cursor.execute(
                    UPSERT_SEQUENCING_RUN_LIBRARY_SQL,
                    (
                        record.source_name,
                        record.source_id,
                        record.query_term,
                        record.study_accession,
                        record.experiment_accession,
                        record.sample_accession,
                        record.organism,
                        record.library_strategy,
                        record.library_source,
                        record.library_layout,
                        record.instrument_platform,
                        record.instrument_model,
                        record.read_count,
                        record.base_count,
                        record.fastq_bytes,
                        record.published_at,
                        record.ftp_url,
                        record.record_url,
                        record.raw_payload,
                    ),
                )
        connection.commit()


def serialize_market_instrument_row(row: tuple[Any, ...]) -> dict[str, Any]:
    (
        row_id,
        asset_type,
        source_name,
        symbol,
        display_name,
        market,
        currency,
        exchange_name,
        reference_url,
        metadata_text,
        fetched_at,
    ) = row

    return {
        "id": int(row_id),
        "assetType": asset_type,
        "sourceName": source_name,
        "symbol": symbol,
        "displayName": display_name,
        "market": market,
        "currency": currency,
        "exchangeName": exchange_name,
        "referenceUrl": reference_url,
        "metadataText": metadata_text,
        "fetchedAt": fetched_at.isoformat() if fetched_at else None,
    }


def fetch_market_instrument_rows(
    asset_type: str | None = None,
    query: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    sql = """
        SELECT id, asset_type, source_name, symbol, display_name, market,
               currency, exchange_name, reference_url, metadata_text, fetched_at
        FROM market_instruments
    """
    conditions: list[str] = []
    params: list[Any] = []

    if asset_type:
        conditions.append("asset_type = %s")
        params.append(asset_type)

    if query:
        like_query = f"%{query}%"
        conditions.append("(symbol ILIKE %s OR display_name ILIKE %s OR market ILIKE %s OR exchange_name ILIKE %s)")
        params.extend([like_query, like_query, like_query, like_query])

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " ORDER BY fetched_at DESC, id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall()

    return [serialize_market_instrument_row(row) for row in rows]


def serialize_market_bar_row(row: tuple[Any, ...]) -> dict[str, Any]:
    (
        row_id,
        source_name,
        symbol,
        display_name,
        asset_type,
        market,
        contract_month,
        trade_date,
        open_price,
        high_price,
        low_price,
        close_price,
        settlement_price,
        volume,
        turnover,
        open_interest,
        change_value,
        fetched_at,
    ) = row

    return {
        "id": int(row_id),
        "sourceName": source_name,
        "symbol": symbol,
        "displayName": display_name,
        "assetType": asset_type,
        "market": market,
        "contractMonth": contract_month or None,
        "tradeDate": trade_date.isoformat() if trade_date else None,
        "open": float(open_price) if open_price is not None else None,
        "high": float(high_price) if high_price is not None else None,
        "low": float(low_price) if low_price is not None else None,
        "close": float(close_price) if close_price is not None else None,
        "settlement": float(settlement_price) if settlement_price is not None else None,
        "volume": int(volume) if volume is not None else None,
        "turnover": float(turnover) if turnover is not None else None,
        "openInterest": int(open_interest) if open_interest is not None else None,
        "changeValue": float(change_value) if change_value is not None else None,
        "fetchedAt": fetched_at.isoformat() if fetched_at else None,
    }


def fetch_market_bar_rows(
    asset_type: str | None = None,
    symbol: str | None = None,
    contract_month: str | None = None,
    limit: int = 60,
) -> list[dict[str, Any]]:
    sql = """
        SELECT bars.id, bars.source_name, bars.symbol,
               COALESCE(inst.display_name, bars.symbol) AS display_name,
               bars.asset_type, bars.market, bars.contract_month, bars.trade_date, bars.open_price,
               bars.high_price, bars.low_price, bars.close_price, bars.settlement_price,
               bars.volume, bars.turnover, bars.open_interest, bars.change_value,
               bars.fetched_at
        FROM market_price_bars AS bars
        LEFT JOIN market_instruments AS inst
               ON inst.source_name = bars.source_name AND inst.symbol = bars.symbol
    """
    conditions: list[str] = []
    params: list[Any] = []

    if asset_type:
        conditions.append("bars.asset_type = %s")
        params.append(asset_type)

    if symbol:
        conditions.append("bars.symbol = %s")
        params.append(symbol)

    if contract_month:
        conditions.append("bars.contract_month = %s")
        params.append(contract_month)

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " ORDER BY bars.trade_date DESC, bars.contract_month DESC, bars.fetched_at DESC LIMIT %s"
    params.append(limit)

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall()

    return [serialize_market_bar_row(row) for row in rows]


def market_summary() -> dict[str, Any]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT asset_type, COUNT(*), MAX(fetched_at)
                FROM market_instruments
                GROUP BY asset_type
                ORDER BY asset_type;
                """
            )
            instrument_rows = cursor.fetchall()
            cursor.execute(
                """
                SELECT COUNT(*), COUNT(DISTINCT NULLIF(contract_month, '')), MAX(trade_date), MAX(fetched_at)
                FROM market_price_bars;
                """
            )
            bar_count, contract_month_count, latest_trade_date, latest_fetched_at = cursor.fetchone()

    counts = {"stock": 0, "etf": 0, "futures": 0}
    latest_instrument_fetched_at = None
    for asset_type, count, fetched_at in instrument_rows:
        counts[str(asset_type)] = int(count or 0)
        if fetched_at and (latest_instrument_fetched_at is None or fetched_at > latest_instrument_fetched_at):
            latest_instrument_fetched_at = fetched_at

    return {
        "instrumentCounts": counts,
        "totalInstruments": sum(counts.values()),
        "barCount": int(bar_count or 0),
        "contractMonthCount": int(contract_month_count or 0),
        "latestTradeDate": latest_trade_date.isoformat() if latest_trade_date else None,
        "latestFetchedAt": (
            latest_fetched_at.isoformat()
            if latest_fetched_at
            else latest_instrument_fetched_at.isoformat() if latest_instrument_fetched_at else None
        ),
    }


def upsert_market_instruments(records: list[MarketInstrumentPayload]) -> None:
    if not records:
        return

    with get_connection() as connection:
        with connection.cursor() as cursor:
            for record in records:
                cursor.execute(
                    UPSERT_MARKET_INSTRUMENTS_SQL,
                    (
                        record.asset_type,
                        record.source_name,
                        record.symbol,
                        record.display_name,
                        record.market,
                        record.currency,
                        record.exchange_name,
                        record.reference_url,
                        record.metadata_text,
                    ),
                )
        connection.commit()


def upsert_market_bars(records: list[MarketBarPayload]) -> None:
    if not records:
        return

    with get_connection() as connection:
        with connection.cursor() as cursor:
            for record in records:
                cursor.execute(
                    UPSERT_MARKET_PRICE_BARS_SQL,
                    (
                        record.source_name,
                        record.symbol,
                        record.asset_type,
                        record.market,
                        record.contract_month,
                        record.trade_date,
                        record.open_price,
                        record.high_price,
                        record.low_price,
                        record.close_price,
                        record.settlement_price,
                        record.volume,
                        record.turnover,
                        record.open_interest,
                        record.change_value,
                        record.raw_payload,
                    ),
                )
        connection.commit()


def delete_sequence_record(record_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM sequence_library
                WHERE id = %s
                RETURNING id, sequence_type, display_name, source_name, source_id;
                """,
                (record_id,),
            )
            row = cursor.fetchone()
        connection.commit()

    if not row:
        return None

    deleted_id, sequence_type, display_name, source_name, source_id = row
    return {
        "id": int(deleted_id),
        "sequenceType": sequence_type,
        "displayName": display_name,
        "sourceName": source_name,
        "sourceId": source_id,
    }


DATABASE_URL_ENV_KEYS = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "DATABASE_URL_NEON",
    "DATABASE_URL_SUPABASE",
    "DATABASE_URL_COCKROACH",
    "DATABASE_URL_AIVEN",
    "DATABASE_URL_RAILWAY",
]


def get_database_url() -> str:
    for key in DATABASE_URL_ENV_KEYS:
        value = os.getenv(key, "").strip()
        if value:
            return value
    return ""


def get_all_database_urls() -> list[str]:
    urls: list[str] = []
    for key in DATABASE_URL_ENV_KEYS:
        value = os.getenv(key, "").strip()
        if value and value not in urls:
            urls.append(value)
    return urls


def _with_query_params(url: str, params: dict[str, str]) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update(params)
    return urlunparse(parsed._replace(query=urlencode(query)))


_PG_KNOWN_PARAMS = frozenset({
    "sslmode", "connect_timeout", "application_name", "options",
    "keepalives", "keepalives_idle", "keepalives_interval", "keepalives_count",
    "target_session_attrs", "channel_binding",
})


def _sanitize_database_url(url: str) -> str:
    """Remove non-PostgreSQL query parameters from a database URL."""
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    cleaned = {k: v for k, v in query.items() if k in _PG_KNOWN_PARAMS}
    return urlunparse(parsed._replace(query=urlencode(cleaned)))


def _expand_url_candidates(database_url: str) -> list[str]:
    candidates: list[str] = []

    def append_candidate(candidate: str) -> None:
        normalized = candidate.strip()
        if normalized and normalized not in candidates:
            candidates.append(normalized)

    sanitized = _sanitize_database_url(database_url)
    append_candidate(sanitized)
    append_candidate(_with_query_params(sanitized, {"connect_timeout": "5"}))

    parsed = urlparse(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if "sslmode" not in query:
        append_candidate(_with_query_params(database_url, {"sslmode": "require", "connect_timeout": "5"}))

    return candidates


def get_database_url_candidates() -> list[str]:
    all_urls = get_all_database_urls()
    if not all_urls:
        return []

    candidates: list[str] = []
    for url in all_urls:
        for candidate in _expand_url_candidates(url):
            if candidate not in candidates:
                candidates.append(candidate)
    return candidates


def get_connection() -> psycopg.Connection:
    global LAST_DATABASE_ERROR

    last_error: Exception | None = None
    for candidate in get_database_url_candidates():
        try:
            connection = psycopg.connect(candidate)
            LAST_DATABASE_ERROR = ""
            return connection
        except psycopg.Error as error:
            last_error = error
            LAST_DATABASE_ERROR = str(error)

    if last_error is not None:
        raise last_error

    raise psycopg.OperationalError("DATABASE_URL is not configured.")


def get_allowed_origins() -> list[str]:
    raw_value = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if not raw_value:
        return ["*"]
    return [item.strip() for item in raw_value.split(",") if item.strip()]


app = FastAPI(title="JT Lai Portfolio API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


def ensure_schema() -> bool:
    global SCHEMA_READY

    if SCHEMA_READY:
        return True

    database_url = get_database_url()
    if not database_url:
        return False

    try:
        with get_connection() as connection:
            connection.execute(CREATE_INQUIRIES_TABLE_SQL)
            connection.execute(CREATE_SEQUENCE_LIBRARY_TABLE_SQL)
            connection.execute(CREATE_KNOWLEDGE_LIBRARY_TABLE_SQL)
            connection.execute(CREATE_SEQUENCING_RUN_LIBRARY_TABLE_SQL)
            connection.execute(CREATE_MARKET_INSTRUMENTS_TABLE_SQL)
            connection.execute(CREATE_MARKET_PRICE_BARS_TABLE_SQL)
            connection.execute(ALTER_MARKET_PRICE_BARS_ADD_CONTRACT_MONTH_SQL)
            connection.execute(DROP_LEGACY_MARKET_PRICE_BARS_UNIQUE_SQL)
            connection.execute(CREATE_MARKET_PRICE_BARS_UNIQUE_INDEX_SQL)
            connection.commit()
        SCHEMA_READY = True
        return True
    except psycopg.Error as error:
        logger.warning("Database schema is not ready yet: %s", error)
        return False


def database_available() -> bool:
    database_url = get_database_url()
    if not database_url:
        return False

    try:
        with get_connection() as connection:
            connection.execute("SELECT 1;")
        return True
    except psycopg.Error:
        return False


def check_all_databases() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for key in DATABASE_URL_ENV_KEYS:
        value = os.getenv(key, "").strip()
        if not value:
            continue
        parsed = urlparse(value)
        host = parsed.hostname or "unknown"
        entry: dict[str, Any] = {"envKey": key, "host": host, "connected": False, "error": None}
        sanitized_value = _sanitize_database_url(value)
        try:
            conn = psycopg.connect(_with_query_params(sanitized_value, {"sslmode": "require", "connect_timeout": "5"}))
            conn.execute("SELECT 1;")
            conn.close()
            entry["connected"] = True
        except psycopg.Error as error:
            try:
                conn = psycopg.connect(_with_query_params(sanitized_value, {"connect_timeout": "5"}))
                conn.execute("SELECT 1;")
                conn.close()
                entry["connected"] = True
            except psycopg.Error as error2:
                entry["error"] = str(error2)
        results.append(entry)
    return results


def _is_valid_structure_payload(text: str, format_name: str) -> bool:
    if not text:
        return False

    normalized_format = format_name.strip().lower()
    if normalized_format == "pdb":
        return "ATOM" in text or "HETATM" in text

    return "_atom_site" in text or "atom_site." in text


def fetch_structure_payload(pdb_id: str) -> dict[str, Any]:
    normalized_pdb_id = "".join(character for character in str(pdb_id or "").upper() if character.isalnum())
    if len(normalized_pdb_id) < 4 or len(normalized_pdb_id) > 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="pdb_id must be 4 to 6 alphanumeric characters.",
        )

    sources = [
        {
            "url": f"https://files.rcsb.org/download/{normalized_pdb_id}.pdb",
            "format": "pdb",
        },
        {
            "url": f"https://files.rcsb.org/view/{normalized_pdb_id}.pdb",
            "format": "pdb",
        },
        {
            "url": f"https://files.rcsb.org/download/{normalized_pdb_id}.cif",
            "format": "cif",
        },
        {
            "url": f"https://models.rcsb.org/v1/{normalized_pdb_id}/full?format=cif",
            "format": "cif",
        },
    ]

    attempt_errors: list[str] = []
    request_headers = {
        "User-Agent": "donttalk-api/1.0",
        "Accept": "text/plain, chemical/x-cif, */*",
    }

    for source in sources:
        try:
            request = Request(source["url"], headers=request_headers)
            with urlopen(request, timeout=15) as response:
                raw_body = response.read()
            structure_text = raw_body.decode("utf-8", errors="replace")
            if _is_valid_structure_payload(structure_text, source["format"]):
                return {
                    "pdbId": normalized_pdb_id,
                    "format": source["format"],
                    "text": structure_text,
                    "sourceUrl": source["url"],
                }

            attempt_errors.append(f"invalid payload @ {source['url']}")
        except HTTPError as error:
            attempt_errors.append(f"HTTP {error.code} @ {source['url']}")
        except URLError as error:
            attempt_errors.append(f"URL error @ {source['url']}: {error.reason}")
        except Exception as error:  # pragma: no cover - defensive path for remote services
            attempt_errors.append(f"{type(error).__name__} @ {source['url']}: {error}")

    logger.warning("Failed to fetch structure for %s: %s", normalized_pdb_id, " | ".join(attempt_errors))
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Unable to retrieve structure from upstream sources for {normalized_pdb_id}.",
    )


@app.on_event("startup")
def startup() -> None:
    ensure_schema()


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "donttalk-api",
        "databaseConfigured": bool(get_database_url()),
        "connected": database_available(),
    }


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/db/status")
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


@app.get("/api/structures/pdb/{pdb_id}")
def get_pdb_structure(pdb_id: str) -> dict[str, Any]:
    return fetch_structure_payload(pdb_id)


@app.get("/api/knowledge/summary")
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


@app.get("/api/knowledge")
def list_knowledge(
    record_type: str | None = None,
    source_name: str | None = None,
    query: str | None = None,
    limit: int = 8,
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
        )
        summary = knowledge_summary()
        return {
            "records": records,
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


@app.post("/api/knowledge/sync")
def sync_knowledge(payload: KnowledgeSyncRequest) -> dict[str, Any]:
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


@app.get("/api/rag/documents")
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


@app.get("/api/sequences/summary")
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


@app.get("/api/sequences/search")
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
        with get_connection() as connection:
            with connection.cursor() as cursor:
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


class SequenceUpsertOneRequest(BaseModel):
    source_id: str = Field(min_length=1, max_length=64)
    display_name: str = Field(default="", max_length=255)
    organism: str = Field(default="", max_length=160)
    sequence: str = Field(min_length=1)
    description: str = Field(default="", max_length=500)
    record_url: str = Field(default="", max_length=500)
    query_term: str = Field(default="", max_length=160)
    source_name: str = Field(default="RCSB", max_length=32)
    sequence_type: str = Field(default="protein", max_length=16)

    @field_validator("sequence", mode="before")
    @classmethod
    def normalize_sequence(cls, value: Any) -> str:
        return str(value or "").strip().upper()

    @field_validator("source_id", "display_name", "organism", "description",
                     "record_url", "query_term", "source_name", "sequence_type", mode="before")
    @classmethod
    def strip_str(cls, value: Any) -> str:
        return str(value or "").strip()


@app.post("/api/sequences/upsert-one", status_code=status.HTTP_201_CREATED)
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


@app.get("/api/sequences")
def list_sequences(sequence_type: str | None = None, limit: int = 8) -> dict[str, Any]:
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
        records = fetch_sequence_rows(normalized_type, max(1, min(limit, 20)))
        summary = sequence_summary()
        return {
            "records": records,
            "sequenceType": normalized_type,
            **summary,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@app.post("/api/sequences/sync")
def sync_sequences(payload: SequenceSyncRequest) -> dict[str, Any]:
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


@app.get("/api/sequencing-runs/summary")
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


@app.get("/api/sequencing-runs")
def list_sequencing_runs(query: str | None = None, limit: int = 8) -> dict[str, Any]:
    normalized_query = (query or "").strip() or None
    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        rows = fetch_sequencing_run_rows(normalized_query, max(1, min(limit, 20)))
        return {
            "records": rows,
            "query": normalized_query,
            **sequencing_run_summary(),
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@app.post("/api/sequencing-runs/sync")
def sync_sequencing_runs(payload: SequencingRunSyncRequest) -> dict[str, Any]:
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


@app.get("/api/market/summary")
def get_market_summary() -> dict[str, Any]:
    if not ensure_schema():
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


@app.get("/api/market/instruments")
def list_market_instruments(
    asset_type: str | None = None,
    query: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    normalized_asset_type = (asset_type or "").strip().lower() or None
    normalized_query = (query or "").strip() or None

    if normalized_asset_type and normalized_asset_type not in {"stock", "etf", "futures"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="asset_type must be one of stock, etf, futures.",
        )

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        return {
            "records": fetch_market_instrument_rows(
                asset_type=normalized_asset_type,
                query=normalized_query,
                limit=max(1, min(limit, 50)),
            ),
            "assetType": normalized_asset_type,
            "query": normalized_query,
            **market_summary(),
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@app.get("/api/market/bars")
def list_market_bars(
    asset_type: str | None = None,
    symbol: str | None = None,
    contract_month: str | None = None,
    limit: int = 60,
) -> dict[str, Any]:
    normalized_asset_type = (asset_type or "").strip().lower() or None
    normalized_symbol = (symbol or "").strip().upper() or None
    normalized_contract_month = (contract_month or "").strip() or None

    if normalized_asset_type and normalized_asset_type not in {"stock", "etf", "futures"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="asset_type must be one of stock, etf, futures.",
        )

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        return {
            "records": fetch_market_bar_rows(
                asset_type=normalized_asset_type,
                symbol=normalized_symbol,
                contract_month=normalized_contract_month,
                limit=max(1, min(limit, 200)),
            ),
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


@app.post("/api/market/sync")
def sync_market_data(payload: MarketSyncRequest) -> dict[str, Any]:
    if not ensure_schema():
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


@app.delete("/api/sequences/{record_id}")
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


@app.get("/api/inquiries/stats")
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
        with get_connection() as connection:
            with connection.cursor() as cursor:
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


@app.post("/api/inquiries", status_code=status.HTTP_201_CREATED)
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
        with get_connection() as connection:
            with connection.cursor() as cursor:
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