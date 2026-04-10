"""STRING DB API — protein-protein interaction network data."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from site_api.cache import cached_json_get, cached_json_set
from site_api.http_client import get as http_get

logger = logging.getLogger(__name__)

STRING_API_URL = "https://string-db.org/api"
REQUEST_TIMEOUT = 20


@dataclass(slots=True)
class ProteinInteractionPayload:
    source_name: str
    source_id: str
    query_term: str
    protein_a: str
    protein_b: str
    combined_score: int
    experimental_score: int | None
    database_score: int | None
    textmining_score: int | None
    organism_id: int
    record_url: str
    raw_payload: str


def fetch_string_interactions(identifiers: list[str], species: int = 9606, limit: int = 20) -> list[ProteinInteractionPayload]:
    query_key = ",".join(sorted(identifiers))
    cache_key = f"{query_key}:{species}:{limit}"
    cached = cached_json_get("string", cache_key)
    if cached:
        return [ProteinInteractionPayload(**r) for r in cached]

    try:
        params = {
            "identifiers": "%0d".join(identifiers),
            "species": str(species),
            "limit": str(limit),
            "caller_identity": "donttalk-portfolio",
        }
        resp = http_get(f"{STRING_API_URL}/json/network", params=params, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            logger.warning("STRING API HTTP %s", resp.status_code)
            return []
        entries = resp.json()
    except Exception as exc:
        logger.warning("STRING fetch failed: %s", exc)
        return []

    results: list[ProteinInteractionPayload] = []
    seen: set[str] = set()
    for entry in entries:
        pa = entry.get("preferredName_A", entry.get("stringId_A", ""))
        pb = entry.get("preferredName_B", entry.get("stringId_B", ""))
        pair_key = f"{min(pa, pb)}--{max(pa, pb)}"
        if pair_key in seen:
            continue
        seen.add(pair_key)

        results.append(ProteinInteractionPayload(
            source_name="STRING",
            source_id=pair_key,
            query_term=query_key,
            protein_a=pa,
            protein_b=pb,
            combined_score=int(entry.get("score", 0) * 1000) if isinstance(entry.get("score"), float) else int(entry.get("score", 0)),
            experimental_score=_safe_int(entry.get("escore")),
            database_score=_safe_int(entry.get("dscore")),
            textmining_score=_safe_int(entry.get("tscore")),
            organism_id=species,
            record_url=f"https://string-db.org/network/{entry.get('stringId_A', '')}",
            raw_payload=json.dumps(entry, default=str),
        ))

    if results:
        cached_json_set("string", cache_key, [r.__dict__ for r in results], ttl=43200)
    return results[:limit]


def _safe_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value) * 1000) if isinstance(value, float) else int(value)
    except (ValueError, TypeError):
        return None
