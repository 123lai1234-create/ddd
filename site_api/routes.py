from fastapi import APIRouter
from site_api.routes import (
    core_router,
    knowledge_router,
    sequences_router,
    market_router,
    inquiries_router,
    esm2_router,
    bio_router,
    search_router,
    ai_game_router,
)

router = APIRouter()

router.include_router(core_router,        tags=["core"])
router.include_router(knowledge_router,  tags=["knowledge"])
router.include_router(sequences_router,  tags=["sequences"])
router.include_router(market_router,     tags=["market"])
router.include_router(inquiries_router,   tags=["inquiries"])
router.include_router(esm2_router,        tags=["esm2"])
router.include_router(bio_router,         tags=["bio"])
router.include_router(search_router,       tags=["search"])
router.include_router(ai_game_router,     tags=["ai-game"])

__all__ = ["router"]
