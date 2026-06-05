def chat_proxy(payload: ChatRequest) -> dict[str, Any]:
    providers = [
        ("Gemini", _try_gemini),
        ("DeepSeek", _try_deepseek),
        ("OpenRouter", _try_openrouter),
    ]
    for name, fn in providers:
        try:
            result = fn(payload.message)
            if result:
                return {"reply": result, "provider": name}
        except Exception:
            continue
    return {"reply": "所有 AI 服務目前都無法回應，請稍後再試。"}


# ── Public Yahoo Finance price proxy (no auth, no DB) ────────────────────────

class YahooPriceRequest(BaseModel):
    symbols: list[str] = Field(min_length=1, max_length=50)
    range: str = Field(default="1y")


@router.post("/api/market/yahoo-prices")
def yahoo_prices_proxy(payload: YahooPriceRequest) -> dict[str, Any]:
    """Fetch daily OHLC from Yahoo Finance directly — no auth or DB required.

    Taiwan TWSE stocks and ETFs (purely numeric 4-6 char codes) automatically get
    the .TW suffix appended.  All other symbols (US stocks, futures like ES=F,
    indices like ^TWII) are passed to Yahoo Finance as-is.
    """
    results: dict[str, Any] = {}
    for symbol in payload.symbols:
        clean = str(symbol or "").strip().upper()
        yahoo_symbol = f"{clean}.TW" if (clean.isdigit() and 4 <= len(clean) <= 6) else clean
        try:
            _inst, bars = fetch_yahoo_daily_records(yahoo_symbol, "stock", payload.range)
            if bars:
                results[symbol] = {
                    "dates": [b.trade_date for b in bars],
                    "closes": [b.close_price for b in bars],
                }
        except Exception:
            continue
    return {"results": results}


# ──────────────────────────────────────────────────────────────────────
# Games API — lightweight in-memory leaderboard
# ──────────────────────────────────────────────────────────────────────

_GAME_SCORES: dict[str, list[dict[str, Any]]] = {}
_GAME_LOCK = _Lock()
_ALLOWED_GAMES = {"breakout", "snake3d", "shooter3d", "tetris3d"}


class GameScoreSubmit(BaseModel):
    game: str = Field(min_length=1, max_length=32)
    player: str = Field(min_length=1, max_length=24)
    score: int = Field(ge=0, le=10_000_000)
    level: int | None = Field(default=None, ge=0, le=10_000)
    meta: dict[str, Any] | None = None


@router.post("/api/games/scores")
def submit_game_score(payload: GameScoreSubmit) -> dict[str, Any]:
    game = payload.game.strip().lower()
    if game not in _ALLOWED_GAMES:
        raise HTTPException(status_code=400, detail="unknown game")
    player = payload.player.strip()[:24] or "anon"
    entry = {
        "player": player,
        "score": int(payload.score),
        "level": payload.level,
        "meta": payload.meta or {},
        "ts": int(_time.time()),
    }
    with _GAME_LOCK:
        bucket = _GAME_SCORES.setdefault(game, [])
        bucket.append(entry)
        bucket.sort(key=lambda e: (-e["score"], e["ts"]))
        del bucket[50:]
        rank = next((i + 1 for i, e in enumerate(bucket) if e is entry), None)
    return {"ok": True, "rank": rank, "total": len(_GAME_SCORES.get(game, []))}


@router.get("/api/games/leaderboard/{game}")
def game_leaderboard(game: str, limit: int = 10) -> dict[str, Any]:
    g = game.strip().lower()
    if g not in _ALLOWED_GAMES:
        raise HTTPException(status_code=400, detail="unknown game")
    limit = max(1, min(50, int(limit)))
    with _GAME_LOCK:
        top = list(_GAME_SCORES.get(g, []))[:limit]
    return {"game": g, "entries": top}


@router.get("/api/games/seed/{game}")
def game_random_seed(game: str) -> dict[str, Any]:
    g = game.strip().lower()
    if g not in _ALLOWED_GAMES:
        raise HTTPException(status_code=400, detail="unknown game")
    import random as _rand

from fastapi import APIRouter

router = APIRouter()

# ── End of imports ──

# ── Routes ──
    seed = _rand.getrandbits(32)
    return {"game": g, "seed": seed, "ts": int(_time.time())}


# ── Seedance Video Generation (fal.ai proxy) ─────────────────────────────────

# PiAPI proxy for Seedance 2.0 video generation.
_PIAPI_BASE = "https://api.piapi.ai/api/v1/task"
_VIDEO_RATE: dict[str, tuple[int, float]] = {}
_VIDEO_RATE_LOCK = _Lock()
_VIDEO_MAX_PER_DAY = 3
_TASK_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{8,128}$")


class VideoGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=500)
    resolution: str = Field("720p", pattern=r"^(480p|720p|1080p)$")
    duration: str = Field("5", pattern=r"^(3|5|8|10)$")


def _check_video_rate(ip: str) -> None:
    now = _time.time()
    with _VIDEO_RATE_LOCK:
        count, window_start = _VIDEO_RATE.get(ip, (0, now))
        if now - window_start > 86400:
            count, window_start = 0, now
        if count >= _VIDEO_MAX_PER_DAY:
            raise HTTPException(
                status_code=429,
                detail=f"Video generation limit: {_VIDEO_MAX_PER_DAY} per day per IP.",
            )
        _VIDEO_RATE[ip] = (count + 1, window_start)


@router.post("/api/video/generate")
async def video_generate(body: VideoGenerateRequest, request: Request) -> dict[str, Any]:
    piapi_key = os.getenv("PIAPI_KEY", "").strip()
    if not piapi_key:
        raise HTTPException(status_code=503, detail="PIAPI_KEY not configured on this server.")
    ip = request.client.host if request.client else "unknown"
    _check_video_rate(ip)
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            _PIAPI_BASE,
            headers={"x-api-key": piapi_key, "Content-Type": "application/json"},
            json={
                "model": "seedance-v1-pro",
                "task_type": "txt2video",
                "input": {
                    "prompt": body.prompt,
                    "resolution": body.resolution,
                    "duration": int(body.duration),
                    "aspect_ratio": "16:9",
                },
            },
        )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"PiAPI error {r.status_code}: {r.text[:200]}")
    data = r.json()
    task_id = (data.get("data") or {}).get("task_id", "")
    if not task_id:
        raise HTTPException(status_code=502, detail=f"PiAPI did not return task_id: {r.text[:200]}")
    return {"request_id": task_id}


@router.get("/api/video/status/{request_id}")
async def video_status(request_id: str) -> dict[str, Any]:
    piapi_key = os.getenv("PIAPI_KEY", "").strip()
    if not piapi_key:
        raise HTTPException(status_code=503, detail="PIAPI_KEY not configured on this server.")
    if not _TASK_ID_RE.match(request_id):
        raise HTTPException(status_code=400, detail="Invalid request_id.")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{_PIAPI_BASE}/{request_id}",
            headers={"x-api-key": piapi_key},
        )
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Task not found.")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"PiAPI status error {r.status_code}")
    data = (r.json().get("data") or {})
    status = data.get("status", "")
    if status == "completed":
        video_url = (data.get("output") or {}).get("video_url", "")
        return {"status": "done", "video_url": video_url}
    if status == "failed":
        return {"status": "failed", "error": (data.get("error") or {}).get("message", "Generation failed.")}
    return {"status": "pending"}


__all__ = ["router"]