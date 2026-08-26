#!/usr/bin/env python3
"""Poll until donttalk.vercel.app deploys the fix, then verify all routes."""
import urllib.request, ssl, sys, time

ctx = ssl.create_default_context()
PAGES = [
    "index", "about", "about_me", "gene_ai", "gene-ai", "protein_mpnn", "protein-mpnn",
    "ngs", "stem-cell", "firmware", "works", "interactive-showcase",
    "interview", "interview_prep", "report", "music", "thesis", "stock",
    "ingest", "video-gen", "xian-godot", "seo-accessibility",
]

def fetch(u, follow=True):
    try:
        req = urllib.request.Request(u, headers={'User-Agent':'curl/8.0'})
        opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
        # Use default urllib (auto follow)
        return urllib.request.urlopen(req, timeout=20, context=ctx)
    except urllib.error.HTTPError as e:
        return e
    except Exception as e:
        return None

# Wait until / stops being 404 — that signals new deploy is live
print("Waiting for / to return 200 (new deploy)...")
start = time.time()
deadline = start + 240  # 4 min max
while time.time() < deadline:
    r = fetch("https://donttalk.vercel.app/")
    if r is not None and r.status == 200:
        body = r.read()
        print(f"  / returned 200 after {int(time.time()-start)}s ({len(body)} bytes)")
        break
    else:
        status = r.status if r else "ERR"
        print(f"  t={int(time.time()-start)}s  / = {status}")
        time.sleep(10)
else:
    print("TIMEOUT waiting for deploy")
    sys.exit(2)

# Verify all 22 page routes
print()
print("=" * 70)
print(f"{'PAGE':28s} {'STATUS':>8s}  {'SIZE':>8s}")
print("=" * 70)
fail = []
for p in PAGES:
    r = fetch(f"https://donttalk.vercel.app/{p}")
    if r is None:
        status = "ERR"
        size = 0
    else:
        status = r.status
        size = len(r.read())
    flag = "  ✅" if status == 200 else "  ❌"
    print(f"/{p:27s} {status:>8d}  {size:>8d}{flag}")
    if status != 200:
        fail.append(p)

# Also confirm /index.html redirect (308 → /)
print()
r = fetch("https://donttalk.vercel.app/index.html")
print(f"/index.html (final)        {r.status if r else 'ERR'}  {len(r.read()) if r else 0}")

# Confirm static assets still work
print()
for asset in ["/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.json",
              "/styles/polish.css", "/styles/shared.css", "/styles/index.css"]:
    r = fetch(f"https://donttalk.vercel.app{asset}")
    status = r.status if r else "ERR"
    size = len(r.read()) if r else 0
    print(f"{asset:30s} {status:>5d}  {size:>8d}")

# Check cache header on _assets
r = fetch("https://donttalk.vercel.app/_assets/")
# _assets is a dir so 404; check a specific file
import os
d = "/astro/dist/_assets"  # local
# Try a known JS bundle name from build
asset_dir = "D:/project/astro/.vercel/output/static/_assets"
if os.path.exists(asset_dir):
    files = [f for f in os.listdir(asset_dir) if f.endswith(('.js', '.css'))][:2]
    for f in files:
        r = fetch(f"https://donttalk.vercel.app/_assets/{f}")
        cache = r.getheader('Cache-Control') if r else None
        print(f"/_assets/{f[:30]:30s} {r.status if r else 'ERR':>5d}  cache={cache}")

print()
print("=" * 70)
if fail:
    print(f"❌ {len(fail)} pages still failing: {fail}")
    sys.exit(1)
else:
    print(f"✅ All {len(PAGES)} page routes return 200")
    sys.exit(0)