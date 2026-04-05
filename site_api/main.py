from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psycopg
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from site_api.knowledge_sources import KnowledgeRecordPayload, fetch_pubmed_knowledge, fetch_uniprot_knowledge
from site_api.sequence_sources import SequenceRecordPayload, fetch_gene_sequences, fetch_protein_sequences


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


def get_database_url() -> str:
    return os.getenv("DATABASE_URL", "").strip()


def _with_query_params(url: str, params: dict[str, str]) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update(params)
    return urlunparse(parsed._replace(query=urlencode(query)))


def get_database_url_candidates() -> list[str]:
    database_url = get_database_url()
    if not database_url:
        return []

    candidates: list[str] = []

    def append_candidate(candidate: str) -> None:
        normalized = candidate.strip()
        if normalized and normalized not in candidates:
            candidates.append(normalized)

    append_candidate(database_url)
    append_candidate(_with_query_params(database_url, {"connect_timeout": "5"}))

    parsed = urlparse(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if "sslmode" not in query:
        append_candidate(_with_query_params(database_url, {"sslmode": "require", "connect_timeout": "5"}))

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


@app.on_event("startup")
def startup() -> None:
    ensure_schema()


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "jtlai-engineering-biomed-api",
        "databaseConfigured": bool(get_database_url()),
        "connected": database_available(),
    }


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


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
            detail="Unable to persist crawled knowledge to Render Postgres.",
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
            detail="Unable to persist crawled sequences to Render Postgres.",
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
            detail="Unable to delete sequence record from Render Postgres.",
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
            detail="Unable to persist inquiry to Render Postgres.",
        ) from error