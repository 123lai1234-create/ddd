"""
site_api/auto_sync.py — Automatic data synchronisation on startup.

When the server starts, check if key tables (sequences, market) are empty
and seed them with default data from external APIs.  Runs in a background
thread so it never blocks the ASGI event loop or delay readiness probes.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from collections.abc import Callable

logger = logging.getLogger(__name__)

# ── Default seed parameters ────────────────────────────────────────────

_DEFAULT_PROTEIN_QUERY = "kinase"
_DEFAULT_GENE_SYMBOLS = ["TP53", "BRCA1", "EGFR", "APOE"]
_DEFAULT_GENE_SPECIES = "homo_sapiens"
_DEFAULT_STOCK_SYMBOLS = ["2330", "2317", "2454", "3008", "2881", "2882", "2886", "6505"]
_DEFAULT_ETF_SYMBOLS = ["0050", "0056", "00878", "00918"]
_DEFAULT_FUTURES_SYMBOLS = ["ES=F", "NQ=F"]
_DEFAULT_TWSE_MONTHS = 24  # 2 years on initial seed
_DEFAULT_YAHOO_RANGE = "3mo"
_DEFAULT_FETCH_LIMIT = 4

_RETRY_MAX_ATTEMPTS = 3
_RETRY_BASE_DELAY = 5  # seconds

_DEFAULT_SEQUENCE_REFRESH_SECONDS = 24 * 60 * 60  # 24h
_DEFAULT_MARKET_REFRESH_SECONDS = 6 * 60 * 60     # 6h
_MARKET_REFRESH_TWSE_MONTHS = 2                   # pull last 2 months to fill gaps
_MARKET_REFRESH_YAHOO_RANGE = "3mo"
_TWSE_DISCOVERY_SECONDS = 24 * 60 * 60            # discover new listings daily


def _with_retry(fn: Callable[[], None], label: str) -> None:
    """Run *fn* with exponential backoff, up to _RETRY_MAX_ATTEMPTS attempts."""
    for attempt in range(1, _RETRY_MAX_ATTEMPTS + 1):
        try:
            fn()
            return
        except Exception as exc:
            if attempt == _RETRY_MAX_ATTEMPTS:
                logger.error("auto-sync: %s failed after %d attempts: %s", label, attempt, exc)
                return
            delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
            logger.warning("auto-sync: %s attempt %d failed, retrying in %ds: %s", label, attempt, delay, exc)
            time.sleep(delay)


def _table_is_empty(table_name: str) -> bool:
    """Return True if *table_name* exists and has zero rows."""
    from site_api.db import get_connection

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT EXISTS ("
                "  SELECT FROM information_schema.tables"
                "  WHERE table_name = %s"
                ")",
                (table_name,),
            )
            exists = cur.fetchone()[0]
            if not exists:
                return True
            cur.execute("SELECT 1 FROM %s LIMIT 1", (table_name,))
            return cur.fetchone() is None
    except Exception:
        return True


def _sync_sequences() -> None:
    """Upsert protein + gene sequences into sequence_library (always refreshes)."""
    from site_api.db import ensure_core_schema
    from site_api.sequence_sources import fetch_gene_sequences, fetch_protein_sequences
    from site_api.services import upsert_sequence_records

    if not ensure_core_schema():
        logger.warning("auto-sync: core schema not ready, skipping sequences")
        return

    logger.info("auto-sync: refreshing protein + gene sequences …")
    try:
        proteins = fetch_protein_sequences(_DEFAULT_PROTEIN_QUERY, _DEFAULT_FETCH_LIMIT)
        genes = fetch_gene_sequences(_DEFAULT_GENE_SYMBOLS, _DEFAULT_GENE_SPECIES)
        upsert_sequence_records(proteins + genes)
        logger.info(
            "auto-sync: sequences upserted — %d protein, %d gene",
            len(proteins),
            len(genes),
        )
    except Exception as exc:
        logger.error("auto-sync: sequence refresh failed: %s", exc)


def _sync_market() -> None:
    """Seed market tables with Taiwan stocks, ETFs, and futures."""
    from site_api.db import ensure_market_schema
    from site_api.market_sources import fetch_market_records
    from site_api.services import upsert_market_bars, upsert_market_instruments

    if not ensure_market_schema():
        logger.warning("auto-sync: market schema not ready, skipping market")
        return

    if not _table_is_empty("market_instruments"):
        logger.info("auto-sync: market_instruments already has data, skipping")
        return

    logger.info("auto-sync: seeding market data …")
    instruments = []
    bars = []
    for asset_type, symbols in (
        ("stock", _DEFAULT_STOCK_SYMBOLS),
        ("etf", _DEFAULT_ETF_SYMBOLS),
        ("futures", _DEFAULT_FUTURES_SYMBOLS),
    ):
        for symbol in symbols:
            try:
                inst, price_bars = fetch_market_records(
                    symbol, asset_type, _DEFAULT_TWSE_MONTHS, _DEFAULT_YAHOO_RANGE,
                )
                instruments.append(inst)
                bars.extend(price_bars)
            except Exception as exc:
                logger.warning("auto-sync: market fetch failed for %s/%s: %s", asset_type, symbol, exc)

    if instruments:
        try:
            upsert_market_instruments(instruments)
            upsert_market_bars(bars)
            logger.info(
                "auto-sync: market seeded — %d instruments, %d bars",
                len(instruments),
                len(bars),
            )
        except Exception as exc:
            logger.error("auto-sync: market upsert failed: %s", exc)
    else:
        logger.warning("auto-sync: no market records fetched")


def _refresh_market_incremental() -> None:
    """Refresh recent bars for every instrument already in the DB.

    Unlike ``_sync_market`` which only seeds when the table is empty, this runs
    on every schedule tick: pull the last couple of months for each symbol and
    upsert — existing bars dedupe on (symbol, trade_date), new trading days
    land automatically.
    """
    from site_api.db import ensure_market_schema, get_connection
    from site_api.market_sources import fetch_market_records
    from site_api.services import upsert_market_bars, upsert_market_instruments

    if not ensure_market_schema():
        logger.warning("auto-sync: market schema not ready, skipping incremental refresh")
        return

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT symbol, asset_type FROM market_instruments ORDER BY symbol")
            rows = cur.fetchall()
    except Exception as exc:
        logger.error("auto-sync: failed to list instruments for refresh: %s", exc)
        return

    if not rows:
        logger.info("auto-sync: no instruments in DB, falling back to initial seed")
        _sync_market()
        return

    logger.info("auto-sync: incremental market refresh — %d instruments", len(rows))
    instruments = []
    bars = []
    failures = 0
    for symbol, asset_type in rows:
        try:
            inst, price_bars = fetch_market_records(
                symbol,
                asset_type,
                _MARKET_REFRESH_TWSE_MONTHS,
                _MARKET_REFRESH_YAHOO_RANGE,
            )
            instruments.append(inst)
            bars.extend(price_bars)
        except Exception as exc:
            failures += 1
            logger.debug("auto-sync: refresh failed for %s/%s: %s", asset_type, symbol, exc)

    if not instruments:
        logger.warning("auto-sync: incremental refresh got 0 records (%d failures)", failures)
        return

    try:
        upsert_market_instruments(instruments)
        upsert_market_bars(bars)
        logger.info(
            "auto-sync: incremental refresh done — %d instruments, %d bars, %d failures",
            len(instruments),
            len(bars),
            failures,
        )
    except Exception as exc:
        logger.error("auto-sync: incremental upsert failed: %s", exc)


def _sequence_refresh_interval() -> int:
    """Interval in seconds between periodic sequence refreshes (0 disables)."""
    raw = os.getenv("SEQUENCE_REFRESH_SECONDS", "").strip()
    if not raw:
        return _DEFAULT_SEQUENCE_REFRESH_SECONDS
    try:
        value = int(raw)
    except ValueError:
        logger.warning("auto-sync: invalid SEQUENCE_REFRESH_SECONDS=%r, using default", raw)
        return _DEFAULT_SEQUENCE_REFRESH_SECONDS
    return max(0, value)


def _periodic_sequence_refresh(interval_seconds: int) -> None:
    """Re-run sequence sync every *interval_seconds* (sleeps in small slices)."""
    while True:
        remaining = interval_seconds
        while remaining > 0:
            chunk = min(remaining, 60)
            time.sleep(chunk)
            remaining -= chunk
        _with_retry(_sync_sequences, "periodic sequence refresh")


def _market_refresh_interval() -> int:
    raw = os.getenv("MARKET_REFRESH_SECONDS", "").strip()
    if not raw:
        return _DEFAULT_MARKET_REFRESH_SECONDS
    try:
        value = int(raw)
    except ValueError:
        logger.warning("auto-sync: invalid MARKET_REFRESH_SECONDS=%r, using default", raw)
        return _DEFAULT_MARKET_REFRESH_SECONDS
    return max(0, value)


def _periodic_market_refresh(interval_seconds: int) -> None:
    while True:
        remaining = interval_seconds
        while remaining > 0:
            chunk = min(remaining, 60)
            time.sleep(chunk)
            remaining -= chunk
        _with_retry(_refresh_market_incremental, "periodic market refresh")


def _months_since_last_bar(symbol: str) -> int:
    """Return how many months of data to fetch for *symbol*.

    If the symbol has existing bars in the DB, calculate the months between
    the latest bar and today, plus 1 as a safety buffer.  Cap at 120.
    Falls back to 2 (the standard refresh window) on any error.
    """
    from site_api.db import get_connection

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT MAX(trade_date) FROM market_price_bars WHERE symbol = %s",
                (symbol,),
            )
            row = cur.fetchone()
            if row and row[0]:
                from datetime import date

                last: date = row[0]
                today = date.today()
                months = (today.year - last.year) * 12 + (today.month - last.month) + 1
                return min(max(months, 1), 120)
    except Exception:
        pass
    return _MARKET_REFRESH_TWSE_MONTHS


def _sync_twse_discover_and_update() -> None:
    """Discover all currently listed TWSE stocks and incrementally update their bars.

    1. Fetch the full TWSE listing from the OpenAPI.
    2. Upsert any new symbols into market_instruments.
    3. For each symbol (new or existing), fetch only the months since its last
       trade_date so we never re-download data we already have.
    """
    from site_api.db import ensure_market_schema
    from site_api.market_sources import fetch_twse_daily_records, fetch_twse_listed_stock_symbols
    from site_api.services import upsert_market_bars, upsert_market_instruments

    if not ensure_market_schema():
        logger.warning("auto-sync: market schema not ready, skipping TWSE discovery")
        return

    listed = fetch_twse_listed_stock_symbols()
    if not listed:
        logger.warning("auto-sync: TWSE listing returned 0 symbols, skipping discovery")
        return

    logger.info("auto-sync: TWSE discovery — %d listed stocks", len(listed))

    instruments = []
    bars = []
    failures = 0
    for entry in listed:
        symbol = entry["symbol"]
        months_needed = _months_since_last_bar(symbol)
        try:
            inst, price_bars = fetch_twse_daily_records(symbol, "stock", months_needed)
            instruments.append(inst)
            bars.extend(price_bars)
        except Exception as exc:
            failures += 1
            logger.debug("auto-sync: TWSE discovery skip %s: %s", symbol, exc)

        # Flush in batches of 50 to keep memory reasonable
        if len(instruments) >= 50:
            try:
                upsert_market_instruments(instruments)
                upsert_market_bars(bars)
            except Exception as exc:
                logger.error("auto-sync: TWSE batch upsert failed: %s", exc)
            instruments = []
            bars = []

    if instruments:
        try:
            upsert_market_instruments(instruments)
            upsert_market_bars(bars)
        except Exception as exc:
            logger.error("auto-sync: TWSE final batch upsert failed: %s", exc)

    logger.info(
        "auto-sync: TWSE discovery done — %d listed, %d failures",
        len(listed),
        failures,
    )


def _periodic_twse_discovery(interval_seconds: int) -> None:
    """Periodically discover and update all listed TWSE stocks."""
    while True:
        remaining = interval_seconds
        while remaining > 0:
            chunk = min(remaining, 60)
            time.sleep(chunk)
            remaining -= chunk
        _with_retry(_sync_twse_discover_and_update, "TWSE discovery")


def run_auto_sync() -> None:
    """Run all auto-sync tasks in a background daemon thread."""

    def _worker() -> None:
        logger.info("auto-sync: background worker started")
        _with_retry(_sync_sequences, "sequence sync")
        _with_retry(_sync_market, "market sync")
        logger.info("auto-sync: initial pass finished")

    thread = threading.Thread(target=_worker, name="auto-sync", daemon=True)
    thread.start()

    interval = _sequence_refresh_interval()
    if interval > 0:
        logger.info("auto-sync: scheduling sequence refresh every %ds", interval)
        refresher = threading.Thread(
            target=_periodic_sequence_refresh,
            args=(interval,),
            name="auto-sync-sequences",
            daemon=True,
        )
        refresher.start()
    else:
        logger.info("auto-sync: periodic sequence refresh disabled (SEQUENCE_REFRESH_SECONDS=0)")

    market_interval = _market_refresh_interval()
    if market_interval > 0:
        logger.info("auto-sync: scheduling market refresh every %ds", market_interval)
        market_refresher = threading.Thread(
            target=_periodic_market_refresh,
            args=(market_interval,),
            name="auto-sync-market",
            daemon=True,
        )
        market_refresher.start()
    else:
        logger.info("auto-sync: periodic market refresh disabled (MARKET_REFRESH_SECONDS=0)")

    discovery_interval = _TWSE_DISCOVERY_SECONDS
    logger.info("auto-sync: scheduling TWSE full discovery every %ds", discovery_interval)
    discovery_thread = threading.Thread(
        target=_periodic_twse_discovery,
        args=(discovery_interval,),
        name="auto-sync-twse-discovery",
        daemon=True,
    )
    discovery_thread.start()
