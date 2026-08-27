import asyncio, time
from playwright.async_api import async_playwright

BASE = "https://donttalk.vercel.app"
TS = int(time.time())
URL = f"{BASE}/stock-app/index.html?t=2330&v={TS}&_={TS}"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800}, bypass_csp=True)
        ctx.set_extra_http_headers({"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"})
        page = await ctx.new_page()
        await page.goto(URL, wait_until="load", timeout=60000)
        await page.wait_for_timeout(15000)
        info = await page.evaluate("""() => {
            const out = {};
            const cc = document.getElementById("chart-container");
            if (cc) {
                const r = cc.getBoundingClientRect();
                out.chartH = r.height;
                const mainArea = cc.parentElement;
                if (mainArea) {
                    const mr = mainArea.getBoundingClientRect();
                    out.mainAreaH = mr.height;
                }
            }
            out.candleDataLen = window.candleSeries && typeof window.candleSeries.data === "function" ? window.candleSeries.data().length : -1;
            return out;
        }""")
        print("=== Chart container check ===")
        for k, v in info.items():
            print(f"  {k}: {v}")
        await page.screenshot(path=r"D:\project\helpers\debug\chart-v2.png", full_page=False)
        await browser.close()

asyncio.run(main())
