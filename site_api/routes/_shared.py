__all__ = [
    "CHAT_SYSTEM_PROMPT", "_try_gemini", "_try_deepseek", "_try_openrouter",
    "ChatRequest", "YahooPriceRequest", "GameScoreSubmit", "InquiryCreate",
    "ESM2ScoreRequest", "ensure_sequence_schema", "ensure_knowledge_schema",
    "ensure_structure_schema", "ensure_market_schema", "ensure_variant_schema",
    "ensure_population_schema", "ensure_interaction_schema", "ensure_chembl_schema",
    "ensure_opentargets_schema", "ensure_economic_schema", "ensure_pathway_schema",
    "ensure_schema", "get_connection", "get_database_url", "database_available",
    "check_all_databases", "ensure_market_schema", "market_summary", "fetch_market_records",
    "fetch_twse_daily_records", "fetch_twse_listed_stock_symbols", "fetch_yahoo_daily_records",
    "ensure_sequence_schema", "SequenceUpsertOneRequest", "SequenceSyncRequest",
    "fetch_sequence_rows", "fetch_sequence_rows_for_search", "upsert_sequence_records",
    "delete_sequence_record", "build_sequence_rag_documents", "fetch_structure_payload",
    "ensure_knowledge_schema", "KnowledgeSyncRequest", "fetch_knowledge_rows",
    "upsert_knowledge_records", "build_knowledge_rag_documents", "knowledge_summary",
    "ensure_variant_schema", "VariantSyncRequest", "fetch_variant_rows",
    "upsert_variants", "variant_summary", "ensure_population_schema",
    "PopulationSyncRequest", "fetch_population_rows", "upsert_population",
    "population_summary", "ensure_structure_schema", "StructurePredictionSyncRequest",
    "fetch_structure_prediction_rows", "upsert_structure_predictions",
    "structure_prediction_summary", "ensure_interaction_schema",
    "InteractionSyncRequest", "fetch_interaction_rows", "upsert_interactions",
    "interaction_summary", "ensure_chembl_schema", "ChEMBLSyncRequest",
    "chembl_summary", "fetch_chembl_rows", "upsert_chembl", "fetch_chembl_compounds",
    "ensure_opentargets_schema", "OpenTargetsSyncRequest", "opentargets_summary",
    "fetch_opentargets_rows", "upsert_opentargets", "fetch_opentargets_associations",
    "ensure_economic_schema", "EconomicSyncRequest", "economic_summary",
    "fetch_economic_rows", "upsert_economic_indicators", "fetch_fred_series",
    "ensure_pathway_schema", "PathwaySyncRequest", "OrderedDict",
    "_GAME_SCORES", "_GAME_LOCK", "_ALLOWED_GAMES",
    "httpx", "Any", "HTTPException", "psycopg", "os", "BaseModel", "Field", "status",
    "MarketBarPayload", "MarketInstrumentPayload", "fetch_europe_pmc",
    "fetch_expression_atlas", "fetch_mygene_info", "fetch_myvariant_info",
    "fetch_ensembl_vep",
]


import contextlib
import logging
import math
import os
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
from urllib.parse import urlparse

import dotenv
import httpx
import psycopg
import time as _time
from threading import Lock as _Lock
from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from site_api.db import (
    _require_sync_secret,
    check_all_databases,
    database_available,
    ensure_chembl_schema,
    ensure_economic_schema,
    ensure_interaction_schema,
    ensure_market_schema,
    ensure_opentargets_schema,
    ensure_population_schema,
    ensure_schema,
    ensure_structure_schema,
    ensure_variant_schema,
    get_connection,
    get_database_url,
)
from site_api.models import (
    ChEMBLSyncRequest,
    ESM2ScoreRequest,
    EconomicSyncRequest,
    InquiryCreate,
    InteractionSyncRequest,
    KnowledgeSyncRequest,
    MarketSyncRequest,
    OpenTargetsSyncRequest,
    PathwaySyncRequest,
    PopulationSyncRequest,
    SequenceSyncRequest,
    SequenceUpsertOneRequest,
    SequencingRunSyncRequest,
    StructurePredictionSyncRequest,
    VariantSyncRequest,
)
from site_api.services import (
    build_knowledge_rag_documents,
    build_sequence_rag_documents,
    delete_sequence_record,
    economic_summary,
    fetch_economic_rows,
    fetch_interaction_rows,
    fetch_knowledge_rows,
    fetch_market_bar_rows,
    fetch_market_instrument_rows,
    fetch_population_rows,
    fetch_sequence_rows,
    fetch_sequence_rows_for_search,
    fetch_sequencing_run_rows,
    fetch_structure_payload,
    fetch_structure_prediction_rows,
    fetch_variant_rows,
    interaction_summary,
    knowledge_summary,
    market_summary,
    population_summary,
    sequence_summary,
    sequencing_run_summary,
    structure_prediction_summary,
    upsert_economic_indicators,
    upsert_interactions,
    upsert_knowledge_records,
    upsert_market_bars,
    upsert_market_instruments,
    upsert_population,
    upsert_sequence_records,
    upsert_sequencing_runs,
    upsert_structure_predictions,
    upsert_variants,
    variant_summary,
    chembl_summary,
    fetch_chembl_rows,
    fetch_opentargets_rows,
    opentargets_summary,
    upsert_chembl,
    upsert_opentargets,
)
from site_api.bioinfo_utils import (
    fetch_ensembl_vep,
    fetch_europe_pmc,
    fetch_expression_atlas,
    fetch_mygene_info,
    fetch_myvariant_info,
)
from site_api.chembl_sources import fetch_chembl_compounds
from site_api.economic_sources import fetch_fred_series
from site_api.interaction_sources import fetch_string_interactions
from site_api.knowledge_sources import (
    fetch_geo_datasets,
    fetch_interpro_annotations,
    fetch_openalex_works,
    fetch_pubmed_knowledge,
    fetch_scholar_knowledge,
    fetch_uniprot_knowledge,
)
from site_api.market_sources import MarketBarPayload, MarketInstrumentPayload, fetch_market_records, fetch_twse_daily_records, fetch_twse_listed_stock_symbols, fetch_yahoo_daily_records
from site_api.opentargets_sources import fetch_opentargets_associations
from site_api.pathway_sources import fetch_quickgo_annotations, fetch_reactome_pathways
from site_api.population_sources import fetch_gnomad_variants
from site_api.sequence_sources import SequenceRecordPayload, fetch_gene_sequences, fetch_protein_sequences
from site_api.sequencing_run_sources import fetch_ena_sequencing_runs
from site_api.structure_sources import fetch_alphafold_predictions
from site_api.variant_sources import fetch_clinvar_variants, fetch_cosmic_mutations
CHAT_SYSTEM_PROMPT = (
    "你是一個生物醫學 AI 作品集的助手。這個作品集包含蛋白質 AI 設計 (ProteinMPNN, ESM-2)、"
    "基因分析平台 (UniProt, Ensembl, PubMed)、NGS 定序工作站、遺傳演算法交易策略研究等項目。"
    "用繁體中文簡潔回答訪客的問題，保持友善和專業。回答控制在 200 字以內。"
)


def _try_gemini(message: str) -> str | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    import time
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    body = {
        "system_instruction": {"parts": [{"text": CHAT_SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": message}]}],
        "generationConfig": {"maxOutputTokens": 512},
    }
    for attempt in range(2):
        resp = httpx.post(url, headers={"content-type": "application/json"}, json=body, timeout=20)
        if resp.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        if resp.status_code != 200:
            return None
        data = resp.json()
        return (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        ) or None
    return None


def _try_deepseek(message: str) -> str | None:
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        return None
    resp = httpx.post(
        "https://api.deepseek.com/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                {"role": "user", "content": message},
            ],
            "max_tokens": 512,
        },
        timeout=20,
    )
    if resp.status_code != 200:
        return None
    return resp.json().get("choices", [{}])[0].get("message", {}).get("content") or None


def _try_openrouter(message: str) -> str | None:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        return None
    resp = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": "meta-llama/llama-3.1-8b-instruct:free",
            "messages": [
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                {"role": "user", "content": message},
            ],
            "max_tokens": 512,
        },
        timeout=20,
    )
    if resp.status_code != 200:
        return None
    return resp.json().get("choices", [{}])[0].get("message", {}).get("content") or None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


@router.post("/api/chat")
def chat_proxy(payload: ChatRequest) -> dict[str, Any]:


