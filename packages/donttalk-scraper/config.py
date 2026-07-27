"""Configuration loaded from env vars."""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # ─── Primary LLM (chat) ──────────────────────────────────────────────────
    # 2026-07-27 從 fe8.cn 切到 MiniMax 直連，避開 fe8.cn 平台把 key 標記的問題
    # `MINIMAX_*` 優先；若沒設則 fallback 舊的 `OPENAI_*`（相容舊 render.yaml）
    LLM_API_KEY: str = (
        os.getenv("MINIMAX_API_KEY", "").strip()
        or os.getenv("OPENAI_API_KEY", "").strip()
    )
    LLM_BASE_URL: str = (
        os.getenv("MINIMAX_BASE_URL", "").strip()
        or os.getenv("OPENAI_BASE_URL", "").strip()
        or "https://api.minimaxi.com/v1"
    )
    LLM_MODEL: str = (
        os.getenv("MINIMAX_MODEL", "").strip()
        or os.getenv("OPENAI_MODEL", "").strip()
        or "MiniMax-M2"
    )

    # ─── Embedding（給 RAG 用）──────────────────────────────────────────────
    # MiniMax 沒公開 embedding endpoint，所以 embedding 仍走 OpenAI 直接
    # 沒設 OPENAI_API_KEY 就把 RAG 整段關掉（chat 仍可走 KB fallback）
    EMBEDDING_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("MINIMAX_API_KEY", "").strip()
    EMBEDDING_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small").strip()

    # ─── Legacy aliases（讓其他模組不用改 import）───────────────────────────
    # debug / test 腳本可能還在用，留著別刪
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()

    # ─── Site / server ──────────────────────────────────────────────────────
    SITE_URL: str = os.getenv("SITE_URL", "https://donttalk.vercel.app")
    SITE_NAME: str = os.getenv("SITE_NAME", "donttalk")

    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    ALLOWED_ORIGINS: list[str] = [
        o.strip() for o in os.getenv(
            "ALLOWED_ORIGINS",
            "https://donttalk.vercel.app,http://localhost:4321",
        ).split(",") if o.strip()
    ]

    CHROMA_DIR: str = os.getenv("CHROMA_DIR", "./data/chroma")

    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")


config = Config()
