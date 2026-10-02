#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Convert all .lrc files under public/music/ from simplified -> traditional (s2twp).
Preserves [mm:ss.xx] time tags; converts both metadata labels and lyric text.
Writes UTF-8 (no BOM), LF line endings.

Usage:
    python scripts/convert_lrc_source.py            # apply to all LRC files
    python scripts/convert_lrc_source.py --check    # dry-run, do not write
    python scripts/convert_lrc_source.py <lrcpath>  # convert single file
"""
import argparse
import io
import re
import sys
from pathlib import Path

try:
    from opencc import OpenCC
    cc = OpenCC("s2twp")
except ImportError:
    print("[convert] FATAL: opencc-python-reimplemented required", file=sys.stderr)
    sys.exit(2)

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

PUBLIC_MUSIC = Path(__file__).resolve().parent.parent / "public" / "music"

TIME_RE = re.compile(r"\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]")


def convert_lrc_text(text):
    """Convert LRC content preserving time tags. Both metadata labels and lyric text are converted."""
    out_lines = []
    for raw in text.splitlines():
        # Strip and re-add newline structure
        line = raw.rstrip()
        # Split into time tags and remainder
        # Find leading time tags
        m = TIME_RE.match(line)
        tags_end = 0
        tags_text = ""
        while m:
            tags_text += m.group(0)
            tags_end = m.end()
            m = TIME_RE.match(line, tags_end)
        remainder = line[tags_end:]
        if not remainder:
            out_lines.append(line)
            continue
        # Metadata labels like [ti:title], [ar:artist]
        meta_m = re.match(r"^\[(\w+):(.+?)\]\s*$", remainder)
        if meta_m:
            label = meta_m.group(1)
            value = cc.convert(meta_m.group(2))
            out_lines.append(f"{tags_text}[{label}:{value}]")
        else:
            # Lyric line
            converted = cc.convert(remainder)
            out_lines.append(f"{tags_text}{converted}")
    # Rejoin with LF; trailing newline
    result = "\n".join(out_lines)
    if not result.endswith("\n"):
        result += "\n"
    return result


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--check", action="store_true", help="dry-run")
    p.add_argument("paths", nargs="*", help="specific .lrc files (default: all in public/music/)")
    args = p.parse_args()

    if args.paths:
        targets = [Path(x) for x in args.paths]
    else:
        targets = sorted(PUBLIC_MUSIC.glob("*.lrc"))

    converted = 0
    skipped = 0
    diffs_log = []

    for entry in targets:
        if not entry.exists():
            print(f"[convert] MISSING: {entry}", file=sys.stderr)
            continue
        try:
            text = entry.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            print(f"[convert] SKIP (not utf-8): {entry}", file=sys.stderr)
            skipped += 1
            continue
        new_text = convert_lrc_text(text)
        if new_text == text:
            continue
        diffs_log.append((entry.name, len(text), len(new_text)))
        if not args.check:
            entry.write_text(new_text, encoding="utf-8", newline="\n")
        converted += 1

    mode_label = "WOULD CONVERT" if args.check else "CONVERTED"
    print(f"[convert] {converted} files {mode_label} ({skipped} skipped)")
    for name, old_size, new_size in diffs_log:
        print(f"  {name}: {old_size} -> {new_size} bytes")

    return 0


if __name__ == "__main__":
    sys.exit(main())