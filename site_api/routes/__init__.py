from site_api.routes.core        import router as core_router
from site_api.routes.knowledge   import router as knowledge_router
from site_api.routes.sequences   import router as sequences_router
from site_api.routes.market      import router as market_router
from site_api.routes.inquiries   import router as inquiries_router
from site_api.routes.esm2        import router as esm2_router
from site_api.routes.bio         import router as bio_router
from site_api.routes.search      import router as search_router
from site_api.routes.ai_game     import router as ai_game_router

__all__ = [
    "core_router",
    "knowledge_router",
    "sequences_router",
    "market_router",
    "inquiries_router",
    "esm2_router",
    "bio_router",
    "search_router",
    "ai_game_router",
]
