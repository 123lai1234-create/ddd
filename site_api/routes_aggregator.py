from fastapi import APIRouter
from site_api.routes import (
    core_router,
    knowledge_router,
)

router = APIRouter()

router.include_router(core_router,       tags=["core"])
router.include_router(knowledge_router, tags=["knowledge"])

__all__ = ["router"]
