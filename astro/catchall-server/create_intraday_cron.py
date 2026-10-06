#!/usr/bin/env python3
"""Create Render intraday cron service.
Schedule UTC: */30 1-5 * * 1-5
= 每 30 分鐘、UTC 01:00-05:59、週一至週五
= Asia/Taipei 09:00-13:59（涵蓋台股盤中 09:00-13:30）
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
    "name": "donttalk-markers-intraday",
    "ownerId": owner_id,
    "plan": "free",
    "region": "oregon",
    "repo": "https://github.com/123lai1234-create/ddd",
    "branch": "123lai1234-create",
    "serviceDetails": {
        "env": "node",
        "rootDir": "astro/catchall-server",
        "schedule": "*/30 1-5 * * 1-5",
        "envVars": [
            {"key": "NODE_ENV", "value": "production"},
            {"key": "TZ", "value": "Asia/Taipei"},
            {"key": "MAINTENANCE_URL", "value": "https://donttalk-catchall.onrender.com/admin/markers/intraday"},
        ],
        "envSpecificDetails": {
            "buildPlan": "starter",
            "nodeVersion": "22",
            "buildCommand": "npm install",
            "startCommand": "node scripts/cron_markers_intraday.mjs",
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