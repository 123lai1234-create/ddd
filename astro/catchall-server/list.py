#!/usr/bin/env python3
"""List all Render services + their auto-deploy config."""
import os, json, urllib.request

req = urllib.request.Request(
  "https://api.render.com/v1/services?limit=50",
  headers={"Authorization": "Bearer " + os.environ.get("RENDER_TOKEN",""), "Accept": "application/json"}
)
with urllib.request.urlopen(req, timeout=30) as r:
  data = json.loads(r.read())
for s in data:
  print(json.dumps(s, indent=2, ensure_ascii=False))
  print("---")