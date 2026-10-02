#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Inline all .lrc files referenced by tracks.json into each track's lyricsTimed field.
Convert lyric text from simplified -> traditional (Taiwan) via OpenCC s2twp.
Source .lrc files are NOT modified — conversion happens at inline time only.
Idempotent: safe to re-run.

Usage:
    python scripts/inline_lrc_traditional.py           # write tracks.json in-place
    python scripts/inline_lrc_traditional.py --check   # dry-run, no write
"""
import argparse
import io
import json
import re
import sys
from pathlib import Path

try:
    from opencc import OpenCC
    cc = OpenCC("s2twp")
except ImportError:
    print("[inline] FATAL: opencc-python-reimplemented required. pip install opencc-python-reimplemented",
          file=sys.stderr)
    sys.exit(2)

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

PUBLIC_MUSIC = Path(__file__).resolve().parent.parent / "public" / "music"
TRACKS_JSON = PUBLIC_MUSIC / "tracks.json"

TIME_RE = re.compile(r"\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]")
META_RE = re.compile(r"^\[(ti|ar|al|length|by|offset|re|ve):", re.I)


def parse_lrc_traditional(text):
    """Parse LRC, convert lyric text to traditional via OpenCC s2twp."""
    out = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or META_RE.match(line):
            continue
        times = []
        for m in TIME_RE.finditer(line):
            mn = int(m.group(1)); sc = int(m.group(2))
            ms = m.group(3); ms_v = int(ms.ljust(3, "0")[:3]) if ms else 0
            times.append(mn * 60 + sc + ms_v / 1000.0)
        if not times:
            continue
        lyric = TIME_RE.sub("", line).strip()
        lyric_trad = cc.convert(lyric)
        for t in times:
            out.append({"time": round(t, 3), "text": lyric_trad})
    out.sort(key=lambda x: x["time"])
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--check", action="store_true", help="dry-run, do not write")
    args = p.parse_args()

    if not TRACKS_JSON.exists():
        print(f"[inline] FATAL: {TRACKS_JSON} not found", file=sys.stderr)
        return 2

    data = json.loads(TRACKS_JSON.read_text(encoding="utf-8"))
    tracks = data["tracks"]
    matched = 0
    missing = []

    for tr in tracks:
        url = tr.get("lyricsUrl")
        if not url:
            continue
        fname = url.rsplit("/", 1)[-1]
        p_lrc = PUBLIC_MUSIC / fname
        if not p_lrc.exists():
            missing.append(fname)
            continue
        raw = p_lrc.read_text(encoding="utf-8")
        timed = parse_lrc_traditional(raw)
        if not timed:
            missing.append(fname + " (parse-empty)")
            continue
        tr["lyricsTimed"] = timed
        matched += 1

    final = sum(1 for t in tracks if t.get("lyricsTimed"))
    print(f"[inline] inlined {matched} tracks (with s2twp traditional conversion)")
    if missing:
        print(f"[inline] missing/empty {len(missing)}:")
        for m in missing:
            print(f"        - {m}")
    print(f"[inline] final tracks with lyricsTimed: {final}/{len(tracks)}")

    if args.check:
        print(f"[inline] --check: not writing")
        return 0

    out_text = json.dumps(data, ensure_ascii=False, indent=2)
    TRACKS_JSON.write_text(out_text, encoding="utf-8")
    new_size = TRACKS_JSON.stat().st_size
    print(f"[inline] {TRACKS_JSON} -> {new_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())