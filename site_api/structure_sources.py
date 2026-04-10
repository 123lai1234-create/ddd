"""AlphaFold DB API — fetch predicted protein structures."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from site_api.cache import cached_json_get, cached_json_set
from site_api.http_client import get as http_get

logger = logging.getLogger(__name__)

ALPHAFOLD_API_URL = "https://alphafold.ebi.ac.uk/api"
REQUEST_TIMEOUT = 20


@dataclass(slots=True)
class StructurePredictionPayload:
    source_name: str
    uniprot_id: str
    entry_id: str
    gene_name: str
    organism: str
    confidence_avg: float | None
    model_url: str
    model_page_url: str
    sequence_length: int
    raw_payload: str


def fetch_alphafold_predictions(uniprot_ids: list[str], limit: int = 10) -> list[StructurePredictionPayload]:
    results: list[StructurePredictionPayload] = []
    for uid in uniprot_ids[:limit]:
        uid = uid.strip().upper()
        if not uid:
            continue

        cached = cached_json_get("alphafold", uid)
        if cached:
            entries = cached if isinstance(cached, list) else [cached]
        else:
            try:
                resp = http_get(f"{ALPHAFOLD_API_URL}/prediction/{uid}", timeout=REQUEST_TIMEOUT)
                if resp.status_code != 200:
                    logger.warning("AlphaFold API %s: HTTP %s", uid, resp.status_code)
                    continue
                entries = resp.json()
                if not isinstance(entries, list):
                    entries = [entries]
                cached_json_set("alphafold", uid, entries, ttl=86400)
            except Exception as exc:
                logger.warning("AlphaFold fetch failed for %s: %s", uid, exc)
                continue

        for entry in entries:
            results.append(StructurePredictionPayload(
                source_name="AlphaFold",
                uniprot_id=entry.get("uniprotAccession", uid),
                entry_id=entry.get("entryId", ""),
                gene_name=entry.get("gene", ""),
                organism=entry.get("organismScientificName", ""),
                confidence_avg=entry.get("globalMetricValue"),
                model_url=entry.get("cifUrl") or entry.get("pdbUrl", ""),
                model_page_url=f"https://alphafold.ebi.ac.uk/entry/{entry.get('entryId', '')}",
                sequence_length=entry.get("uniprotEnd", 0) - entry.get("uniprotStart", 0) + 1
                if entry.get("uniprotEnd") else 0,
                raw_payload=json.dumps(entry, default=str),
            ))
    return results
