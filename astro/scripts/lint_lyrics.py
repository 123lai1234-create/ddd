#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lint all .lrc files under public/music/ for:
  - Simplified Chinese characters (detected via OpenCC s2twp no-op check)
  - Suspicious garbage chars (Latin-1 control range)
  - Tracks with fewer than 5 timed lines (stub-like)

Usage:
    python scripts/lint_lyrics.py            # print to stdout
    python scripts/lint_lyrics.py --json     # JSON output

Exit code 0 if all OK; 1 if any issue found (so CI can gate).
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
    HAS_OPENCC = True
except ImportError:
    print("[lint] WARNING: opencc-python-reimplemented not installed; simp check disabled", file=sys.stderr)
    HAS_OPENCC = False

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

PUBLIC_MUSIC = Path(__file__).resolve().parent.parent / "public" / "music"
TRACKS_JSON = PUBLIC_MUSIC / "tracks.json"

TIME_RE = re.compile(r"\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]")
META_RE = re.compile(r"^\[(ti|ar|al|length|by|offset|re|ve):", re.I)
GARBAGE_RE = re.compile(r"[\u0080-\u00bf]")


def parse_lrc(text):
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
        out.append({"time": times[0], "text": TIME_RE.sub("", line).strip()})
    out.sort(key=lambda x: x["time"])
    return out


def count_simp(text):
    if not HAS_OPENCC:
        return 0
    diffs = sum(1 for a, b in zip(text, cc.convert(text)) if a != b)
    diffs += abs(len(text) - len(cc.convert(text)))
    return diffs


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--json", action="store_true")
    p.add_argument("--min-lines", type=int, default=5)
    args = p.parse_args()

    if not TRACKS_JSON.exists():
        print(f"[lint] FATAL: {TRACKS_JSON} not found", file=sys.stderr)
        return 2

    data = json.loads(TRACKS_JSON.read_text(encoding="utf-8"))
    by_id = {t["id"]: t for t in data["tracks"]}

    results = []
    issues_total = 0
    for tid in sorted(by_id.keys()):
        tr = by_id[tid]
        url = tr.get("lyricsUrl")
        if not url:
            continue
        fname = url.rsplit("/", 1)[-1]
        p_lrc = PUBLIC_MUSIC / fname
        if not p_lrc.exists():
            results.append({
                "id": tid, "title": tr["title"], "status": "FILE_MISSING",
                "file": fname, "lines": 0, "simp_chars": 0,
            })
            issues_total += 1
            continue
        raw = p_lrc.read_text(encoding="utf-8")
        parsed = parse_lrc(raw)
        text_all = " ".join(x["text"] for x in parsed)
        n_simp = count_simp(text_all)
        n_lines = len(parsed)
        garbage = bool(GARBAGE_RE.search(text_all))
        issues = []
        if n_simp > 0:
            issues.append(f"SIMP:{n_simp}")
        if n_lines < args.min_lines:
            issues.append(f"SHORT:{n_lines}")
        if garbage:
            issues.append("GARBAGE")
        status = ",".join(issues) if issues else "OK"
        if issues:
            issues_total += 1
        results.append({
            "id": tid, "title": tr["title"], "status": status,
            "file": fname, "lines": n_lines, "simp_chars": n_simp,
            "garbage": garbage,
        })

    if args.json:
        print(json.dumps({"linted": len(results), "issues": issues_total, "results": results},
                         ensure_ascii=False, indent=2))
    else:
        print(f"== Lint {len(results)} LRC files (public/music/) ==")
        print(f"  issues: {issues_total}")
        print()
        print(f"{'id':>3} {'status':14} {'lines':>5} {'simp':>5} {'title':<28} file")
        for r in results:
            print(f"{r['id']:>3} {r['status']:14} {r['lines']:>5} {r['simp_chars']:>5} "
                  f"{r['title'][:28]:<28} {r['file']}")

    return 0 if issues_total == 0 else 1


if __name__ == "__main__":
    sys.exit(main())