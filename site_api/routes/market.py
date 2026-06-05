
from fastapi import APIRouter

router = APIRouter()

# ── End of imports ──

# ── Routes ──
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

__all__ = ["router"]