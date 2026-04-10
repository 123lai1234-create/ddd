from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from site_api.http_client import get as http_get
from site_api.shared_utils import protein_name as _protein_name


UNIPROT_SEARCH_URL = "https://rest.uniprot.org/uniprotkb/search"
ENSEMBL_BASE_URL = "https://rest.ensembl.org"
REQUEST_TIMEOUT = 20


@dataclass(slots=True)
class SequenceRecordPayload:
    sequence_type: str
    source_name: str
    source_id: str
    query_term: str
    display_name: str
    organism: str
    sequence: str
    sequence_length: int
    description: str
    record_url: str


def _title_case_species(value: str) -> str:
    return " ".join(part.capitalize() for part in value.replace("_", " ").split())


def fetch_protein_sequences(query: str, limit: int) -> list[SequenceRecordPayload]:
    response = http_get(
        UNIPROT_SEARCH_URL,
        params={"query": query, "format": "json", "size": limit},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    records: list[SequenceRecordPayload] = []
    for result in response.json().get("results", []):
        sequence = ((result.get("sequence") or {}).get("value") or "").strip().upper()
        if not sequence:
            continue

        accession = str(result.get("primaryAccession") or "").strip()
        if not accession:
            continue

        organism = ((result.get("organism") or {}).get("scientificName") or "Unknown organism").strip()
        records.append(
            SequenceRecordPayload(
                sequence_type="protein",
                source_name="UniProt",
                source_id=accession,
                query_term=query,
                display_name=_protein_name(result),
                organism=organism,
                sequence=sequence,
                sequence_length=int((result.get("sequence") or {}).get("length") or len(sequence)),
                description=str(result.get("entryType") or "UniProtKB record"),
                record_url=f"https://www.uniprot.org/uniprotkb/{accession}",
            )
        )

    return records


def _resolve_gene_stable_id(symbol: str, species: str) -> str | None:
    response = http_get(
        f"{ENSEMBL_BASE_URL}/xrefs/symbol/{species}/{symbol}",
        params={"content-type": "application/json"},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    for item in response.json():
        if item.get("type") == "gene" and item.get("id"):
            return str(item["id"])
    return None


def fetch_gene_sequences(gene_symbols: list[str], species: str) -> list[SequenceRecordPayload]:
    records: list[SequenceRecordPayload] = []

    for symbol in gene_symbols:
        stable_id = _resolve_gene_stable_id(symbol, species)
        if not stable_id:
            continue

        lookup_response = http_get(
            f"{ENSEMBL_BASE_URL}/lookup/id/{stable_id}",
            params={"content-type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        lookup_response.raise_for_status()
        lookup = lookup_response.json()

        sequence_response = http_get(
            f"{ENSEMBL_BASE_URL}/sequence/id/{stable_id}",
            params={"object_type": "gene", "content-type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        sequence_response.raise_for_status()
        sequence_data = sequence_response.json()

        sequence = str(sequence_data.get("seq") or "").strip().upper()
        if not sequence:
            continue

        display_name = str(lookup.get("display_name") or symbol).strip()
        organism = _title_case_species(str(lookup.get("species") or species))
        description = str(lookup.get("description") or sequence_data.get("desc") or "Ensembl gene record").strip()

        records.append(
            SequenceRecordPayload(
                sequence_type="gene",
                source_name="Ensembl",
                source_id=stable_id,
                query_term=symbol,
                display_name=display_name,
                organism=organism,
                sequence=sequence,
                sequence_length=len(sequence),
                description=description,
                record_url=f"https://www.ensembl.org/id/{stable_id}",
            )
        )

    return records