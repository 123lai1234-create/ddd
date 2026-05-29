"""
site_api/main.py — FastAPI application entrypoint.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from site_api.db import get_allowed_origins
from site_api.routes import build_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI):
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    from site_api.auto_sync import run_auto_sync
    run_auto_sync()
    yield
    from site_api import db
    if db._DB_POOL is not None:
        db._DB_POOL.close()


app = FastAPI(title="JT Lai Portfolio API", version="2.0.0", lifespan=lifespan)

_rate_limit = os.getenv("API_RATE_LIMIT", "60/minute")
limiter = Limiter(key_func=get_remote_address, default_limits=[_rate_limit])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Sync-Secret", "X-Admin-Token"],
    max_age=600,
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error."},
    )

# ── Include all domain routers ────────────────────────────────────────────────
build_router(app)
