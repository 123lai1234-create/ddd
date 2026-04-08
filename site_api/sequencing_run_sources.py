from __future__ import annotations

from dataclasses import dataclass
import json

import requests


ENA_PORTAL_SEARCH_URL = "https://www.ebi.ac.uk/ena/portal/api/search"
REQUEST_TIMEOUT = 20


@dataclass(slots=True)
class SequencingRunPayload:
    source_name: str
    source_id: str
    query_term: str
    study_accession: str
    experiment_accession: str
    sample_accession: str
    organism: str
    library_strategy: str
    library_source: str
    library_layout: str
    instrument_platform: str
    instrument_model: str
    read_count: int | None
    base_count: int | None
    fastq_bytes: int | None
    published_at: str
    ftp_url: str
    record_url: str
    raw_payload: str


def _parse_int(value: str | int | None) -> int | None:
    normalized = str(value or "").strip().replace(",", "")
    if not normalized:
        return None
    try:
        return int(float(normalized))
    except ValueError:
        return None


def fetch_ena_sequencing_runs(query: str, limit: int) -> list[SequencingRunPayload]:
    response = requests.get(
        ENA_PORTAL_SEARCH_URL,
        params={
            "result": "read_run",
            "query": query,
            "fields": ",".join(
                [
                    "run_accession",
                    "study_accession",
                    "experiment_accession",
                    "sample_accession",
                    "scientific_name",
                    "library_strategy",
                    "library_source",
                    "library_layout",
                    "instrument_platform",
                    "instrument_model",
                    "read_count",
                    "base_count",
                    "fastq_bytes",
                    "first_public",
                    "fastq_ftp",
                ]
            ),
            "format": "json",
            "limit": limit,
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    payload = response.json()
    records: list[SequencingRunPayload] = []
    for item in payload:
        run_accession = str(item.get("run_accession") or "").strip()
        if not run_accession:
            continue

        ftp_url = str(item.get("fastq_ftp") or "").strip()
        record_url = f"https://www.ebi.ac.uk/ena/browser/view/{run_accession}"
        if ftp_url:
            first_ftp = ftp_url.split(";")[0].strip()
            if first_ftp:
                ftp_url = f"ftp://{first_ftp}" if not first_ftp.startswith("ftp://") else first_ftp

        records.append(
            SequencingRunPayload(
                source_name="ENA",
                source_id=run_accession,
                query_term=query,
                study_accession=str(item.get("study_accession") or "").strip(),
                experiment_accession=str(item.get("experiment_accession") or "").strip(),
                sample_accession=str(item.get("sample_accession") or "").strip(),
                organism=str(item.get("scientific_name") or "Unknown organism").strip(),
                library_strategy=str(item.get("library_strategy") or "").strip(),
                library_source=str(item.get("library_source") or "").strip(),
                library_layout=str(item.get("library_layout") or "").strip(),
                instrument_platform=str(item.get("instrument_platform") or "").strip(),
                instrument_model=str(item.get("instrument_model") or "").strip(),
                read_count=_parse_int(item.get("read_count")),
                base_count=_parse_int(item.get("base_count")),
                fastq_bytes=_parse_int(item.get("fastq_bytes")),
                published_at=str(item.get("first_public") or "").strip(),
                ftp_url=ftp_url,
                record_url=record_url,
                raw_payload=json.dumps(item, ensure_ascii=False),
            )
        )

    return records