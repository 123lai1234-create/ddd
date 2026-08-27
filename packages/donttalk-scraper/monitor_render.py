"""Monitor Render deploy status until ready (or fail)."""
import asyncio
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx

KEY = "rnd_Kj02Io2I0GlOXcahdMK6WZiyYwqp"
SID = "srv-d9fe4af41pts73e0ope0"
URL = "https://donttalk-chat-bot.onrender.com"
HEADERS = {"Authorization": f"Bearer {KEY}", "Accept": "application/json"}


async def main():
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.get(f"https://api.render.com/v1/services/{SID}/deploys?limit=1", headers=HEADERS)
        deploys = r.json()
        if not deploys:
            print("no deploys yet"); return
        d = deploys[0]["deploy"]
        did = d["id"]
        print(f"deploy id: {did}")
        print(f"initial status: {d.get('status')}")
        print(f"created: {d.get('createdAt')}")
        print(f"commit: {d.get('commit', {}).get('id', '?')[:7] if isinstance(d.get('commit'), dict) else '?'}")
        print(f"trigger: {d.get('trigger')}")

        # poll
        last_status = None
        for i in range(80):  # up to 4 min
            r = await c.get(f"https://api.render.com/v1/services/{SID}/deploys/{did}", headers=HEADERS)
            d = r.json()
            status = d.get("status")
            if status != last_status:
                print(f"  [{i:2d}] status: {status}")
                last_status = status
            if status in ("live", "build_failed", "update_failed", "canceled"):
                break
            await asyncio.sleep(3)

        # Try healthz if live
        if d.get("status") == "live":
            print()
            try:
                r = await c.get(f"{URL}/healthz", timeout=15.0)
                print(f"healthz: {r.status_code} {r.text[:200]}")
            except Exception as e:
                print(f"healthz error: {e}")
        else:
            print()
            print(f"final status: {d.get('status')}")


asyncio.run(main())
