"""
site_api/shared_utils.py
──────────────────────────────────────────────────────────────────
Shared utility functions used by multiple site_api source modules.

Consolidated here to eliminate code duplication between
knowledge_sources.py, sequence_sources.py, and sequencing_run_sources.py.
"""

from __future__ import annotations

from typing import Any


def protein_name(result: dict[str, Any]) -> str:
    """
    Extract human-readable protein name from a UniProt result dict.

    Resolution order:
      1. proteinDescription → recommendedName → fullName → value
      2. proteinDescription → submissionNames[0] → fullName → value
      3. uniProtkbId (fallback)
    """
    description = result.get("proteinDescription") or {}
    recommended_name = (
        ((description.get("recommendedName") or {}).get("fullName") or {}).get("value")
    )
    if recommended_name:
        return str(recommended_name).strip()

    submission_names = description.get("submissionNames") or []
    if submission_names:
        submission_name = (
            ((submission_names[0] or {}).get("fullName") or {}).get("value")
        )
        if submission_name:
            return str(submission_name).strip()

    return str(result.get("uniProtkbId") or "Unnamed protein").strip()


def parse_int_safe(value: str | int | None) -> int | None:
    """
    Parse a value to int, tolerating commas and non-numeric strings.
    Returns None on failure.
    """
    normalized = str(value or "").strip().replace(",", "")
    if not normalized:
        return None
    try:
        return int(float(normalized))
    except ValueError:
        return None
