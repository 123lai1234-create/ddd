"""site_api.routes.inquiries — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/inquiries/stats")
def inquiry_stats() -> dict[str, Any]:
    database_url = get_database_url()
    if not database_url:
        return {
            "databaseConfigured": False,
            "connected": False,
            "totalInquiries": 0,
            "latestCreatedAt": None,
        }

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        with get_connection() as connection, connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*), MAX(created_at) FROM site_inquiries;")
            total_inquiries, latest_created_at = cursor.fetchone()
        return {
            "databaseConfigured": True,
            "connected": True,
            "totalInquiries": int(total_inquiries or 0),
            "latestCreatedAt": latest_created_at.isoformat() if latest_created_at else None,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@router.post("/api/inquiries", status_code=status.HTTP_201_CREATED)
def create_inquiry(payload: InquiryCreate) -> dict[str, Any]:
    if payload.website:
        return {"accepted": True, "discarded": True}

    database_url = get_database_url()
    if not database_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DATABASE_URL is not configured.",
        )

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        with get_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO site_inquiries (name, email, organization, message, source_page)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, created_at;
                """,
                (
                    payload.name,
                    payload.email,
                    payload.organization or None,
                    payload.message,
                    payload.source_page,
                ),
            )
            inquiry_id, created_at = cursor.fetchone()
        connection.commit()
        return {
            "id": int(inquiry_id),
            "createdAt": created_at.isoformat(),
            "saved": True,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to persist inquiry to PostgreSQL.",
        ) from error


# ── ESM-2 HuggingFace proxy ──────────────────────────────────────────
# Calls HuggingFace fill-mask API server-side so visitors need no token.
# Results are cached in a process-level LRU dict (key = seq:pos).

_logger = logging.getLogger(__name__)
_ESM2_HF_URL = "https://api-inference.huggingface.co/models/facebook/esm2_t6_8M_UR50D"
_MPNN_AA = "ACDEFGHIKLMNPQRSTVWY"
_ESM2_CACHE: OrderedDict[str, dict[str, float]] = OrderedDict()
_ESM2_CACHE_MAX = 200  # cache up to 200 position profiles
_ESM2_CONCURRENCY = 4  # parallel HF requests


def _esm2_cache_get(key: str) -> dict[str, float] | None:
    if key in _ESM2_CACHE:
        _ESM2_CACHE.move_to_end(key)
        return _ESM2_CACHE[key]
    return None


def _esm2_cache_set(key: str, value: dict[str, float]) -> None:
    _ESM2_CACHE[key] = value
    _ESM2_CACHE.move_to_end(key)
    while len(_ESM2_CACHE) > _ESM2_CACHE_MAX:
        _ESM2_CACHE.popitem(last=False)


def _score_one_position(seq: str, pos: int, token: str) -> tuple[int, dict[str, float]]:
    """Mask one position and query ESM-2 fill-mask API. Returns (pos, dist)."""
    cache_key = f"{seq}:{pos}"
    cached = _esm2_cache_get(cache_key)
    if cached is not None:
        return pos, cached

    masked = seq[:pos] + "<mask>" + seq[pos + 1:]
    try:
        resp = httpx.post(
            _ESM2_HF_URL,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"inputs": masked, "parameters": {"top_k": 25}},
            timeout=30.0,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 503:
            raise RuntimeError("ESM-2 model is loading (503). Retry in 30 s.") from exc
        if exc.response.status_code == 401:
            raise RuntimeError("HF_TOKEN is invalid or expired.") from exc
        raise RuntimeError(f"HuggingFace API HTTP {exc.response.status_code}") from exc

    predictions = resp.json()
    dist: dict[str, float] = {aa: -10.0 for aa in _MPNN_AA}
    for pred in (predictions if isinstance(predictions, list) else []):
        aa = (pred.get("token_str") or "").strip().upper()
        if aa in dist:
            dist[aa] = math.log(max(float(pred.get("score", 0)), 1e-10))

    _esm2_cache_set(cache_key, dist)
    return pos, dist

