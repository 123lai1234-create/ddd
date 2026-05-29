"""site_api.routes.chat — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.post("/api/chat")
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

