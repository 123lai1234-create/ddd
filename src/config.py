import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


class Config:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production")
    API_VERSION: str = "v1"

    HF_TOKEN: str = os.getenv("HF_TOKEN", "")
    SYNC_SECRET: str = os.getenv("SYNC_SECRET", "")

    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")

    SEQUENCE_REFRESH_SECONDS: int = int(os.getenv("SEQUENCE_REFRESH_SECONDS", "86400"))
    CORS_ALLOW_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv(
            "CORS_ALLOW_ORIGINS",
            "http://localhost:3000,http://localhost:8000",
        ).split(",")
        if o.strip()
    ]


config = Config()
