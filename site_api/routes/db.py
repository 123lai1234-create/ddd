"""site_api.routes.db — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/db/status")
def db_status(x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    admin_token = os.getenv("ADMIN_TOKEN", "").strip()
    if not admin_token or x_admin_token != admin_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin token required.",
        )
    all_results = check_all_databases()
    return {
        "databases": all_results,
        "totalConfigured": len(all_results),
        "totalConnected": sum(1 for r in all_results if r["connected"]),
        "primaryHost": urlparse(get_database_url()).hostname if get_database_url() else None,
    }

