from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psycopg
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS site_inquiries (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    organization VARCHAR(160),
    message TEXT NOT NULL,
    source_page VARCHAR(120) NOT NULL DEFAULT 'about_me.html',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


logger = logging.getLogger(__name__)
SCHEMA_READY = False
LAST_DATABASE_ERROR = ""


class InquiryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    organization: str = Field(default="", max_length=160)
    message: str = Field(min_length=10, max_length=4000)
    source_page: str = Field(default="about_me.html", max_length=120)
    website: str = Field(default="", max_length=200)

    @field_validator("name", "email", "organization", "message", "source_page", mode="before")
    @classmethod
    def strip_strings(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if "@" not in value or value.endswith("@"):
            raise ValueError("Please provide a valid email address.")
        return value


def get_database_url() -> str:
    return os.getenv("DATABASE_URL", "").strip()


def _with_query_params(url: str, params: dict[str, str]) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update(params)
    return urlunparse(parsed._replace(query=urlencode(query)))


def get_database_url_candidates() -> list[str]:
    database_url = get_database_url()
    if not database_url:
        return []

    candidates: list[str] = []

    def append_candidate(candidate: str) -> None:
        normalized = candidate.strip()
        if normalized and normalized not in candidates:
            candidates.append(normalized)

    append_candidate(database_url)
    append_candidate(_with_query_params(database_url, {"connect_timeout": "5"}))

    parsed = urlparse(database_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if "sslmode" not in query:
        append_candidate(_with_query_params(database_url, {"sslmode": "require", "connect_timeout": "5"}))

    return candidates


def get_connection() -> psycopg.Connection:
    global LAST_DATABASE_ERROR

    last_error: Exception | None = None
    for candidate in get_database_url_candidates():
        try:
            connection = psycopg.connect(candidate)
            LAST_DATABASE_ERROR = ""
            return connection
        except psycopg.Error as error:
            last_error = error
            LAST_DATABASE_ERROR = str(error)

    if last_error is not None:
        raise last_error

    raise psycopg.OperationalError("DATABASE_URL is not configured.")


def get_allowed_origins() -> list[str]:
    raw_value = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if not raw_value:
        return ["*"]
    return [item.strip() for item in raw_value.split(",") if item.strip()]


app = FastAPI(title="JT Lai Portfolio API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def ensure_schema() -> bool:
    global SCHEMA_READY

    if SCHEMA_READY:
        return True

    database_url = get_database_url()
    if not database_url:
        return False

    try:
        with get_connection() as connection:
            connection.execute(CREATE_TABLE_SQL)
            connection.commit()
        SCHEMA_READY = True
        return True
    except psycopg.Error as error:
        logger.warning("Database schema is not ready yet: %s", error)
        return False


def database_available() -> bool:
    database_url = get_database_url()
    if not database_url:
        return False

    try:
        with get_connection() as connection:
            connection.execute("SELECT 1;")
        return True
    except psycopg.Error:
        return False


@app.on_event("startup")
def startup() -> None:
    ensure_schema()


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "jtlai-engineering-biomed-api",
        "databaseConfigured": bool(get_database_url()),
        "connected": database_available(),
    }


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/inquiries/stats")
def inquiry_stats() -> dict[str, Any]:
    database_url = get_database_url()
    if not database_url:
        return {
            "databaseConfigured": False,
            "connected": False,
            "totalInquiries": 0,
            "latestCreatedAt": None,
        }

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*), MAX(created_at) FROM site_inquiries;")
                total_inquiries, latest_created_at = cursor.fetchone()
        return {
            "databaseConfigured": True,
            "connected": True,
            "totalInquiries": int(total_inquiries or 0),
            "latestCreatedAt": latest_created_at.isoformat() if latest_created_at else None,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable right now.",
        ) from error


@app.post("/api/inquiries", status_code=status.HTTP_201_CREATED)
def create_inquiry(payload: InquiryCreate) -> dict[str, Any]:
    if payload.website:
        return {"accepted": True, "discarded": True}

    database_url = get_database_url()
    if not database_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DATABASE_URL is not configured.",
        )

    if not ensure_schema():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is provisioning or not reachable yet.",
        )

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO site_inquiries (name, email, organization, message, source_page)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id, created_at;
                    """,
                    (
                        payload.name,
                        payload.email,
                        payload.organization or None,
                        payload.message,
                        payload.source_page,
                    ),
                )
                inquiry_id, created_at = cursor.fetchone()
            connection.commit()
        return {
            "id": int(inquiry_id),
            "createdAt": created_at.isoformat(),
            "saved": True,
        }
    except psycopg.Error as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to persist inquiry to Render Postgres.",
        ) from error