"""site_api.routes.training — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/training/logs")
def get_training_logs(run_type: str = "bo") -> dict[str, Any]:
    key = run_type.strip().lower()
    if key not in _TRAINING_LOGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"run_type must be one of: {', '.join(_TRAINING_LOGS)}",
        )
    return {"run_type": key, **_TRAINING_LOGS[key]}

