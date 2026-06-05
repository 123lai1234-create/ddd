"""OpenTargets Platform API — gene-disease-drug association data via GraphQL."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass

from site_api.cache import cached_json_get, cached_json_set
from site_api.http_client import post as http_post

logger = logging.getLogger(__name__)

OT_API_URL = "https://api.platform.opentargets.org/api/v4/graphql"
REQUEST_TIMEOUT = 20


@dataclass(slots=True)
class OpenTargetsAssociationPayload:
    source_name: str
    source_id: str
    query_term: str
    target_id: str
    target_symbol: str
    disease_id: str
    disease_name: str
    overall_score: float
    datatype_scores: str
    drug_names: str
    record_url: str
    raw_payload: str


_OT_ASSOCIATIONS_QUERY = """
query TargetAssociations($ensemblId: String!, $size: Int!) {
  target(ensemblId: $ensemblId) {
    id
    approvedSymbol
    associatedDiseases(page: {size: $size, index: 0}) {
      rows {
        disease { id name }
        score
                datatypeScores { id score }
      }
    }
  }
}
"""

_OT_TARGET_QUERY = """
query TargetInfo($ensemblId: String!) {
  target(ensemblId: $ensemblId) {
    id
    approvedSymbol
    approvedName
    biotype
        drugAndClinicalCandidates {
            rows { drug { id name } maxClinicalStage }
    }
  }
}
"""


def _resolve_ensembl_id(gene_symbol: str) -> str | None:
    """Use OpenTargets search to resolve gene symbol to Ensembl ID."""
    try:
        resp = http_post(
            OT_API_URL,
            json={"query": 'query Search($q: String!) { search(queryString: $q, entityNames: ["target"], page: {size: 1, index: 0}) { hits { id } } }',
                  "variables": {"q": gene_symbol}},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code == 200:
            hits = resp.json().get("data", {}).get("search", {}).get("hits", [])
            if hits:
                return hits[0].get("id")
    except Exception:
        pass
    return None


def fetch_opentargets_associations(gene_symbol: str, limit: int = 10) -> list[OpenTargetsAssociationPayload]:
    cache_key = f"ot:{gene_symbol}:{limit}"
    cached = cached_json_get("opentargets", cache_key)
    if cached:
        return [OpenTargetsAssociationPayload(**r) for r in cached]

    ensembl_id = _resolve_ensembl_id(gene_symbol)
    if not ensembl_id:
        logger.warning("OpenTargets: could not resolve %s to Ensembl ID", gene_symbol)
        return []

    try:
        resp = http_post(
            OT_API_URL,
            json={"query": _OT_ASSOCIATIONS_QUERY, "variables": {"ensemblId": ensembl_id, "size": limit}},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return []
        data = resp.json().get("data", {}).get("target", {})
    except Exception as exc:
        logger.warning("OpenTargets fetch failed for %s: %s", gene_symbol, exc)
        return []

    symbol = data.get("approvedSymbol", gene_symbol)
    rows = data.get("associatedDiseases", {}).get("rows", [])

    # Also fetch known drugs
    drug_map: dict[str, list[str]] = {}
    try:
        drug_resp = http_post(
            OT_API_URL,
            json={"query": _OT_TARGET_QUERY, "variables": {"ensemblId": ensembl_id}},
            timeout=REQUEST_TIMEOUT,
        )
        if drug_resp.status_code == 200:
            drug_rows = drug_resp.json().get("data", {}).get("target", {}).get("drugAndClinicalCandidates", {}).get("rows", [])
            for dr in drug_rows:
                name = (dr.get("drug") or {}).get("name", "")
                if name:
                    drug_map.setdefault("all", []).append(name)
    except Exception:
        pass

    results: list[OpenTargetsAssociationPayload] = []
    for row in rows[:limit]:
        disease = row.get("disease", {})
        dt_scores = {s.get("id", ""): round(s.get("score", 0), 4) for s in row.get("datatypeScores", []) if s.get("id")}
        results.append(OpenTargetsAssociationPayload(
            source_name="OpenTargets",
            source_id=f"{ensembl_id}--{disease.get('id', '')}",
            query_term=gene_symbol,
            target_id=ensembl_id,
            target_symbol=symbol,
            disease_id=disease.get("id", ""),
            disease_name=disease.get("name", ""),
            overall_score=round(row.get("score", 0), 4),
            datatype_scores=json.dumps(dt_scores),
            drug_names=", ".join(drug_map.get("all", [])[:5]),
            record_url=f"https://platform.opentargets.org/target/{ensembl_id}/associations",
            raw_payload=json.dumps(row, default=str),
        ))

    if results:
        cached_json_set("opentargets", cache_key, [asdict(r) for r in results], ttl=43200)
    return results
