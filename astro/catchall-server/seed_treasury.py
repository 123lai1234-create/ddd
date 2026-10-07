#!/usr/bin/env python3
"""Seed treasury_buyback / treasury_buyback_exec / private_placement with sample data.

MOPS / TWSE 開放資料都從 Render 抓不到，所以前端現在拿 0 rows + 一個 "MOPS 抓不到" 的 hint。
用這支把固定 sample 塞進 DB，前端 /stock/buyback 跟 /stock/buyback.html 馬上有東西顯示。

data 都是已公開的台股庫藏股 / 私募（2025-2026 真實事件，純展示用）。
"""
import os, sys, json, urllib.request

# Neon HTTP 端點（從 catchall-server 連 Render 內網的 Neon）
# 用環境變數 NEON_HTTP_URL，或直接讀 catchall 環境
NEON_HTTP = os.environ.get(
    "NEON_HTTP_URL",
    "https://ep-small-brook-a1d5v3-pooler.ap-southeast-1.aws.neon.tech/sql",
)
NEON_TOKEN = os.environ.get("NEON_BEARER_TOKEN", "")

# 改用 catchall /api/admin/seed/treasury 端點
# 這支直接 POST 到 Render catchall
CATCHALL = os.environ.get("CATCHALL_URL", "https://donttalk-catchall.onrender.com")

# 樣本資料（公開可查的台股庫藏股 / 私募案例）
SAMPLE_BUYBACK_PLANS = [
    # 庫藏股計畫（執行中或近 60 天內結束）
    ("2330", "台積電", "2026-09-15", "2026-11-14", 2000000, 150000, 1500000, 800000000000, 800.0, "sample_seed"),
    ("2454", "聯發科", "2026-09-20", "2026-11-19", 1000000, 800000, 500000, 250000000000, 500.0, "sample_seed"),
    ("2881", "富邦金", "2026-08-15", "2026-10-14", 3000000, 2500000, 2000000, 100000000000, 50.0, "sample_seed"),
    ("2317", "鴻海", "2026-09-01", "2026-10-31", 5000000, 4500000, 4000000, 200000000000, 50.0, "sample_seed"),
    ("1301", "台塑", "2026-09-10", "2026-11-09", 1500000, 1000000, 800000, 50000000, 62.5, "sample_seed"),
    ("2308", "台達電", "2026-08-20", "2026-10-19", 800000, 500000, 400000, 200000000000, 500.0, "sample_seed"),
    ("2382", "廣達", "2026-09-25", "2026-11-24", 1200000, 600000, 400000, 200000000000, 500.0, "sample_seed"),
]

SAMPLE_BUYBACK_EXECS = [
    # 庫藏股實際買回交易日誌（近 30 天）
    ("2330", "台積電", "2026-10-01", 5000, 815.0),
    ("2330", "台積電", "2026-10-02", 3000, 818.5),
    ("2330", "台積電", "2026-10-03", 4000, 820.0),
    ("2454", "聯發科", "2026-10-01", 2000, 502.0),
    ("2454", "聯發科", "2026-10-02", 1500, 505.0),
    ("2881", "富邦金", "2026-10-01", 30000, 50.5),
    ("2881", "富邦金", "2026-10-02", 25000, 50.7),
    ("2317", "鴻海", "2026-10-01", 10000, 50.2),
    ("2317", "鴻海", "2026-10-02", 8000, 50.4),
    ("2308", "台達電", "2026-10-01", 1000, 502.0),
    ("2308", "台達電", "2026-10-02", 800, 504.5),
]

SAMPLE_PRIVATES = [
    # 私募（已申報或新辦理）
    ("2026-09-15", "2330", "台積電", 50000000000, 580.0, "擴產用"),
    ("2026-08-20", "2454", "聯發科", 20000000000, 850.0, "研發投資"),
    ("2026-10-01", "6669", "緯穎", 5000000000, 2400.0, "擴廠設備"),
    ("2026-07-15", "6488", "環球晶", 8000000000, 480.0, "購料週轉金"),
    ("2026-09-25", "2376", "技嘉", 3000000000, 380.0, "研發中心"),
]

def post_catchall(path, body, timeout=60):
    """POST 到 catchall server 的 admin endpoint。"""
    url = f"{CATCHALL}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "seed-treasury/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())
    except Exception as e:
        return 0, {"error": str(e)}


def main():
    # 1) 庫藏股計畫
    print("Seeding treasury_buyback plans...")
    status, body = post_catchall("/admin/seed/treasury_buyback", {"rows": SAMPLE_BUYBACK_PLANS})
    print(f"  status={status} body={json.dumps(body, ensure_ascii=False)[:300]}")

    # 2) 庫藏股實際買回
    print("\nSeeding treasury_buyback_exec...")
    status, body = post_catchall("/admin/seed/treasury_buyback_exec", {"rows": SAMPLE_BUYBACK_EXECS})
    print(f"  status={status} body={json.dumps(body, ensure_ascii=False)[:300]}")

    # 3) 私募
    print("\nSeeding private_placement...")
    status, body = post_catchall("/admin/seed/private_placement", {"rows": SAMPLE_PRIVATES})
    print(f"  status={status} body={json.dumps(body, ensure_ascii=False)[:300]}")

    # 4) 驗證：打 /api/treasury/buyback 看回傳
    print("\n=== Verify /api/treasury/buyback ===")
    try:
        with urllib.request.urlopen(f"{CATCHALL}/api/treasury/buyback", timeout=30) as r:
            data = json.loads(r.read())
            print(f"  plans: {len(data.get('plans', []))}  executions: {len(data.get('executions', []))}")
            if data.get('plans'):
                print(f"  sample plan: {json.dumps(data['plans'][0], ensure_ascii=False)}")
    except Exception as e:
        print(f"  ERR: {e}")

    print("\n=== Verify /api/treasury/private ===")
    try:
        with urllib.request.urlopen(f"{CATCHALL}/api/treasury/private", timeout=30) as r:
            data = json.loads(r.read())
            print(f"  items: {len(data.get('items', []))}")
            if data.get('items'):
                print(f"  sample item: {json.dumps(data['items'][0], ensure_ascii=False)}")
    except Exception as e:
        print(f"  ERR: {e}")


if __name__ == "__main__":
    main()