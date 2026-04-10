from __future__ import annotations

import logging
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException, status

from site_api.db import get_connection
from site_api.schemas import (
    UPSERT_SEQUENCE_LIBRARY_SQL,
    UPSERT_KNOWLEDGE_LIBRARY_SQL,
    UPSERT_SEQUENCING_RUN_LIBRARY_SQL,
    UPSERT_MARKET_INSTRUMENTS_SQL,
    UPSERT_MARKET_PRICE_BARS_SQL,
    UPSERT_STRUCTURE_PREDICTION_SQL,
    UPSERT_CLINICAL_VARIANT_SQL,
    UPSERT_ALLELE_FREQUENCY_SQL,
    UPSERT_PROTEIN_INTERACTION_SQL,
    UPSERT_ECONOMIC_INDICATOR_SQL,
)
from site_api.knowledge_sources import KnowledgeRecordPayload
from site_api.market_sources import MarketBarPayload, MarketInstrumentPayload
from site_api.sequence_sources import SequenceRecordPayload
from site_api.sequencing_run_sources import SequencingRunPayload

logger = logging.getLogger(__name__)

_summary_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 60  # seconds


def _cached_summary(key: str, fn):
    now = time.monotonic()
    if key in _summary_cache:
        ts, val = _summary_cache[key]
        if now - ts < _CACHE_TTL:
            return val
    val = fn()
    _summary_cache[key] = (now, val)
    return val


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


def fetch_sequence_rows(sequence_type: str | None = None, limit: int = 8, cursor: int | None = None) -> list[dict[str, Any]]:
    query = """
        SELECT id, sequence_type, source_name, source_id, query_term, display_name,
               organism, sequence, sequence_length, description, record_url, fetched_at
        FROM sequence_library
    """
    conditions: list[str] = []
    params: list[Any] = []

    if sequence_type:
        conditions.append("sequence_type = %s")
        params.append(sequence_type)

    if cursor is not None:
        conditions.append("id < %s")
        params.append(cursor)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY fetched_at DESC, id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(query, params)
        rows = cursor.fetchall()

    return [serialize_sequence_row(row) for row in rows]


def _sequence_summary_impl() -> dict[str, Any]:
    with get_connection() as connection, connection.cursor() as cursor:
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


def sequence_summary() -> dict[str, Any]:
    return _cached_summary("sequence", _sequence_summary_impl)


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
    cursor: int | None = None,
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

    if cursor is not None:
        conditions.append("id < %s")
        params.append(cursor)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY fetched_at DESC, id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(query, params)
        rows = cursor.fetchall()

    return [serialize_knowledge_row(row) for row in rows]


def _knowledge_summary_impl() -> dict[str, Any]:
    with get_connection() as connection, connection.cursor() as cursor:
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


def knowledge_summary() -> dict[str, Any]:
    return _cached_summary("knowledge", _knowledge_summary_impl)


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

    with get_connection() as connection, connection.cursor() as cursor:
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

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.executemany(
            UPSERT_SEQUENCE_LIBRARY_SQL,
            [
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
                )
                for record in records
            ],
        )
    connection.commit()
    _summary_cache.pop("sequence", None)


def upsert_knowledge_records(records: list[KnowledgeRecordPayload]) -> None:
    if not records:
        return

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.executemany(
            UPSERT_KNOWLEDGE_LIBRARY_SQL,
            [
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
                )
                for record in records
            ],
        )
    connection.commit()
    _summary_cache.pop("knowledge", None)


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


def fetch_sequencing_run_rows(query: str | None = None, limit: int = 8, cursor: int | None = None) -> list[dict[str, Any]]:
    sql = """
        SELECT id, source_name, source_id, query_term, study_accession,
               experiment_accession, sample_accession, organism, library_strategy,
               library_source, library_layout, instrument_platform, instrument_model,
               read_count, base_count, fastq_bytes, published_at, ftp_url,
               record_url, fetched_at
        FROM sequencing_run_library
    """
    conditions: list[str] = []
    params: list[Any] = []

    if query:
        like_query = f"%{query}%"
        conditions.append("(query_term ILIKE %s OR source_id ILIKE %s OR study_accession ILIKE %s OR sample_accession ILIKE %s OR organism ILIKE %s OR library_strategy ILIKE %s)")
        params.extend([like_query, like_query, like_query, like_query, like_query, like_query])

    if cursor is not None:
        conditions.append("id < %s")
        params.append(cursor)

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " ORDER BY fetched_at DESC, id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(sql, params)
        rows = cursor.fetchall()

    return [serialize_sequencing_run_row(row) for row in rows]


def _sequencing_run_summary_impl() -> dict[str, Any]:
    with get_connection() as connection, connection.cursor() as cursor:
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


def sequencing_run_summary() -> dict[str, Any]:
    return _cached_summary("sequencing_run", _sequencing_run_summary_impl)


def upsert_sequencing_runs(records: list[SequencingRunPayload]) -> None:
    if not records:
        return

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.executemany(
            UPSERT_SEQUENCING_RUN_LIBRARY_SQL,
            [
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
                )
                for record in records
            ],
        )
    connection.commit()
    _summary_cache.pop("sequencing_run", None)


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
    cursor: int | None = None,
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

    if cursor is not None:
        conditions.append("id < %s")
        params.append(cursor)

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " ORDER BY fetched_at DESC, id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as connection, connection.cursor() as cursor:
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
    cursor: int | None = None,
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

    if cursor is not None:
        conditions.append("bars.id < %s")
        params.append(cursor)

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " ORDER BY bars.trade_date DESC, bars.contract_month DESC, bars.fetched_at DESC LIMIT %s"
    params.append(limit)

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(sql, params)
        rows = cursor.fetchall()

    return [serialize_market_bar_row(row) for row in rows]


def _market_summary_impl() -> dict[str, Any]:
    with get_connection() as connection, connection.cursor() as cursor:
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


def market_summary() -> dict[str, Any]:
    return _cached_summary("market", _market_summary_impl)


def upsert_market_instruments(records: list[MarketInstrumentPayload]) -> None:
    if not records:
        return

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.executemany(
            UPSERT_MARKET_INSTRUMENTS_SQL,
            [
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
                )
                for record in records
            ],
        )
    connection.commit()
    _summary_cache.pop("market", None)


def upsert_market_bars(records: list[MarketBarPayload]) -> None:
    if not records:
        return

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.executemany(
            UPSERT_MARKET_PRICE_BARS_SQL,
            [
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
                )
                for record in records
            ],
        )
    connection.commit()
    _summary_cache.pop("market", None)


def delete_sequence_record(record_id: int) -> dict[str, Any] | None:
    with get_connection() as connection, connection.cursor() as cursor:
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


# ── Structure Predictions (AlphaFold) ────────────────────────────────────────

def structure_prediction_summary() -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT COUNT(*) AS cnt FROM structure_predictions").fetchone()
        return {"totalStructures": row[0] if row else 0}


def fetch_structure_prediction_rows(uniprot_id: str | None = None, limit: int = 20, cursor: int | None = None) -> list[dict[str, Any]]:
    sql = "SELECT id, source_name, uniprot_id, entry_id, gene_name, organism, confidence_avg, model_url, model_page_url, sequence_length, fetched_at FROM structure_predictions"
    conditions: list[str] = []
    params: list[Any] = []
    if uniprot_id:
        conditions.append("uniprot_id = %s")
        params.append(uniprot_id.upper())
    if cursor:
        conditions.append("id < %s")
        params.append(cursor)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [
        {"id": r[0], "sourceName": r[1], "uniprotId": r[2], "entryId": r[3], "geneName": r[4],
         "organism": r[5], "confidenceAvg": r[6], "modelUrl": r[7], "modelPageUrl": r[8],
         "sequenceLength": r[9], "fetchedAt": r[10].isoformat() if r[10] else None}
        for r in rows
    ]


def upsert_structure_predictions(records: list) -> None:
    with get_connection() as conn:
        for r in records:
            conn.execute(UPSERT_STRUCTURE_PREDICTION_SQL, (
                r.source_name, r.uniprot_id, r.entry_id, r.gene_name, r.organism,
                r.confidence_avg, r.model_url, r.model_page_url, r.sequence_length, r.raw_payload,
            ))
        conn.commit()


# ── Clinical Variants (ClinVar + COSMIC) ─────────────────────────────────────

def variant_summary() -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT COUNT(*) FROM clinical_variant_library").fetchone()
        return {"totalVariants": row[0] if row else 0}


def fetch_variant_rows(gene_symbol: str | None = None, limit: int = 20, cursor: int | None = None) -> list[dict[str, Any]]:
    sql = "SELECT id, source_name, source_id, gene_symbol, variant_name, clinical_significance, condition_names, review_status, variant_type, chromosome, position, record_url, fetched_at FROM clinical_variant_library"
    conditions: list[str] = []
    params: list[Any] = []
    if gene_symbol:
        conditions.append("gene_symbol = %s")
        params.append(gene_symbol.upper())
    if cursor:
        conditions.append("id < %s")
        params.append(cursor)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [
        {"id": r[0], "sourceName": r[1], "sourceId": r[2], "geneSymbol": r[3], "variantName": r[4],
         "clinicalSignificance": r[5], "conditionNames": r[6], "reviewStatus": r[7], "variantType": r[8],
         "chromosome": r[9], "position": r[10], "recordUrl": r[11],
         "fetchedAt": r[12].isoformat() if r[12] else None}
        for r in rows
    ]


def upsert_variants(records: list) -> None:
    with get_connection() as conn:
        for r in records:
            conn.execute(UPSERT_CLINICAL_VARIANT_SQL, (
                r.source_name, r.source_id, r.query_term, r.gene_symbol, r.variant_name,
                r.clinical_significance, r.condition_names, r.review_status, r.variant_type,
                r.chromosome, r.position, r.record_url, r.raw_payload,
            ))
        conn.commit()


# ── Population Frequencies (gnomAD) ──────────────────────────────────────────

def population_summary() -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT COUNT(*) FROM allele_frequency_library").fetchone()
        return {"totalAlleleFrequencies": row[0] if row else 0}


def fetch_population_rows(gene_symbol: str | None = None, limit: int = 20, cursor: int | None = None) -> list[dict[str, Any]]:
    sql = "SELECT id, source_name, variant_id, gene_symbol, consequence, allele_frequency, homozygote_count, population_frequencies, record_url, fetched_at FROM allele_frequency_library"
    conditions: list[str] = []
    params: list[Any] = []
    if gene_symbol:
        conditions.append("gene_symbol = %s")
        params.append(gene_symbol.upper())
    if cursor:
        conditions.append("id < %s")
        params.append(cursor)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [
        {"id": r[0], "sourceName": r[1], "variantId": r[2], "geneSymbol": r[3], "consequence": r[4],
         "alleleFrequency": r[5], "homozygoteCount": r[6], "populationFrequencies": r[7],
         "recordUrl": r[8], "fetchedAt": r[9].isoformat() if r[9] else None}
        for r in rows
    ]


def upsert_population(records: list) -> None:
    with get_connection() as conn:
        for r in records:
            conn.execute(UPSERT_ALLELE_FREQUENCY_SQL, (
                r.source_name, r.variant_id, r.query_term, r.gene_symbol, r.consequence,
                r.allele_frequency, r.homozygote_count, r.population_frequencies,
                r.record_url, r.raw_payload,
            ))
        conn.commit()


# ── Protein Interactions (STRING) ────────────────────────────────────────────

def interaction_summary() -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT COUNT(*) FROM protein_interaction_library").fetchone()
        return {"totalInteractions": row[0] if row else 0}


def fetch_interaction_rows(query: str | None = None, limit: int = 20, cursor: int | None = None) -> list[dict[str, Any]]:
    sql = "SELECT id, source_name, source_id, protein_a, protein_b, combined_score, experimental_score, database_score, textmining_score, organism_id, record_url, fetched_at FROM protein_interaction_library"
    conditions: list[str] = []
    params: list[Any] = []
    if query:
        conditions.append("(protein_a ILIKE %s OR protein_b ILIKE %s)")
        params.extend([f"%{query}%", f"%{query}%"])
    if cursor:
        conditions.append("id < %s")
        params.append(cursor)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY combined_score DESC, id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [
        {"id": r[0], "sourceName": r[1], "sourceId": r[2], "proteinA": r[3], "proteinB": r[4],
         "combinedScore": r[5], "experimentalScore": r[6], "databaseScore": r[7],
         "textminingScore": r[8], "organismId": r[9], "recordUrl": r[10],
         "fetchedAt": r[11].isoformat() if r[11] else None}
        for r in rows
    ]


def upsert_interactions(records: list) -> None:
    with get_connection() as conn:
        for r in records:
            conn.execute(UPSERT_PROTEIN_INTERACTION_SQL, (
                r.source_name, r.source_id, r.query_term, r.protein_a, r.protein_b,
                r.combined_score, r.experimental_score, r.database_score, r.textmining_score,
                r.organism_id, r.record_url, r.raw_payload,
            ))
        conn.commit()


# ── Economic Indicators (FRED) ───────────────────────────────────────────────

def economic_summary() -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT COUNT(*), COUNT(DISTINCT series_id) FROM economic_indicator_library").fetchone()
        return {"totalObservations": row[0] if row else 0, "totalSeries": row[1] if row else 0}


def fetch_economic_rows(series_id: str | None = None, limit: int = 60, cursor: int | None = None) -> list[dict[str, Any]]:
    sql = "SELECT id, source_name, series_id, observation_date, value, title, frequency, units, fetched_at FROM economic_indicator_library"
    conditions: list[str] = []
    params: list[Any] = []
    if series_id:
        conditions.append("series_id = %s")
        params.append(series_id.upper())
    if cursor:
        conditions.append("id < %s")
        params.append(cursor)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY observation_date DESC, id DESC LIMIT %s"
    params.append(limit)

    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [
        {"id": r[0], "sourceName": r[1], "seriesId": r[2],
         "observationDate": r[3].isoformat() if r[3] else None,
         "value": r[4], "title": r[5], "frequency": r[6], "units": r[7],
         "fetchedAt": r[8].isoformat() if r[8] else None}
        for r in rows
    ]


def upsert_economic_indicators(records: list) -> None:
    with get_connection() as conn:
        for r in records:
            conn.execute(UPSERT_ECONOMIC_INDICATOR_SQL, (
                r.source_name, r.series_id, r.observation_date, r.value,
                r.title, r.frequency, r.units, r.raw_payload,
            ))
        conn.commit()
