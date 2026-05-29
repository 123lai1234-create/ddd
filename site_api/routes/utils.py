"""site_api.routes.utils — auto-split from routes.py"""
from site_api.routes._shared import *

from __future__ import annotations
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/utils/mygene")
def lookup_mygene(query: str = "TP53", limit: int = 5) -> dict[str, Any]:
    results = fetch_mygene_info(query, min(limit, 20))
    return {"hits": results, "count": len(results), "query": query}


# ── Utility: MyVariant.info (variant annotation) ─────────────────────────────

@router.get("/api/utils/myvariant/{variant_id:path}")
def lookup_myvariant(variant_id: str) -> dict[str, Any]:
    result = fetch_myvariant_info(variant_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Variant {variant_id} not found.")
    return {"variant": result, "variantId": variant_id}


# ── Utility: Ensembl VEP (variant effect prediction) ─────────────────────────

@router.get("/api/utils/vep/{hgvs:path}")
def lookup_vep(hgvs: str) -> dict[str, Any]:
    result = fetch_ensembl_vep(hgvs)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"VEP lookup failed for {hgvs}.")
    return {"result": result, "hgvs": hgvs}


# ── Multi-model AI Chatbot proxy (Gemini → DeepSeek → OpenRouter) ─────────────

CHAT_SYSTEM_PROMPT = (
    "你是一個生物醫學 AI 作品集的助手。這個作品集包含蛋白質 AI 設計 (ProteinMPNN, ESM-2)、"
    "基因分析平台 (UniProt, Ensembl, PubMed)、NGS 定序工作站、遺傳演算法交易策略研究等項目。"
    "用繁體中文簡潔回答訪客的問題，保持友善和專業。回答控制在 200 字以內。"
)


def _try_gemini(message: str) -> str | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    import time
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    body = {
        "system_instruction": {"parts": [{"text": CHAT_SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": message}]}],
        "generationConfig": {"maxOutputTokens": 512},
    }
    for attempt in range(2):
        resp = httpx.post(url, headers={"content-type": "application/json"}, json=body, timeout=20)
        if resp.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        if resp.status_code != 200:
            return None
        data = resp.json()
        return (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        ) or None
    return None


def _try_deepseek(message: str) -> str | None:
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        return None
    resp = httpx.post(
        "https://api.deepseek.com/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                {"role": "user", "content": message},
            ],
            "max_tokens": 512,
        },
        timeout=20,
    )
    if resp.status_code != 200:
        return None
    return resp.json().get("choices", [{}])[0].get("message", {}).get("content") or None


def _try_openrouter(message: str) -> str | None:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        return None
    resp = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": "meta-llama/llama-3.1-8b-instruct:free",
            "messages": [
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                {"role": "user", "content": message},
            ],
            "max_tokens": 512,
        },
        timeout=20,
    )
    if resp.status_code != 200:
        return None
    return resp.json().get("choices", [{}])[0].get("message", {}).get("content") or None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)

