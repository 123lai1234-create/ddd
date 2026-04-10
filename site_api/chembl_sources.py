"""ChEMBL API — drug target, compound, and bioactivity data."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from site_api.cache import cached_json_get, cached_json_set
from site_api.http_client import get as http_get

logger = logging.getLogger(__name__)

CHEMBL_API_URL = "https://www.ebi.ac.uk/chembl/api/data"
REQUEST_TIMEOUT = 20


@dataclass(slots=True)
class ChEMBLCompoundPayload:
    source_name: str
    source_id: str
    query_term: str
    molecule_name: str
    molecule_chembl_id: str
    target_chembl_id: str
    target_name: str
    mechanism_of_action: str
    activity_type: str
    activity_value: float | None
    activity_units: str
    max_phase: int | None
    record_url: str
    raw_payload: str


def _resolve_target_chembl_id(gene_symbol: str) -> str | None:
    try:
        resp = http_get(
            f"{CHEMBL_API_URL}/target/search.json",
            params={"q": gene_symbol, "limit": "1"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code == 200:
            targets = resp.json().get("targets", [])
            if targets:
                return targets[0].get("target_chembl_id")
    except Exception:
        pass
    return None


def fetch_chembl_compounds(gene_symbol: str, limit: int = 12) -> list[ChEMBLCompoundPayload]:
    cache_key = f"chembl:{gene_symbol}:{limit}"
    cached = cached_json_get("chembl", cache_key)
    if cached:
        return [ChEMBLCompoundPayload(**r) for r in cached]

    target_id = _resolve_target_chembl_id(gene_symbol)
    if not target_id:
        logger.info("ChEMBL: could not resolve target for %s", gene_symbol)
        return []

    # Fetch mechanisms of action for this target
    results: list[ChEMBLCompoundPayload] = []

    try:
        mech_resp = http_get(
            f"{CHEMBL_API_URL}/mechanism.json",
            params={"target_chembl_id": target_id, "limit": str(min(limit, 30))},
            timeout=REQUEST_TIMEOUT,
        )
        if mech_resp.status_code == 200:
            mechanisms = mech_resp.json().get("mechanisms", [])
            for m in mechanisms[:limit]:
                mol_id = m.get("molecule_chembl_id", "")
                results.append(ChEMBLCompoundPayload(
                    source_name="ChEMBL",
                    source_id=f"{target_id}:{mol_id}",
                    query_term=gene_symbol,
                    molecule_name=m.get("molecule_name") or mol_id,
                    molecule_chembl_id=mol_id,
                    target_chembl_id=target_id,
                    target_name=m.get("target_name", gene_symbol),
                    mechanism_of_action=m.get("mechanism_of_action", ""),
                    activity_type="mechanism",
                    activity_value=None,
                    activity_units="",
                    max_phase=m.get("max_phase"),
                    record_url=f"https://www.ebi.ac.uk/chembl/compound_report_card/{mol_id}/" if mol_id else "",
                    raw_payload=json.dumps(m, default=str),
                ))
    except Exception as exc:
        logger.warning("ChEMBL mechanism fetch failed for %s: %s", gene_symbol, exc)

    # If not enough from mechanisms, supplement with bioactivities
    if len(results) < limit:
        try:
            act_resp = http_get(
                f"{CHEMBL_API_URL}/activity.json",
                params={"target_chembl_id": target_id, "limit": str(min(limit - len(results), 20)),
                        "pchembl_value__isnull": "false"},
                timeout=REQUEST_TIMEOUT,
            )
            if act_resp.status_code == 200:
                activities = act_resp.json().get("activities", [])
                for a in activities:
                    mol_id = a.get("molecule_chembl_id", "")
                    results.append(ChEMBLCompoundPayload(
                        source_name="ChEMBL",
                        source_id=f"{target_id}:{mol_id}:{a.get('activity_id', '')}",
                        query_term=gene_symbol,
                        molecule_name=a.get("molecule_name") or mol_id,
                        molecule_chembl_id=mol_id,
                        target_chembl_id=target_id,
                        target_name=a.get("target_pref_name", gene_symbol),
                        mechanism_of_action="",
                        activity_type=a.get("standard_type", ""),
                        activity_value=_safe_float(a.get("standard_value")),
                        activity_units=a.get("standard_units", ""),
                        max_phase=None,
                        record_url=f"https://www.ebi.ac.uk/chembl/compound_report_card/{mol_id}/" if mol_id else "",
                        raw_payload=json.dumps(a, default=str),
                    ))
        except Exception as exc:
            logger.warning("ChEMBL activity fetch failed for %s: %s", gene_symbol, exc)

    if results:
        cached_json_set("chembl", cache_key, [r.__dict__ for r in results], ttl=43200)
    return results[:limit]


def _safe_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None
