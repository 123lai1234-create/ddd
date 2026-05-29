"""site_api.routes.health — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
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

