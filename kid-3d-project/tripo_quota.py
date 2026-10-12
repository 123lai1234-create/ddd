"""Quick Tripo credits check.

Usage:
    python tripo_quota.py

Reads TRIPO_API_KEY from env.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from tripo_generate import check_credits  # noqa: E402

if "TRIPO_API_KEY" not in os.environ:
    sys.exit("missing TRIPO_API_KEY env var")

info = check_credits()
print(f"Tripo account status:")
for k, v in info.items():
    print(f"  {k}: {v}")