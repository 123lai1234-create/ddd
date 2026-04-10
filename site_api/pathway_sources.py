"""QuickGO + Reactome — GO term annotations and pathway data."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from site_api.cache import cached_json_get, cached_json_set
from site_api.http_client import get as http_get
from site_api.knowledge_sources import KnowledgeRecordPayload

logger = logging.getLogger(__name__)

QUICKGO_API_URL = "https://www.ebi.ac.uk/QuickGO/services"
REACTOME_API_URL = "https://reactome.org/ContentService"
REQUEST_TIMEOUT = 20


# ── QuickGO (Gene Ontology annotations) ─────────────────────────────────────

def fetch_quickgo_annotations(uniprot_id: str, limit: int = 15) -> list[KnowledgeRecordPayload]:
    cache_key = f"quickgo:{uniprot_id}:{limit}"
    cached = cached_json_get("quickgo", cache_key)
    if cached:
        return [KnowledgeRecordPayload(**r) for r in cached]

    try:
        resp = http_get(
            f"{QUICKGO_API_URL}/annotation/search",
            params={"geneProductId": uniprot_id, "limit": str(min(limit, 50)),
                    "geneProductType": "protein", "taxonId": "9606"},
            headers={"Accept": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return []
        results_data = resp.json().get("results", [])
    except Exception as exc:
        logger.warning("QuickGO fetch failed for %s: %s", uniprot_id, exc)
        return []

    seen: set[str] = set()
    records: list[KnowledgeRecordPayload] = []
    for entry in results_data:
        go_id = entry.get("goId", "")
        if not go_id or go_id in seen:
            continue
        seen.add(go_id)

        records.append(KnowledgeRecordPayload(
            record_type="go_annotation",
            source_name="QuickGO",
            source_id=f"{uniprot_id}:{go_id}",
            query_term=uniprot_id,
            title=entry.get("goName", go_id),
            organism=str(entry.get("taxonId", "")),
            summary_text=f"{entry.get('goAspect', '')} — {entry.get('goName', '')}",
            content_text=entry.get("goName", ""),
            keywords=f"{entry.get('goAspect', '')},{entry.get('qualifier', '')}",
            record_url=f"https://www.ebi.ac.uk/QuickGO/term/{go_id}",
            published_at="",
            raw_payload=json.dumps(entry, default=str),
        ))

    if records:
        cached_json_set("quickgo", cache_key, [r.__dict__ for r in records], ttl=86400)
    return records[:limit]


# ── Reactome (Pathway data) ──────────────────────────────────────────────────

def fetch_reactome_pathways(gene_symbol: str, species: str = "Homo sapiens", limit: int = 10) -> list[KnowledgeRecordPayload]:
    cache_key = f"reactome:{gene_symbol}:{limit}"
    cached = cached_json_get("reactome", cache_key)
    if cached:
        return [KnowledgeRecordPayload(**r) for r in cached]

    try:
        resp = http_get(
            f"{REACTOME_API_URL}/search/query",
            params={"query": gene_symbol, "species": species, "types": "Pathway",
                    "cluster": "true"},
            headers={"Accept": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return []
        body = resp.json()
    except Exception as exc:
        logger.warning("Reactome fetch failed for %s: %s", gene_symbol, exc)
        return []

    entries = body.get("results", [])
    records: list[KnowledgeRecordPayload] = []
    for group in entries:
        for entry in group.get("entries", [])[:limit]:
            st_id = entry.get("stId", "")
            records.append(KnowledgeRecordPayload(
                record_type="pathway",
                source_name="Reactome",
                source_id=st_id,
                query_term=gene_symbol,
                title=entry.get("name", ""),
                organism=entry.get("species", [species])[0] if entry.get("species") else species,
                summary_text=entry.get("summation", [""])[0] if entry.get("summation") else "",
                content_text=entry.get("summation", [""])[0] if entry.get("summation") else "",
                keywords=entry.get("compartmentNames", [""])[0] if entry.get("compartmentNames") else "",
                record_url=f"https://reactome.org/content/detail/{st_id}",
                published_at="",
                raw_payload=json.dumps(entry, default=str),
            ))

    if records:
        cached_json_set("reactome", cache_key, [r.__dict__ for r in records[:limit]], ttl=86400)
    return records[:limit]
