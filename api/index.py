"""Vercel Serverless Function entry point — re-exports the FastAPI app."""

from site_api.main import app  # noqa: F401
