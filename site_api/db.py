from __future__ import annotations

import contextlib
import logging
import os
from collections.abc import Generator
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psycopg
import psycopg_pool
from fastapi import HTTPException, status

from site_api.schemas import (
    CHEMBL_SCHEMA_STATEMENTS,
    CORE_SCHEMA_STATEMENTS,
    PGVECTOR_SCHEMA_STATEMENTS,
    ECONOMIC_SCHEMA_STATEMENTS,
    INTERACTION_SCHEMA_STATEMENTS,
    MARKET_SCHEMA_STATEMENTS,
    OPENTARGETS_SCHEMA_STATEMENTS,
    POPULATION_SCHEMA_STATEMENTS,
    STRUCTURE_SCHEMA_STATEMENTS,
    VARIANT_SCHEMA_STATEMENTS,
)

logger = logging.getLogger(__name__)
CORE_SCHEMA_READY = False
MARKET_SCHEMA_READY = False
STRUCTURE_SCHEMA_READY = False
VARIANT_SCHEMA_READY = False
POPULATION_SCHEMA_READY = False
INTERACTION_SCHEMA_READY = False
ECONOMIC_SCHEMA_READY = False
OPENTARGETS_SCHEMA_READY = False
CHEMBL_SCHEMA_READY = False
PGVECTOR_SCHEMA_READY = False
LAST_DATABASE_ERROR = ""
_DB_POOL: psycopg_pool.ConnectionPool | None = None

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

_PG_KNOWN_PARAMS = frozenset({
    "sslmode", "connect_timeout", "application_name", "options",
    "keepalives", "keepalives_idle", "keepalives_interval", "keepalives_count",
    "target_session_attrs", "channel_binding",
})


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


def _init_pool() -> None:
    """Initialise the global connection pool (called once at startup)."""
    global _DB_POOL, LAST_DATABASE_ERROR
    candidates = get_database_url_candidates()
    if not candidates:
        return
    for candidate in candidates:
        try:
            pool = psycopg_pool.ConnectionPool(
                candidate,
                min_size=1,
                max_size=4,          # safe for free-tier (Neon/Railway/Render)
                open=True,
                reconnect_timeout=30,
                kwargs={"connect_timeout": 5},
            )
            _DB_POOL = pool
            LAST_DATABASE_ERROR = ""
            logger.info("DB connection pool initialised")
            return
        except Exception as error:
            LAST_DATABASE_ERROR = str(error)
            logger.warning("DB pool init failed for candidate: %s", error)


@contextlib.contextmanager
def get_connection() -> Generator[psycopg.Connection, None, None]:
    """Yield a database connection and guarantee proper cleanup.

    When the pool is available the connection is checked out via ``getconn``
    and **returned** to the pool (``putconn``) when the context exits —
    instead of being closed, which would destroy a reusable connection.

    If the pool is unavailable, a direct connection is opened and closed
    normally on exit.
    """
    global LAST_DATABASE_ERROR

    # Fast path: use pool if available
    if _DB_POOL is not None:
        try:
            pooled_connection = _DB_POOL.getconn()
        except Exception as error:
            LAST_DATABASE_ERROR = str(error)
            logger.warning("Pool getconn failed, falling back to direct connect: %s", error)
        else:
            LAST_DATABASE_ERROR = ""
            try:
                yield pooled_connection
            except Exception:
                with contextlib.suppress(Exception):
                    pooled_connection.rollback()
                raise
            finally:
                try:
                    _DB_POOL.putconn(pooled_connection)
                except Exception:
                    pooled_connection.close()
            return

    # Fallback: direct connect (used before pool is ready or if pool fails)
    last_error: Exception | None = None
    for candidate in get_database_url_candidates():
        try:
            connection = psycopg.connect(candidate)
            LAST_DATABASE_ERROR = ""
        except psycopg.Error as error:
            last_error = error
            LAST_DATABASE_ERROR = str(error)
            continue

        try:
            yield connection
        except Exception:
            with contextlib.suppress(Exception):
                connection.rollback()
            raise
        finally:
            connection.close()
        return

    if last_error is not None:
        raise last_error

    raise psycopg.OperationalError("DATABASE_URL is not configured.")


def _require_sync_secret(provided: str | None) -> None:
    """Guard for sync endpoints: reject if SYNC_SECRET is set and header doesn't match."""
    secret = os.getenv("SYNC_SECRET", "").strip()
    if not secret:
        return  # No secret configured → open (for local dev)
    if not provided or provided.strip() != secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid X-Sync-Secret header.",
        )


def get_allowed_origins() -> list[str]:
    raw_value = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if not raw_value:
        return ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000"]
    return [item.strip() for item in raw_value.split(",") if item.strip()]


def _execute_schema_setup(statements: tuple[str, ...], label: str) -> bool:
    database_url = get_database_url()
    if not database_url:
        return False

    try:
        with get_connection() as connection:
            for statement in statements:
                connection.execute(statement)
            connection.commit()
        return True
    except psycopg.Error as error:
        logger.warning("%s schema is not ready yet: %s", label, error)
        return False


def ensure_core_schema() -> bool:
    global CORE_SCHEMA_READY

    if CORE_SCHEMA_READY:
        return True

    if not _execute_schema_setup(CORE_SCHEMA_STATEMENTS, "Core"):
        return False

    CORE_SCHEMA_READY = True
    return True


def ensure_market_schema() -> bool:
    global MARKET_SCHEMA_READY

    if MARKET_SCHEMA_READY:
        return True

    if not _execute_schema_setup(MARKET_SCHEMA_STATEMENTS, "Market"):
        return False

    MARKET_SCHEMA_READY = True
    return True


def ensure_structure_schema() -> bool:
    global STRUCTURE_SCHEMA_READY
    if STRUCTURE_SCHEMA_READY:
        return True
    if not _execute_schema_setup(STRUCTURE_SCHEMA_STATEMENTS, "Structure"):
        return False
    STRUCTURE_SCHEMA_READY = True
    return True


def ensure_variant_schema() -> bool:
    global VARIANT_SCHEMA_READY
    if VARIANT_SCHEMA_READY:
        return True
    if not _execute_schema_setup(VARIANT_SCHEMA_STATEMENTS, "Variant"):
        return False
    VARIANT_SCHEMA_READY = True
    return True


def ensure_population_schema() -> bool:
    global POPULATION_SCHEMA_READY
    if POPULATION_SCHEMA_READY:
        return True
    if not _execute_schema_setup(POPULATION_SCHEMA_STATEMENTS, "Population"):
        return False
    POPULATION_SCHEMA_READY = True
    return True


def ensure_interaction_schema() -> bool:
    global INTERACTION_SCHEMA_READY
    if INTERACTION_SCHEMA_READY:
        return True
    if not _execute_schema_setup(INTERACTION_SCHEMA_STATEMENTS, "Interaction"):
        return False
    INTERACTION_SCHEMA_READY = True
    return True


def ensure_economic_schema() -> bool:
    global ECONOMIC_SCHEMA_READY
    if ECONOMIC_SCHEMA_READY:
        return True
    if not _execute_schema_setup(ECONOMIC_SCHEMA_STATEMENTS, "Economic"):
        return False
    ECONOMIC_SCHEMA_READY = True
    return True


def ensure_opentargets_schema() -> bool:
    global OPENTARGETS_SCHEMA_READY
    if OPENTARGETS_SCHEMA_READY:
        return True
    if not _execute_schema_setup(OPENTARGETS_SCHEMA_STATEMENTS, "OpenTargets"):
        return False
    OPENTARGETS_SCHEMA_READY = True
    return True


def ensure_chembl_schema() -> bool:
    global CHEMBL_SCHEMA_READY
    if CHEMBL_SCHEMA_READY:
        return True
    if not _execute_schema_setup(CHEMBL_SCHEMA_STATEMENTS, "ChEMBL"):
        return False
    CHEMBL_SCHEMA_READY = True
    return True


def ensure_pgvector_schema() -> bool:
    global PGVECTOR_SCHEMA_READY
    if PGVECTOR_SCHEMA_READY:
        return True
    if not _execute_schema_setup(PGVECTOR_SCHEMA_STATEMENTS, "pgvector"):
        return False
    PGVECTOR_SCHEMA_READY = True
    return True


def ensure_schema() -> bool:
    return ensure_core_schema()


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
            with psycopg.connect(_with_query_params(sanitized_value, {"sslmode": "require", "connect_timeout": "5"})) as conn:
                conn.execute("SELECT 1;")
            entry["connected"] = True
        except psycopg.Error:
            try:
                with psycopg.connect(_with_query_params(sanitized_value, {"connect_timeout": "5"})) as conn:
                    conn.execute("SELECT 1;")
                entry["connected"] = True
            except psycopg.Error as error2:
                entry["error"] = str(error2)
        results.append(entry)
    return results
