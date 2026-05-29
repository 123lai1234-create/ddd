"""site_api.routes — split router aggregator.

Import structure:
  from site_api.routes import (
      health, sequences, structures, knowledge, population,
      interactions, chembl, opentargets, economic, pathways,
      literature, expression, market, games, inquiries, ml,
      utils, chat, training, db,
  )
  app.include_router(health.router)
  ...

Or use the convenience:
  from site_api.routes import build_router
  build_router(app)
"""

from __future__ import annotations

from fastapi import FastAPI

# ── Import all domain routers ────────────────────────────────────────────────
from site_api.routes import (
    health,
    sequences,
    structures,
    knowledge,
    population,
    interactions,
    chembl,
    opentargets,
    economic,
    pathways,
    literature,
    expression,
    market,
    games,
    inquiries,
    ml,
    utils,
    chat,
    training,
    db,
)

# ── Registry for include_router ───────────────────────────────────────────────
ROUTER_MODULES = [
    health,
    sequences,
    structures,
    knowledge,
    population,
    interactions,
    chembl,
    opentargets,
    economic,
    pathways,
    literature,
    expression,
    market,
    games,
    inquiries,
    ml,
    utils,
    chat,
    training,
    db,
]


def build_router(app: FastAPI) -> None:
    """Include all domain routers into the FastAPI app."""
    for mod in ROUTER_MODULES:
        app.include_router(mod.router)
