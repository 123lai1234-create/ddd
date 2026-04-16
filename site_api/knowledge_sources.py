from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass
from typing import Any
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

from site_api.cache import cached_json_get, cached_json_set
from site_api.http_client import get as http_get
from site_api.shared_utils import protein_name as _protein_name


UNIPROT_SEARCH_URL = "https://rest.uniprot.org/uniprotkb/search"
SEMANTIC_SCHOLAR_URL = "https://api.semanticscholar.org/graph/v1"
INTERPRO_API_URL = "https://www.ebi.ac.uk/interpro/api"
OPENALEX_API_URL = "https://api.openalex.org"
NCBI_EUTILS_BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
NCBI_ESEARCH_URL = f"{NCBI_EUTILS_BASE_URL}/esearch.fcgi"
NCBI_ESUMMARY_URL = f"{NCBI_EUTILS_BASE_URL}/esummary.fcgi"
NCBI_EFETCH_URL = f"{NCBI_EUTILS_BASE_URL}/efetch.fcgi"
REQUEST_TIMEOUT = 20


@dataclass(slots=True)
class KnowledgeRecordPayload:
    record_type: str
    source_name: str
    source_id: str
    query_term: str
    title: str
    organism: str
    summary_text: str
    content_text: str
    keywords: str
    record_url: str
    published_at: str
    raw_payload: str


def _join_unique(values: list[str], limit: int | None = None) -> list[str]:
    unique_values: list[str] = []
    for value in values:
        normalized = str(value or "").strip()
        if normalized and normalized not in unique_values:
            unique_values.append(normalized)
            if limit is not None and len(unique_values) >= limit:
                break
    return unique_values


def _truncate(text: str, max_length: int = 4000) -> str:
    normalized = " ".join(str(text or "").split())
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 3].rstrip() + "..."


def _extract_gene_names(result: dict[str, Any]) -> list[str]:
    gene_names: list[str] = []
    for gene in result.get("genes") or []:
        primary_name = (((gene or {}).get("geneName") or {}).get("value"))
        if primary_name:
            gene_names.append(str(primary_name))
        for synonym in (gene or {}).get("synonyms") or []:
            synonym_name = (synonym or {}).get("value")
            if synonym_name:
                gene_names.append(str(synonym_name))
    return _join_unique(gene_names, limit=10)


def _extract_comment_texts(result: dict[str, Any], comment_type: str) -> list[str]:
    texts: list[str] = []
    for comment in result.get("comments") or []:
        if str(comment.get("commentType") or "").strip().upper() != comment_type.upper():
            continue
        for text_payload in comment.get("texts") or []:
            value = str((text_payload or {}).get("value") or "").strip()
            if value:
                texts.append(value)

        if comment_type.upper() == "DISEASE":
            disease = comment.get("disease") or {}
            disease_description = str(disease.get("description") or "").strip()
            if disease_description:
                texts.append(disease_description)

    return _join_unique(texts, limit=6)


def _extract_keywords(result: dict[str, Any]) -> list[str]:
    keywords = [str((keyword or {}).get("name") or "").strip() for keyword in (result.get("keywords") or [])]
    return _join_unique(keywords, limit=20)


def _extract_pubmed_ids(result: dict[str, Any]) -> list[str]:
    pubmed_ids: list[str] = []
    for reference in result.get("references") or []:
        citation = (reference or {}).get("citation") or {}
        for cross_reference in citation.get("citationCrossReferences") or []:
            if str((cross_reference or {}).get("database") or "") == "PubMed":
                pubmed_id = str((cross_reference or {}).get("id") or "").strip()
                if pubmed_id:
                    pubmed_ids.append(pubmed_id)
    return _join_unique(pubmed_ids, limit=12)


def fetch_uniprot_knowledge(query: str, limit: int) -> list[KnowledgeRecordPayload]:
    response = http_get(
        UNIPROT_SEARCH_URL,
        params={"query": query, "format": "json", "size": limit},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    records: list[KnowledgeRecordPayload] = []
    for result in response.json().get("results", []):
        accession = str(result.get("primaryAccession") or "").strip()
        if not accession:
            continue

        title = _protein_name(result)
        organism = str((result.get("organism") or {}).get("scientificName") or "Unknown organism").strip()
        gene_names = _extract_gene_names(result)
        function_notes = _extract_comment_texts(result, "FUNCTION")
        localization_notes = _extract_comment_texts(result, "SUBCELLULAR LOCATION")
        disease_notes = _extract_comment_texts(result, "DISEASE")
        keywords = _extract_keywords(result)
        pubmed_ids = _extract_pubmed_ids(result)

        summary_parts: list[str] = []
        if gene_names:
            summary_parts.append(f"Gene symbols: {', '.join(gene_names[:5])}.")
        if function_notes:
            summary_parts.append(function_notes[0])
        if localization_notes:
            summary_parts.append(f"Subcellular location: {localization_notes[0]}")
        if disease_notes:
            summary_parts.append(f"Disease note: {disease_notes[0]}")
        if keywords:
            summary_parts.append(f"Keywords: {', '.join(keywords[:8])}.")

        content_parts = [
            f"Protein annotation record for {title}.",
            f"Organism: {organism}.",
        ]
        if gene_names:
            content_parts.append(f"Genes: {', '.join(gene_names)}.")
        if function_notes:
            content_parts.append(f"Function: {' '.join(function_notes[:2])}")
        if localization_notes:
            content_parts.append(f"Localization: {' '.join(localization_notes[:2])}")
        if disease_notes:
            content_parts.append(f"Disease associations: {' '.join(disease_notes[:2])}")
        if keywords:
            content_parts.append(f"Keywords: {', '.join(keywords)}.")
        if pubmed_ids:
            content_parts.append(f"Referenced PubMed IDs: {', '.join(pubmed_ids)}.")

        entry_audit = result.get("entryAudit") or {}
        records.append(
            KnowledgeRecordPayload(
                record_type="protein_annotation",
                source_name="UniProt",
                source_id=accession,
                query_term=query,
                title=title,
                organism=organism,
                summary_text=_truncate(" ".join(summary_parts) or f"UniProt annotation for {title}.", max_length=1400),
                content_text=_truncate(" ".join(content_parts), max_length=6000),
                keywords=", ".join(keywords),
                record_url=f"https://www.uniprot.org/uniprotkb/{accession}",
                published_at=str(entry_audit.get("lastAnnotationUpdateDate") or entry_audit.get("firstPublicDate") or "").strip(),
                raw_payload=json.dumps(result, ensure_ascii=False),
            )
        )

    return records


def _ncbi_common_params() -> dict[str, str]:
    params = {
        "tool": os.getenv("NCBI_TOOL_NAME", "jtlai-biomed-api"),
    }
    email = os.getenv("NCBI_TOOL_EMAIL", "").strip()
    api_key = os.getenv("NCBI_API_KEY", "").strip()
    if email:
        params["email"] = email
    if api_key:
        params["api_key"] = api_key
    return params


def _xml_text(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return " ".join("".join(element.itertext()).split())


def _fetch_pubmed_abstracts(pubmed_ids: list[str]) -> dict[str, dict[str, str]]:
    if not pubmed_ids:
        return {}

    response = http_get(
        NCBI_EFETCH_URL,
        params={
            "db": "pubmed",
            "id": ",".join(pubmed_ids),
            "retmode": "xml",
            **_ncbi_common_params(),
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    root = ET.fromstring(response.text)
    abstracts: dict[str, dict[str, str]] = {}
    for article in root.findall(".//PubmedArticle"):
        pmid = _xml_text(article.find(".//MedlineCitation/PMID"))
        if not pmid:
            continue

        title = _xml_text(article.find(".//Article/ArticleTitle"))
        abstract_parts: list[str] = []
        for abstract_node in article.findall(".//Article/Abstract/AbstractText"):
            label = str(abstract_node.attrib.get("Label") or "").strip()
            abstract_text = _xml_text(abstract_node)
            if not abstract_text:
                continue
            abstract_parts.append(f"{label}: {abstract_text}" if label else abstract_text)

        abstracts[pmid] = {
            "title": title,
            "abstract": " ".join(abstract_parts).strip(),
        }

    return abstracts


def fetch_pubmed_knowledge(query: str, limit: int) -> list[KnowledgeRecordPayload]:
    search_response = http_get(
        NCBI_ESEARCH_URL,
        params={
            "db": "pubmed",
            "term": query,
            "retmode": "json",
            "retmax": limit,
            "sort": "relevance",
            **_ncbi_common_params(),
        },
        timeout=REQUEST_TIMEOUT,
    )
    search_response.raise_for_status()
    pubmed_ids = [str(item).strip() for item in ((search_response.json().get("esearchresult") or {}).get("idlist") or []) if str(item).strip()]
    if not pubmed_ids:
        return []

    summary_response = http_get(
        NCBI_ESUMMARY_URL,
        params={
            "db": "pubmed",
            "id": ",".join(pubmed_ids),
            "retmode": "json",
            **_ncbi_common_params(),
        },
        timeout=REQUEST_TIMEOUT,
    )
    summary_response.raise_for_status()
    summary_result = (summary_response.json().get("result") or {})

    abstract_lookup = _fetch_pubmed_abstracts(pubmed_ids)
    records: list[KnowledgeRecordPayload] = []
    for pubmed_id in pubmed_ids:
        summary_payload = summary_result.get(pubmed_id) or {}
        abstract_payload = abstract_lookup.get(pubmed_id) or {}
        title = str(abstract_payload.get("title") or summary_payload.get("title") or "Untitled PubMed article").strip()
        abstract_text = str(abstract_payload.get("abstract") or "").strip()
        authors = _join_unique([str((author or {}).get("name") or "") for author in (summary_payload.get("authors") or [])], limit=8)
        journal = str(summary_payload.get("fulljournalname") or summary_payload.get("source") or "PubMed").strip()
        pubdate = str(summary_payload.get("pubdate") or summary_payload.get("sortpubdate") or "").strip()

        content_parts = [
            f"PubMed literature record for query '{query}'.",
            f"Title: {title}.",
            f"Journal: {journal}.",
        ]
        if pubdate:
            content_parts.append(f"Published: {pubdate}.")
        if authors:
            content_parts.append(f"Authors: {', '.join(authors)}.")
        if abstract_text:
            content_parts.append(f"Abstract: {abstract_text}")

        summary_text = abstract_text or f"{title}. Journal: {journal}."
        records.append(
            KnowledgeRecordPayload(
                record_type="literature",
                source_name="NCBI PubMed",
                source_id=pubmed_id,
                query_term=query,
                title=title,
                organism="",
                summary_text=_truncate(summary_text, max_length=1800),
                content_text=_truncate(" ".join(content_parts), max_length=6000),
                keywords=query,
                record_url=f"https://pubmed.ncbi.nlm.nih.gov/{pubmed_id}/",
                published_at=pubdate,
                raw_payload=json.dumps(
                    {
                        "summary": summary_payload,
                        "abstract": abstract_text,
                    },
                    ensure_ascii=False,
                ),
            )
        )

    return records


# ── Semantic Scholar ─────────────────────────────────────────────────────────

def fetch_scholar_knowledge(query: str, limit: int = 8) -> list[KnowledgeRecordPayload]:
    cache_key = f"scholar:{query}:{limit}"
    cached = cached_json_get("scholar", cache_key)
    if cached:
        return [KnowledgeRecordPayload(**r) for r in cached]

    api_key = os.getenv("SEMANTIC_SCHOLAR_API_KEY", "").strip()
    headers = {"x-api-key": api_key} if api_key else {}
    fields = "paperId,title,abstract,authors,year,citationCount,venue,fieldsOfStudy,tldr,url"

    try:
        resp = http_get(
            f"{SEMANTIC_SCHOLAR_URL}/paper/search",
            params={"query": query, "limit": str(min(limit, 50)), "fields": fields},
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return []
        papers = resp.json().get("data", [])
    except Exception as exc:
        logger.warning("Semantic Scholar fetch failed: %s", exc)
        return []

    records: list[KnowledgeRecordPayload] = []
    for p in papers[:limit]:
        tldr = (p.get("tldr") or {}).get("text", "")
        abstract = p.get("abstract") or ""
        records.append(KnowledgeRecordPayload(
            record_type="scholar_paper",
            source_name="SemanticScholar",
            source_id=p.get("paperId", ""),
            query_term=query,
            title=p.get("title", ""),
            organism="",
            summary_text=tldr or _truncate(abstract, 500),
            content_text=abstract,
            keywords=", ".join(p.get("fieldsOfStudy") or []),
            record_url=p.get("url", ""),
            published_at=str(p.get("year", "")),
            raw_payload=json.dumps(p, default=str),
        ))

    if records:
        cached_json_set("scholar", cache_key, [asdict(r) for r in records], ttl=21600)
    return records


# ── InterPro ─────────────────────────────────────────────────────────────────

def fetch_interpro_annotations(uniprot_id: str, limit: int = 10) -> list[KnowledgeRecordPayload]:
    cache_key = f"interpro:{uniprot_id}"
    cached = cached_json_get("interpro", cache_key)
    if cached:
        return [KnowledgeRecordPayload(**r) for r in cached]

    try:
        resp = http_get(
            f"{INTERPRO_API_URL}/entry/interpro/protein/uniprot/{uniprot_id}",
            params={"page_size": str(min(limit, 30))},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return []
        entries = resp.json().get("results", [])
    except Exception as exc:
        logger.warning("InterPro fetch failed for %s: %s", uniprot_id, exc)
        return []

    records: list[KnowledgeRecordPayload] = []
    for e in entries[:limit]:
        meta = e.get("metadata", {})
        records.append(KnowledgeRecordPayload(
            record_type="domain_annotation",
            source_name="InterPro",
            source_id=meta.get("accession", ""),
            query_term=uniprot_id,
            title=meta.get("name", ""),
            organism="",
            summary_text=meta.get("type", ""),
            content_text=_truncate(str(meta.get("description", "")), 2000),
            keywords=meta.get("type", ""),
            record_url=f"https://www.ebi.ac.uk/interpro/entry/InterPro/{meta.get('accession', '')}/",
            published_at="",
            raw_payload=json.dumps(e, default=str),
        ))

    if records:
        cached_json_set("interpro", cache_key, [asdict(r) for r in records], ttl=86400)
    return records


# ── NCBI GEO ─────────────────────────────────────────────────────────────────

def fetch_geo_datasets(query: str, limit: int = 8) -> list[KnowledgeRecordPayload]:
    cache_key = f"geo:{query}:{limit}"
    cached = cached_json_get("geo", cache_key)
    if cached:
        return [KnowledgeRecordPayload(**r) for r in cached]

    ncbi_params = _ncbi_common_params()
    try:
        search_resp = http_get(
            NCBI_ESEARCH_URL,
            params={**ncbi_params, "db": "gds", "term": query, "retmax": str(min(limit, 30))},
            timeout=REQUEST_TIMEOUT,
        )
        ids = search_resp.json().get("esearchresult", {}).get("idlist", [])
        if not ids:
            return []

        summary_resp = http_get(
            NCBI_ESUMMARY_URL,
            params={**ncbi_params, "db": "gds", "id": ",".join(ids[:limit])},
            timeout=REQUEST_TIMEOUT,
        )
        result_map = summary_resp.json().get("result", {})
    except Exception as exc:
        logger.warning("GEO fetch failed: %s", exc)
        return []

    records: list[KnowledgeRecordPayload] = []
    for uid in result_map.get("uids", []):
        entry = result_map.get(uid, {})
        accession = entry.get("accession", "")
        records.append(KnowledgeRecordPayload(
            record_type="geo_dataset",
            source_name="NCBI GEO",
            source_id=accession or str(uid),
            query_term=query,
            title=entry.get("title", ""),
            organism=entry.get("taxon", ""),
            summary_text=_truncate(entry.get("summary", ""), 1000),
            content_text=entry.get("summary", ""),
            keywords=entry.get("gdstype", ""),
            record_url=f"https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={accession}" if accession else "",
            published_at=entry.get("pdat", ""),
            raw_payload=json.dumps(entry, default=str),
        ))

    if records:
        cached_json_set("geo", cache_key, [asdict(r) for r in records], ttl=21600)
    return records


# ── OpenAlex ─────────────────────────────────────────────────────────────────

def fetch_openalex_works(query: str, limit: int = 8) -> list[KnowledgeRecordPayload]:
    cache_key = f"openalex:{query}:{limit}"
    cached = cached_json_get("openalex", cache_key)
    if cached:
        return [KnowledgeRecordPayload(**r) for r in cached]

    try:
        resp = http_get(
            f"{OPENALEX_API_URL}/works",
            params={"search": query, "per_page": str(min(limit, 50)), "mailto": "portfolio@donttalk.dev"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return []
        works = resp.json().get("results", [])
    except Exception as exc:
        logger.warning("OpenAlex fetch failed: %s", exc)
        return []

    records: list[KnowledgeRecordPayload] = []
    for w in works[:limit]:
        abstract = ""
        inverted = w.get("abstract_inverted_index")
        if inverted and isinstance(inverted, dict):
            word_positions: list[tuple[int, str]] = []
            for word, positions in inverted.items():
                for pos in positions:
                    word_positions.append((pos, word))
            word_positions.sort()
            abstract = " ".join(wd for _, wd in word_positions)

        records.append(KnowledgeRecordPayload(
            record_type="openalex_work",
            source_name="OpenAlex",
            source_id=str(w.get("id", "")),
            query_term=query,
            title=w.get("title", ""),
            organism="",
            summary_text=_truncate(abstract, 500),
            content_text=abstract,
            keywords=", ".join(
                c.get("display_name", "") for c in (w.get("concepts") or [])[:5]
            ),
            record_url=w.get("doi") or w.get("id", ""),
            published_at=w.get("publication_date", ""),
            raw_payload=json.dumps(w, default=str),
        ))

    if records:
        cached_json_set("openalex", cache_key, [asdict(r) for r in records], ttl=21600)
    return records
