# ascii_mirror.py - make every non-ASCII path reachable by the Vercel CLI.
#
# Why this exists:
#   Vercel CLI 66 on Windows skips every path containing non-ASCII characters when
#   it enumerates files for upload. Measured on 2026-11-18: .vercel/output held
#   1654 files, the CLI reported "Found 889 files" = the 887 pure-ASCII ones plus
#   2 function files. The 767 skipped files were exactly the ones under
#   music/ whose directory names are Chinese song titles -> the whole music
#   section (cards, song pages, covers) 404'd in production.
#
#   Windows tar.exe crashes the same way (ACCESS_VIOLATION, 5 entries written),
#   which is why `vercel deploy --archive tgz` produced a truncated archive.
#
# The fix:
#   For every path with non-ASCII characters, also write a percent-encoded ASCII
#   copy next to it:
#       music/cards/05_雨夜出租/og-image.jpg
#     -> music/cards/05_%E9%9B%A8%E5%A4%9C%E5%87%BA%E7%A7%9F/og-image.jpg
#   Browsers and crawlers percent-encode Chinese path segments anyway, so the
#   request that arrives at Vercel already matches the ASCII copy. The public
#   URLs stay exactly the same and nothing in Astro has to change.
#
# Usage:
#   python scripts/ascii_mirror.py .vercel/output/static
import os
import shutil
import sys
from urllib.parse import quote


def enc_component(name):
    """One path segment -> percent-encoded ASCII (keeps ordinary punctuation)."""
    return quote(name, safe="!$&'()*+,-.:;=@_~")


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else r".vercel\output\static"
    made = skipped = 0
    for dirpath, _, filenames in os.walk(root):
        for f in filenames:
            src = os.path.join(dirpath, f)
            rel = os.path.relpath(src, root)
            if not any(ord(c) > 127 for c in rel):
                continue
            enc = os.path.join(*[enc_component(p) for p in rel.split(os.sep)])
            dst = os.path.join(root, enc)
            if os.path.exists(dst):
                skipped += 1
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
            made += 1
    print("ascii mirror: created %d file(s), %d already present" % (made, skipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
