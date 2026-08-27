import asyncio
import json
import time
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "https://donttalk.vercel.app"
OUT = Path(r"D:\project\helpers\audit-2026-08-14")
OUT.mkdir(parents=True, exist_ok=True)
TS = int(time.time())

PAGES = [
    ("stock-2330", f"{BASE}/stock-app/index.html?t=2330&_={TS}"),
    ("stock-2454", f"{BASE}/stock-app/index.html?t=2454&_={TS}"),
    ("price-compare", f"{BASE}/stock-app/price-compare.html?_={TS}"),
    ("exdiv", f"{BASE}/stock-app/exdiv.html?_={TS}"),
    ("uptrend-watch", f"{BASE}/stock-app/uptrend-watch.html?_={TS}"),
    ("sitemap", f"{BASE}/stock-app/sitemap.html?_={TS}"),
    ("dashboard", f"{BASE}/stock-app/dashboard.html?_={TS}"),
    ("signal-filter", f"{BASE}/stock-app/signal-filter.html?_={TS}"),
]

async def main():
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        for name, url in PAGES:
            page = await ctx.new_page()
            console_errors = []
            page.on("console", lambda m, n=name: console_errors.append(f"{m.type}: {m.text[:200]}") if m.type in ("error", "warning") else None)
            try:
                resp = await page.goto(url, wait_until="load", timeout=60000)
                status = resp.status if resp else "no-resp"
                # Wait for chart/API
                if "index.html" in url:
                    await page.wait_for_timeout(10000)
                else:
                    await page.wait_for_timeout(4000)
                shot = OUT / f"{name}.png"
                await page.screenshot(path=str(shot), full_page=False)
                snippet = await page.evaluate("""() => {
                    const pick = (sel) => {
                        const el = document.querySelector(sel);
                        return el ? el.textContent.trim().slice(0, 100) : null;
                    };
                    return {
                        title: document.title,
                        ma5: pick('#valMA5'),
                        ma10: pick('#valMA10'),
                        ma20: pick('#valMA20'),
                        ma60: pick('#valMA60'),
                        ma240: pick('#valMA240'),
                    };
                }""")
                results.append({
                    "page": name, "url": url, "status": status,
                    "screenshot": str(shot),
                    "errors": console_errors[:5],
                    "snippet": snippet,
                })
                print(f"[OK] {name} status={status} errors={len(console_errors)} ma240={snippet.get('ma240')}")
            except Exception as e:
                results.append({"page": name, "url": url, "error": str(e)[:200]})
                print(f"[ERR] {name} ERROR: {str(e)[:120]}")
            finally:
                await page.close()
        await browser.close()
    (OUT / "report.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n=== Report saved to {OUT / 'report.json'} ===")

asyncio.run(main())
