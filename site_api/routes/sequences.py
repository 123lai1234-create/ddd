
from fastapi import APIRouter

router = APIRouter()

# ── End of imports ──

# ── Routes ──
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

__all__ = ["router"]