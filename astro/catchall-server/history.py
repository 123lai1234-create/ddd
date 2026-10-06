#!/usr/bin/env python3
"""Show deploy history of donttalk-catchall."""
import os, sys, json, urllib.request
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SERVICE_ID = "srv-db1i3pid0e5s73fro2dg"
req = urllib.request.Request(
  f"https://api.render.com/v1/services/{SERVICE_ID}/deploys?limit=10",
  headers={"Authorization": "Bearer " + os.environ.get("RENDER_TOKEN",""), "Accept": "application/json"}
)
with urllib.request.urlopen(req, timeout=30) as r:
  data = json.loads(r.read())

for d in data[:20]:
  print(json.dumps(d, indent=2, ensure_ascii=False))
  print("---")