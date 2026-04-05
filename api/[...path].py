from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from site_api.main import app as upstream_app


async def app(scope: dict[str, Any], receive: Callable[[], Awaitable[dict[str, Any]]], send: Callable[[dict[str, Any]], Awaitable[None]]) -> None:
    if scope.get("type") == "http":
        path = str(scope.get("path") or "")
        if path == "/api/healthz":
            scope = {**scope, "path": "/healthz"}
    await upstream_app(scope, receive, send)
