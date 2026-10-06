#!/usr/bin/env python3
"""Create Render cron service 'donttalk-load-all-cron'.
Daily 06:00 UTC = 14:00 Asia/Taipei（收盤後，macro + market + markers 全更新）。
Hits https://donttalk-catchall.onrender.com/admin/load/all
"""
import os, sys, json, urllib.request, urllib.error

API = "https://api.render.com/v1"
TOKEN = os.environ.get("RENDER_TOKEN")
if not TOKEN:
    sys.exit("RENDER_TOKEN env var required")

req = urllib.request.Request(f"{API}/services?limit=50",
    headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"})
data = json.loads(urllib.request.urlopen(req, timeout=30).read())
catchall_svc = next((d for d in data if (d.get("service") or d).get("name") == "donttalk-catchall"), None)
if not catchall_svc:
    sys.exit("donttalk-catchall service not found")
service = catchall_svc.get("service", catchall_svc)
owner_id = service.get("ownerId")

body = {
    "type": "cron_job",
    "name": "donttalk-load-all-cron",
    "ownerId": owner_id,
    "plan": "free",
    "region": "oregon",
    "repo": "https://github.com/123lai1234-create/ddd",
    "branch": "123lai1234-create",
    "serviceDetails": {
        "env": "node",
        "rootDir": "astro/catchall-server",
        "schedule": "0 6 * * 1-5",
        "envVars": [
            {"key": "NODE_ENV", "value": "production"},
            {"key": "TZ", "value": "Asia/Taipei"},
            {"key": "MAINTENANCE_URL", "value": "https://donttalk-catchall.onrender.com"},
            {"key": "TIMEOUT_MS", "value": "240000"},
        ],
        "envSpecificDetails": {
            "buildPlan": "starter",
            "nodeVersion": "22",
            "buildCommand": "npm install",
            "startCommand": "node scripts/cron_load_all.mjs",
        },
    },
}

req = urllib.request.Request(f"{API}/services",
    method="POST",
    data=json.dumps(body).encode(),
    headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/json", "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
        print(json.dumps(resp, indent=2))
except urllib.error.HTTPError as e:
    print(f"HTTPError {e.code}")
    print(e.read().decode())