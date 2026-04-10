"""Optional Redis cache layer (Upstash) for external API response caching."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_redis_client: Any = None
_redis_checked = False


def get_redis_client() -> Any:
    """Lazy singleton — returns an Upstash Redis client or None."""
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True

    url = os.getenv("UPSTASH_REDIS_URL", "").strip()
    token = os.getenv("UPSTASH_REDIS_TOKEN", "").strip()
    if not url or not token:
        logger.info("Upstash Redis not configured — caching disabled.")
        return None

    try:
        from upstash_redis import Redis
        _redis_client = Redis(url=url, token=token)
        _redis_client.ping()
        logger.info("Upstash Redis connected.")
    except Exception as exc:
        logger.warning("Upstash Redis init failed: %s", exc)
        _redis_client = None
    return _redis_client


def cache_get(namespace: str, key: str) -> str | None:
    r = get_redis_client()
    if not r:
        return None
    try:
        return r.get(f"{namespace}:{key}")
    except Exception:
        return None


def cache_set(namespace: str, key: str, value: str, ttl: int = 3600) -> None:
    r = get_redis_client()
    if not r:
        return
    try:
        r.set(f"{namespace}:{key}", value, ex=ttl)
    except Exception:
        pass


def cached_json_get(namespace: str, key: str) -> dict | list | None:
    raw = cache_get(namespace, key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def cached_json_set(namespace: str, key: str, data: Any, ttl: int = 3600) -> None:
    try:
        cache_set(namespace, key, json.dumps(data, default=str), ttl)
    except Exception:
        pass
