"""Shared HTTP client with timeout, retry, and backoff for external API calls."""

from __future__ import annotations

import logging

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 15  # seconds
MAX_RETRIES = 3

_retry_strategy = Retry(
    total=MAX_RETRIES,
    backoff_factor=1,            # 1s, 2s, 4s
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["GET", "POST"],
    raise_on_status=False,
)

_adapter = HTTPAdapter(max_retries=_retry_strategy)


def create_session(timeout: int = DEFAULT_TIMEOUT) -> requests.Session:
    """Create a requests.Session with retry logic and default timeout."""
    session = requests.Session()
    session.mount("https://", _adapter)
    session.mount("http://", _adapter)
    # Store timeout as a custom attribute for reference
    session._default_timeout = timeout
    return session


# Module-level shared session
http = create_session()


def get(url: str, **kwargs) -> requests.Response:
    """GET with default timeout and retry."""
    kwargs.setdefault("timeout", DEFAULT_TIMEOUT)
    return http.get(url, **kwargs)


def post(url: str, **kwargs) -> requests.Response:
    """POST with default timeout and retry."""
    kwargs.setdefault("timeout", DEFAULT_TIMEOUT)
    return http.post(url, **kwargs)
