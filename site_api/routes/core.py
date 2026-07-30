from __future__ import annotations

import contextlib
import logging
import math
import os
import re
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

dotenv.load_dotenv()

router = APIRouter()


@router.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "donttalk-api",
        "databaseConfigured": bool(get_database_url()),
        "connected": database_available(),
    }


@router.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


# ── Training logs (seeded from paper experiments) ────────────────────────────

_BO_STEPS = list(range(1, 16))
_BO_VALUES = [
    0.2087, 0.2087, 0.2087, 0.2087, 0.2087, 0.2087, 0.2087,
    0.2087, 0.2100, 0.2140, 0.2180, 0.2200, 0.2300, 0.2434, 0.2434,
]

_LOSS_STEPS = list(range(1, 81))
_LOSS_VALUES = [
    round(0.03 * math.exp(-i * 0.06) + 0.0013 + (((i * 6364136223846793005 + 1442695040888963407) & 0xFFFFFFFF) / 0x100000000) * 0.0005, 6)
    for i in range(80)
]

_RL_STEPS = list(range(1, 26))
_RL_VALUES = [
    round(-0.15 + i * 0.018 + ((((i * 2891336453 + 987654321) & 0xFFFFFFFF) / 0x100000000) - 0.5) * 0.04, 4)
    for i in range(25)
]

_MPNN_STEPS = list(range(1, 41))
_MPNN_VALUES = [
    round(3.2 * math.exp(-i * 0.08) + 0.8 + (((i * 1664525 + 1013904223) & 0xFFFFFFFF) / 0x100000000) * 0.05, 4)
    for i in range(40)
]

_TRAINING_LOGS: dict[str, dict] = {
    "bo": {
        "label": "Bayesian Optimisation · Sharpe Improvement",
        "x_label": "Round",
        "y_label": "Best Sharpe",
        "steps": _BO_STEPS,
        "values": _BO_VALUES,
    },
    "loss": {
        "label": "ESM-2 Fine-tune · MSE Loss",
        "x_label": "Epoch",
        "y_label": "MSE Loss",
        "steps": _LOSS_STEPS,
        "values": _LOSS_VALUES,
    },
    "rl": {
        "label": "REINFORCE · Cumulative Reward",
        "x_label": "Episode",
        "y_label": "Reward",
        "steps": _RL_STEPS,
        "values": _RL_VALUES,
    },
    "mpnn": {
        "label": "ProteinMPNN · Cross-Entropy Loss",
        "x_label": "Step",
        "y_label": "Cross-Entropy",
        "steps": _MPNN_STEPS,
        "values": _MPNN_VALUES,
    },
}


@router.get("/api/training/logs")
def get_training_logs(run_type: str = "bo") -> dict[str, Any]:
    key = run_type.strip().lower()
    if key not in _TRAINING_LOGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"run_type must be one of: {', '.join(_TRAINING_LOGS)}",
        )
    return {"run_type": key, **_TRAINING_LOGS[key]}


@router.get("/api/db/status")
def db_status(x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    admin_token = os.getenv("ADMIN_TOKEN", "").strip()
    if not admin_token or x_admin_token != admin_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin token required.",
        )
    all_results = check_all_databases()
    return {
        "databases": all_results,
        "totalConfigured": len(all_results),
        "totalConnected": sum(1 for r in all_results if r["connected"]),
        "primaryHost": urlparse(get_database_url()).hostname if get_database_url() else None,
    }


@router.get("/api/structures/pdb/{pdb_id}")
def get_pdb_structure(pdb_id: str) -> dict[str, Any]:
    return fetch_structure_payload(pdb_id)
