"""site_api.routes.games — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

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
    seed = _rand.getrandbits(32)
    return {"game": g, "seed": seed, "ts": int(_time.time())}

