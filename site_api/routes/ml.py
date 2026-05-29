"""site_api.routes.ml — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.post("/api/esm2/score")
def esm2_score(request: Request, body: ESM2ScoreRequest) -> dict[str, Any]:
    """Proxy ESM-2 fill-mask scoring server-side; visitors need no HuggingFace token."""
    hf_token = os.getenv("HF_TOKEN", "").strip()
    if not hf_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="HF_TOKEN is not configured on this server.",
        )

    seq = body.sequence
    positions = (
        [p for p in body.positions if 0 <= p < len(seq)]
        if body.positions is not None
        else list(range(len(seq)))
    )
    if not positions:
        return {"profiles": {}, "sequence": seq, "positionCount": 0}

    profiles: dict[str, dict[str, float]] = {}
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=_ESM2_CONCURRENCY) as pool:
        futures = {pool.submit(_score_one_position, seq, pos, hf_token): pos for pos in positions}
        for future in as_completed(futures):
            try:
                pos, dist = future.result()
                profiles[str(pos)] = dist
            except RuntimeError as exc:
                err_msg = str(exc)
                errors.append(err_msg)
                _logger.warning("ESM-2 position %d failed: %s", futures[future], err_msg)
                if "loading (503)" in err_msg or "invalid or expired" in err_msg:
                    # Fatal — cancel remaining and surface the error
                    for f in futures:
                        f.cancel()
                    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=err_msg) from exc

    return {
        "profiles": profiles,
        "sequence": seq,
        "positionCount": len(profiles),
        "errors": errors,
    }


# ── AlphaFold Structure Predictions ──────────────────────────────────────────
