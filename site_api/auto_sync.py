"""
site_api/auto_sync.py — Automatic data synchronisation on startup.

When the server starts, check if key tables (sequences, market) are empty
and seed them with default data from external APIs.  Runs in a background
thread so it never blocks the ASGI event loop or delay readiness probes.
"""

from __future__ import annotations

import logging
import threading

logger = logging.getLogger(__name__)

# ── Default seed parameters ────────────────────────────────────────────

_DEFAULT_PROTEIN_QUERY = "kinase"
_DEFAULT_GENE_SYMBOLS = ["TP53", "BRCA1", "EGFR", "APOE"]
_DEFAULT_GENE_SPECIES = "homo_sapiens"
_DEFAULT_STOCK_SYMBOLS = ["2330", "2317", "2454", "3008"]
_DEFAULT_ETF_SYMBOLS = ["0050", "0056"]
_DEFAULT_FUTURES_SYMBOLS = ["ES=F", "NQ=F"]
_DEFAULT_TWSE_MONTHS = 3
_DEFAULT_YAHOO_RANGE = "3mo"
_DEFAULT_FETCH_LIMIT = 4


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
            cur.execute(f"SELECT 1 FROM {table_name} LIMIT 1")  # noqa: S608
            return cur.fetchone() is None
    except Exception:
        return True


def _sync_sequences() -> None:
    """Seed sequence_library with protein + gene sequences."""
    from site_api.db import ensure_core_schema
    from site_api.sequence_sources import fetch_gene_sequences, fetch_protein_sequences
    from site_api.services import upsert_sequence_records

    if not ensure_core_schema():
        logger.warning("auto-sync: core schema not ready, skipping sequences")
        return

    if not _table_is_empty("sequence_library"):
        logger.info("auto-sync: sequence_library already has data, skipping")
        return

    logger.info("auto-sync: seeding protein + gene sequences …")
    try:
        proteins = fetch_protein_sequences(_DEFAULT_PROTEIN_QUERY, _DEFAULT_FETCH_LIMIT)
        genes = fetch_gene_sequences(_DEFAULT_GENE_SYMBOLS, _DEFAULT_GENE_SPECIES)
        upsert_sequence_records(proteins + genes)
        logger.info(
            "auto-sync: sequences seeded — %d protein, %d gene",
            len(proteins),
            len(genes),
        )
    except Exception as exc:
        logger.error("auto-sync: sequence seeding failed: %s", exc)


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


def run_auto_sync() -> None:
    """Run all auto-sync tasks in a background daemon thread."""

    def _worker() -> None:
        logger.info("auto-sync: background worker started")
        _sync_sequences()
        _sync_market()
        logger.info("auto-sync: background worker finished")

    thread = threading.Thread(target=_worker, name="auto-sync", daemon=True)
    thread.start()
