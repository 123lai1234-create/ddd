"""Check 2330 metadata_text to see what fields are available"""
import os
import json
import urllib.request
import urllib.error

# 透過 catchall.mjs 查
req = urllib.request.Request(
    "https://donttalk.vercel.app/api/stock/intro?code=2330",
    headers={"User-Agent": "test"}
)
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
        print("Stock intro for 2330:")
        print(json.dumps(data, ensure_ascii=False, indent=2)[:2500])
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.reason}")
    try:
        print(e.read().decode())
    except:
        pass
except Exception as e:
    print(f"ERR: {e}")

print()
print("=== Also check /api/stock/2330/financial ===")
req2 = urllib.request.Request(
    "https://donttalk.vercel.app/api/stock/2330/financial",
    headers={"User-Agent": "test"}
)
try:
    with urllib.request.urlopen(req2, timeout=15) as r:
        data = json.loads(r.read())
        print(json.dumps(data, ensure_ascii=False, indent=2)[:2500])
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.reason}")
except Exception as e:
    print(f"ERR: {e}")
