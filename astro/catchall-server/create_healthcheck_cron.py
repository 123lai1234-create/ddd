#!/usr/bin/env python3
"""Create Render cron service 'donttalk-healthcheck-cron'.
每日 06:30 UTC = 14:30 Asia/Taipei（load_all 之後 30 分鐘）。
跑 scripts/daily_health_check.mjs → 19 個 API/HTML 健康檢查 + 自動修復（POST refresh/load_all）。

⚠️ 2026-10-08：目前未接 Render cron — 改走 GitHub Actions
   .github/workflows/daily-health-check.yml（同樣 '30 6 * * 1-5' UTC 觸發、
   跑同一個 scripts/daily_health_check.mjs、寫同一個 Neon health_check_log 表）。
   這份腳本留著備用，未來若 Render 部署策略改回 cron、或要備援排程時再跑：

     RENDER_TOKEN=... python astro/catchall-server/create_healthcheck_cron.py
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
    "name": "donttalk-healthcheck-cron",
    "ownerId": owner_id,
    "plan": "free",
    "region": "oregon",
    "repo": "https://github.com/123lai1234-create/ddd",
    "branch": "123lai1234-create",
    "serviceDetails": {
        "env": "node",
        "rootDir": "astro/catchall-server",
        # 06:30 UTC = 14:30 Asia/Taipei（load_all 06:00 UTC 跑完後 30 分鐘）
        "schedule": "30 6 * * 1-5",
        "envVars": [
            {"key": "NODE_ENV", "value": "production"},
            {"key": "TZ", "value": "Asia/Taipei"},
            {"key": "RENDER_BASE", "value": "https://donttalk-catchall.onrender.com"},
            {"key": "VERCEL_BASE", "value": "https://donttalk.vercel.app"},
            {"key": "TIMEOUT_MS", "value": "15000"},
            {"key": "FIX_ENABLED", "value": "1"},
        ],
        "envSpecificDetails": {
            "buildPlan": "starter",
            "nodeVersion": "22",
            "buildCommand": "npm install",
            "startCommand": "node scripts/daily_health_check.mjs",
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
        svc = resp.get("service", resp)
        cron_id = svc.get("id")
        if cron_id:
            print(f"\n✅ Cron service created: id={cron_id}  name={svc.get('name')}")
            print(f"   schedule: {body['serviceDetails']['schedule']} (UTC)")
            print(f"   Asia/Taipei: 14:30 週一至週五")
            print(f"   command: {body['serviceDetails']['envSpecificDetails']['startCommand']}")
except urllib.error.HTTPError as e:
    print(f"HTTPError {e.code}")
    print(e.read().decode())
