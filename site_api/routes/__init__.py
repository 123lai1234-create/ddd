# Truncated route files (git history damage in commit 9941742) are excluded.
# Only confirmed-working routers are imported here.
from site_api.routes.core      import router as core_router
from site_api.routes.knowledge import router as knowledge_router

__all__ = [
    "core_router",
    "knowledge_router",
]
