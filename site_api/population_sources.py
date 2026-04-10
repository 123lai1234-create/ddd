"""gnomAD API — population allele frequency data via GraphQL."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from site_api.cache import cached_json_get, cached_json_set
from site_api.http_client import post as http_post

logger = logging.getLogger(__name__)

GNOMAD_API_URL = "https://gnomad.broadinstitute.org/api"
REQUEST_TIMEOUT = 25


@dataclass(slots=True)
class AlleleFrequencyPayload:
    source_name: str
    variant_id: str
    query_term: str
    gene_symbol: str
    consequence: str
    allele_frequency: float | None
    homozygote_count: int | None
    population_frequencies: str
    record_url: str
    raw_payload: str


_GNOMAD_GENE_QUERY = """
query GeneVariants($gene: String!, $dataset: DatasetId!) {
  gene(gene_symbol: $gene, reference_genome: GRCh38) {
    variants(dataset: $dataset) {
      variant_id
      consequence
      flags
      exome {
        ac
        an
        homozygote_count
        populations { id ac an }
      }
      genome {
        ac
        an
        homozygote_count
        populations { id ac an }
      }
    }
  }
}
"""


def fetch_gnomad_variants(gene_symbol: str, limit: int = 20, dataset: str = "gnomad_r4") -> list[AlleleFrequencyPayload]:
    cache_key = f"{gene_symbol}:{dataset}:{limit}"
    cached = cached_json_get("gnomad", cache_key)
    if cached:
        return [AlleleFrequencyPayload(**r) for r in cached]

    try:
        resp = http_post(
            GNOMAD_API_URL,
            json={
                "query": _GNOMAD_GENE_QUERY,
                "variables": {"gene": gene_symbol, "dataset": dataset},
            },
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            logger.warning("gnomAD API %s: HTTP %s", gene_symbol, resp.status_code)
            return []
        body = resp.json()
    except Exception as exc:
        logger.warning("gnomAD fetch failed for %s: %s", gene_symbol, exc)
        return []

    gene_data = (body.get("data") or {}).get("gene")
    if not gene_data:
        return []

    variants = gene_data.get("variants", [])[:limit]
    results: list[AlleleFrequencyPayload] = []

    for v in variants:
        exome = v.get("exome") or {}
        genome = v.get("genome") or {}
        ac = (exome.get("ac") or 0) + (genome.get("ac") or 0)
        an = (exome.get("an") or 0) + (genome.get("an") or 0)
        af = ac / an if an > 0 else None
        hom = (exome.get("homozygote_count") or 0) + (genome.get("homozygote_count") or 0)

        pop_freqs = {}
        for source in [exome, genome]:
            for pop in source.get("populations", []):
                pid = pop.get("id", "")
                if pid and pop.get("an", 0) > 0:
                    pop_freqs[pid] = pop_freqs.get(pid, 0) + pop["ac"] / pop["an"]

        vid = v.get("variant_id", "")
        results.append(AlleleFrequencyPayload(
            source_name="gnomAD",
            variant_id=vid,
            query_term=gene_symbol,
            gene_symbol=gene_symbol,
            consequence=v.get("consequence", ""),
            allele_frequency=round(af, 8) if af is not None else None,
            homozygote_count=hom,
            population_frequencies=json.dumps(pop_freqs),
            record_url=f"https://gnomad.broadinstitute.org/variant/{vid}?dataset={dataset}",
            raw_payload=json.dumps(v, default=str),
        ))

    if results:
        cached_json_set("gnomad", cache_key, [r.__dict__ for r in results], ttl=43200)
    return results
