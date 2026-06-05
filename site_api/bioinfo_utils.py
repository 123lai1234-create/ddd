"""MyGene.info + MyVariant.info + Europe PMC + Expression Atlas + Ensembl VEP utility fetchers."""

from __future__ import annotations

import json
import logging

from site_api.cache import cached_json_get, cached_json_set
from site_api.http_client import get as http_get
from site_api.knowledge_sources import KnowledgeRecordPayload

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 20


# ── MyGene.info ──────────────────────────────────────────────────────────────

def fetch_mygene_info(query: str, limit: int = 5) -> list[dict]:
    cache_key = f"mygene:{query}:{limit}"
    cached = cached_json_get("mygene", cache_key)
    if cached:
        return cached

    try:
        resp = http_get(
            "https://mygene.info/v3/query",
            params={"q": query, "size": str(min(limit, 20)),
                    "fields": "symbol,name,alias,ensembl.gene,uniprot.Swiss-Prot,summary,type_of_gene,taxid",
                    "species": "human"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return []
        hits = resp.json().get("hits", [])
        results = [
            {
                "geneId": str(h.get("_id", "")),
                "symbol": h.get("symbol", ""),
                "name": h.get("name", ""),
                "aliases": h.get("alias", []) if isinstance(h.get("alias"), list) else [h.get("alias", "")],
                "ensemblGene": (h.get("ensembl", {}) or {}).get("gene", ""),
                "uniprotId": (h.get("uniprot", {}) or {}).get("Swiss-Prot", ""),
                "summary": h.get("summary", ""),
                "typeOfGene": h.get("type_of_gene", ""),
            }
            for h in hits
        ]
        cached_json_set("mygene", cache_key, results, ttl=86400)
        return results
    except Exception as exc:
        logger.warning("MyGene.info fetch failed: %s", exc)
        return []


# ── MyVariant.info ───────────────────────────────────────────────────────────

def fetch_myvariant_info(variant_id: str) -> dict | None:
    cache_key = f"myvariant:{variant_id}"
    cached = cached_json_get("myvariant", cache_key)
    if cached:
        return cached

    try:
        resp = http_get(
            f"https://myvariant.info/v1/variant/{variant_id}",
            params={"fields": "clinvar,gnomad_exome,cadd,dbnsfp,snpeff"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        cached_json_set("myvariant", cache_key, data, ttl=86400)
        return data
    except Exception as exc:
        logger.warning("MyVariant.info fetch failed: %s", exc)
        return None


# ── Europe PMC ───────────────────────────────────────────────────────────────

def fetch_europe_pmc(query: str, limit: int = 8) -> list[KnowledgeRecordPayload]:
    cache_key = f"europepmc:{query}:{limit}"
    cached = cached_json_get("europepmc", cache_key)
    if cached:
        return [KnowledgeRecordPayload(**r) for r in cached]

    try:
        resp = http_get(
            "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
            params={"query": query, "format": "json", "pageSize": str(min(limit, 25)),
                    "resultType": "core", "sort": "CITED desc"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return []
        results = resp.json().get("resultList", {}).get("result", [])
    except Exception as exc:
        logger.warning("Europe PMC fetch failed: %s", exc)
        return []

    records: list[KnowledgeRecordPayload] = []
    for r in results[:limit]:
        pmid = r.get("pmid", "") or r.get("id", "")
        abstract = r.get("abstractText", "")
        records.append(KnowledgeRecordPayload(
            record_type="literature",
            source_name="EuropePMC",
            source_id=str(pmid),
            query_term=query,
            title=r.get("title", ""),
            organism="",
            summary_text=abstract[:500] if abstract else "",
            content_text=abstract,
            keywords=", ".join(kw.get("keyword", "") for kw in (r.get("keywordList", {}).get("keyword", []) or [])[:6])
            if isinstance(r.get("keywordList"), dict) else "",
            record_url=f"https://europepmc.org/article/MED/{pmid}" if pmid else "",
            published_at=r.get("firstPublicationDate", ""),
            raw_payload=json.dumps(r, default=str),
        ))

    if records:
        cached_json_set("europepmc", cache_key, [rec.__dict__ for rec in records], ttl=21600)
    return records


# ── Expression Atlas ─────────────────────────────────────────────────────────

def fetch_expression_atlas(gene_symbol: str, limit: int = 8) -> list[KnowledgeRecordPayload]:
    cache_key = f"expratlas:{gene_symbol}:{limit}"
    cached = cached_json_get("expratlas", cache_key)
    if cached:
        return [KnowledgeRecordPayload(**r) for r in cached]

    try:
        resp = http_get(
            "https://www.ebi.ac.uk/gxa/json/experiments",
            params={"geneQuery": gene_symbol, "species": "Homo sapiens"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return []
        experiments = resp.json().get("experiments", [])
    except Exception as exc:
        logger.warning("Expression Atlas fetch failed for %s: %s", gene_symbol, exc)
        return []

    records: list[KnowledgeRecordPayload] = []
    for exp in experiments[:limit]:
        acc = exp.get("experimentAccession", "")
        records.append(KnowledgeRecordPayload(
            record_type="expression_dataset",
            source_name="ExpressionAtlas",
            source_id=acc,
            query_term=gene_symbol,
            title=exp.get("experimentDescription", ""),
            organism=exp.get("species", "Homo sapiens"),
            summary_text=f"{exp.get('experimentType', '')} — {exp.get('numberOfAssays', '?')} assays",
            content_text=exp.get("experimentDescription", ""),
            keywords=exp.get("experimentType", ""),
            record_url=f"https://www.ebi.ac.uk/gxa/experiments/{acc}" if acc else "",
            published_at=exp.get("lastUpdate", ""),
            raw_payload=json.dumps(exp, default=str),
        ))

    if records:
        cached_json_set("expratlas", cache_key, [rec.__dict__ for rec in records], ttl=43200)
    return records


# ── Ensembl VEP (Variant Effect Predictor) ───────────────────────────────────

def fetch_ensembl_vep(hgvs_notation: str) -> dict | None:
    """Predict variant effects via Ensembl VEP REST API.
    hgvs_notation example: '17:g.7674220G>A' or 'ENST00000269305.4:c.817C>T'
    """
    cache_key = f"vep:{hgvs_notation}"
    cached = cached_json_get("vep", cache_key)
    if cached:
        return cached

    try:
        resp = http_get(
            f"https://rest.ensembl.org/vep/human/hgvs/{hgvs_notation}",
            params={"content-type": "application/json",
                    "CADD": "1", "Conservation": "1", "protein": "1", "hgvs": "1"},
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        result = data[0] if isinstance(data, list) and data else data
        cached_json_set("vep", cache_key, result, ttl=86400)
        return result
    except Exception as exc:
        logger.warning("Ensembl VEP fetch failed for %s: %s", hgvs_notation, exc)
        return None
