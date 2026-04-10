"""FRED API — Federal Reserve economic indicators."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass

from site_api.cache import cached_json_get, cached_json_set
from site_api.http_client import get as http_get

logger = logging.getLogger(__name__)

FRED_API_URL = "https://api.stlouisfed.org/fred"
REQUEST_TIMEOUT = 20

DEFAULT_SERIES = ["GDP", "UNRATE", "DFF", "CPIAUCSL", "T10Y2Y", "VIXCLS"]


@dataclass(slots=True)
class EconomicIndicatorPayload:
    source_name: str
    series_id: str
    observation_date: str
    value: float | None
    title: str
    frequency: str
    units: str
    raw_payload: str


def fetch_fred_series(series_ids: list[str] | None = None, limit: int = 120) -> list[EconomicIndicatorPayload]:
    api_key = os.getenv("FRED_API_KEY", "").strip()
    if not api_key:
        logger.info("FRED_API_KEY not set — skipping FRED fetch.")
        return []

    ids = series_ids or DEFAULT_SERIES
    results: list[EconomicIndicatorPayload] = []

    for sid in ids:
        sid = sid.strip().upper()
        cache_key = f"{sid}:{limit}"
        cached = cached_json_get("fred", cache_key)
        if cached:
            results.extend(EconomicIndicatorPayload(**r) for r in cached)
            continue

        try:
            # First get series metadata
            meta_resp = http_get(
                f"{FRED_API_URL}/series",
                params={"series_id": sid, "api_key": api_key, "file_type": "json"},
                timeout=REQUEST_TIMEOUT,
            )
            meta = {}
            if meta_resp.status_code == 200:
                serieses = meta_resp.json().get("serieses", [])
                if serieses:
                    meta = serieses[0]

            # Then get observations
            obs_resp = http_get(
                f"{FRED_API_URL}/series/observations",
                params={
                    "series_id": sid,
                    "api_key": api_key,
                    "file_type": "json",
                    "sort_order": "desc",
                    "limit": str(min(limit, 500)),
                },
                timeout=REQUEST_TIMEOUT,
            )
            if obs_resp.status_code != 200:
                logger.warning("FRED API %s: HTTP %s", sid, obs_resp.status_code)
                continue

            observations = obs_resp.json().get("observations", [])
        except Exception as exc:
            logger.warning("FRED fetch failed for %s: %s", sid, exc)
            continue

        batch: list[EconomicIndicatorPayload] = []
        for obs in observations:
            val_str = obs.get("value", ".")
            value = None
            if val_str and val_str != ".":
                try:
                    value = float(val_str)
                except ValueError:
                    pass

            batch.append(EconomicIndicatorPayload(
                source_name="FRED",
                series_id=sid,
                observation_date=obs.get("date", ""),
                value=value,
                title=meta.get("title", sid),
                frequency=meta.get("frequency_short", ""),
                units=meta.get("units_short", ""),
                raw_payload=json.dumps(obs, default=str),
            ))

        if batch:
            cached_json_set("fred", cache_key, [r.__dict__ for r in batch], ttl=21600)
        results.extend(batch)

    return results
