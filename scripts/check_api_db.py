from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from site_api.db import ensure_market_schema, ensure_schema, get_connection, get_database_url_candidates


DEFAULT_ENDPOINTS = (
    "/healthz",
    "/api/sequences/summary",
    "/api/knowledge/summary",
    "/api/market/summary",
)


def _format_error(error: Exception) -> str:
    return " ".join(str(error).split()) or error.__class__.__name__


def _print_result(label: str, ok: bool, detail: str = "") -> None:
    status = "[OK]" if ok else "[FAIL]"
    if detail:
        print(f"{status} {label}: {detail}")
        return
    print(f"{status} {label}")


def _check_database() -> bool:
    candidates = get_database_url_candidates()
    if not candidates:
        _print_result(
            "Database URL",
            False,
            "No database URL env var found. Set DATABASE_URL_NEON or another supported Postgres URL.",
        )
        return False

    host = urlparse(candidates[0]).hostname or "unknown-host"
    _print_result("Database URL", True, f"Loaded {len(candidates)} candidate(s), first host: {host}")

    try:
        with get_connection() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            row = cursor.fetchone()
        _print_result("Direct PostgreSQL connection", row == (1,))
    except Exception as error:
        _print_result("Direct PostgreSQL connection", False, _format_error(error))
        return False

    core_ok = ensure_schema()
    _print_result("Core schema setup", core_ok)

    market_ok = ensure_market_schema()
    _print_result("Market schema setup", market_ok)

    return core_ok and market_ok


def _response_detail(response: requests.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        payload = response.text.strip()

    normalized = " ".join(str(payload).split())
    if len(normalized) > 200:
        return normalized[:197] + "..."
    return normalized


def _check_api(base_url: str) -> bool:
    normalized_base = base_url.rstrip("/")
    all_ok = True

    for path in DEFAULT_ENDPOINTS:
        try:
            response = requests.get(f"{normalized_base}{path}", timeout=10)
        except requests.RequestException as error:
            _print_result(f"GET {path}", False, _format_error(error))
            all_ok = False
            continue

        ok = response.status_code == 200
        detail = f"HTTP {response.status_code}"
        if not ok:
            response_body = _response_detail(response)
            if response_body:
                detail = f"{detail} - {response_body}"
        _print_result(f"GET {path}", ok, detail)
        all_ok = all_ok and ok

    return all_ok


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate Postgres connectivity, schema setup, and optional API endpoints for this repo.",
    )
    parser.add_argument(
        "--api-base-url",
        default="",
        help="Optional API base URL to verify after the direct DB check, for example http://127.0.0.1:8000",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    print("Checking database configuration...")
    db_ok = _check_database()

    api_ok = True
    if args.api_base_url:
        print(f"\nChecking API endpoints at {args.api_base_url}...")
        api_ok = _check_api(args.api_base_url)

    overall_ok = db_ok and api_ok
    print("\nValidation passed." if overall_ok else "\nValidation failed.")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())