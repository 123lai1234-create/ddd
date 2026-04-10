"""ClinVar + COSMIC — clinical variant data fetchers."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from xml.etree import ElementTree as ET

from site_api.cache import cached_json_get, cached_json_set
from site_api.http_client import get as http_get

logger = logging.getLogger(__name__)

NCBI_EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
REQUEST_TIMEOUT = 20


def _ncbi_params() -> dict:
    params: dict[str, str] = {"retmode": "json"}
    api_key = os.getenv("NCBI_API_KEY", "").strip()
    if api_key:
        params["api_key"] = api_key
    return params


@dataclass(slots=True)
class ClinicalVariantPayload:
    source_name: str
    source_id: str
    query_term: str
    gene_symbol: str
    variant_name: str
    clinical_significance: str
    condition_names: str
    review_status: str
    variant_type: str
    chromosome: str
    position: str
    record_url: str
    raw_payload: str


def fetch_clinvar_variants(gene_symbol: str, limit: int = 12) -> list[ClinicalVariantPayload]:
    cache_key = f"{gene_symbol}:{limit}"
    cached = cached_json_get("clinvar", cache_key)
    if cached:
        return [ClinicalVariantPayload(**r) for r in cached]

    query = f'{gene_symbol}[gene] AND "clinsig pathogenic"[Properties]'
    params = {**_ncbi_params(), "db": "clinvar", "term": query, "retmax": str(min(limit, 50))}

    try:
        search_resp = http_get(f"{NCBI_EUTILS_BASE}/esearch.fcgi", params=params, timeout=REQUEST_TIMEOUT)
        search_data = search_resp.json()
        ids = search_data.get("esearchresult", {}).get("idlist", [])
        if not ids:
            return []

        summary_params = {**_ncbi_params(), "db": "clinvar", "id": ",".join(ids[:limit])}
        summary_resp = http_get(f"{NCBI_EUTILS_BASE}/esummary.fcgi", params=summary_params, timeout=REQUEST_TIMEOUT)
        summary_data = summary_resp.json()
    except Exception as exc:
        logger.warning("ClinVar fetch failed for %s: %s", gene_symbol, exc)
        return []

    results: list[ClinicalVariantPayload] = []
    result_map = summary_data.get("result", {})
    for uid in result_map.get("uids", []):
        entry = result_map.get(uid, {})
        genes = entry.get("genes", [{}])
        gene = genes[0].get("symbol", gene_symbol) if genes else gene_symbol
        loc = entry.get("variation_set", [{}])
        chrom = ""
        pos = ""
        if loc:
            v = loc[0].get("variation_loc", [{}])
            if v:
                chrom = str(v[0].get("chr", ""))
                pos = str(v[0].get("start", ""))

        results.append(ClinicalVariantPayload(
            source_name="ClinVar",
            source_id=str(uid),
            query_term=query,
            gene_symbol=gene,
            variant_name=entry.get("title", ""),
            clinical_significance=entry.get("clinical_significance", {}).get("description", ""),
            condition_names=", ".join(
                t.get("trait_name", "") for t in entry.get("trait_set", []) if t.get("trait_name")
            ),
            review_status=entry.get("clinical_significance", {}).get("review_status", ""),
            variant_type=entry.get("variation_type", ""),
            chromosome=chrom,
            position=pos,
            record_url=f"https://www.ncbi.nlm.nih.gov/clinvar/variation/{uid}/",
            raw_payload=json.dumps(entry, default=str),
        ))

    if results:
        cached_json_set("clinvar", cache_key, [r.__dict__ for r in results], ttl=43200)
    return results


def fetch_cosmic_mutations(gene_symbol: str, limit: int = 12) -> list[ClinicalVariantPayload]:
    """Fetch COSMIC somatic mutations (requires COSMIC_API_KEY env var)."""
    api_key = os.getenv("COSMIC_API_KEY", "").strip()
    if not api_key:
        logger.info("COSMIC_API_KEY not set — skipping COSMIC fetch.")
        return []

    cache_key = f"cosmic:{gene_symbol}:{limit}"
    cached = cached_json_get("cosmic", cache_key)
    if cached:
        return [ClinicalVariantPayload(**r) for r in cached]

    try:
        headers = {"Authorization": f"Bearer {api_key}"}
        resp = http_get(
            f"https://cancer.sanger.ac.uk/cosmic/api/gene/{gene_symbol}/mutations",
            headers=headers,
            params={"limit": str(limit)},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.warning("COSMIC API %s: HTTP %s", gene_symbol, resp.status_code)
            return []
        entries = resp.json() if isinstance(resp.json(), list) else []
    except Exception as exc:
        logger.warning("COSMIC fetch failed for %s: %s", gene_symbol, exc)
        return []

    results: list[ClinicalVariantPayload] = []
    for entry in entries[:limit]:
        results.append(ClinicalVariantPayload(
            source_name="COSMIC",
            source_id=str(entry.get("id", "")),
            query_term=gene_symbol,
            gene_symbol=gene_symbol,
            variant_name=entry.get("mutation_cds", ""),
            clinical_significance=entry.get("fathmm_prediction", ""),
            condition_names=entry.get("primary_site", ""),
            review_status=entry.get("status", ""),
            variant_type=entry.get("mutation_type", ""),
            chromosome=str(entry.get("chromosome", "")),
            position=str(entry.get("genome_start", "")),
            record_url=f"https://cancer.sanger.ac.uk/cosmic/mutation/overview?id={entry.get('id', '')}",
            raw_payload=json.dumps(entry, default=str),
        ))

    if results:
        cached_json_set("cosmic", cache_key, [r.__dict__ for r in results], ttl=43200)
    return results
