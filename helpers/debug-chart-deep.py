import asyncio
import time
from playwright.async_api import async_playwright

BASE = "https://donttalk.vercel.app"
TS = int(time.time())
URL = f"{BASE}/stock-app/index.html?t=2330&_={TS}"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()
        api_calls = []
        page.on("response", lambda r: api_calls.append((r.status, r.url, r.request.method)) if "/api/" in r.url else None)
        console_msgs = []
        page.on("console", lambda m: console_msgs.append(f"{m.type}: {m.text[:300]}"))
        await page.goto(URL, wait_until="load", timeout=60000)
        # Wait longer for stockIntro + chart
        await page.wait_for_timeout(20000)
        # Snapshot chart state
        state = await page.evaluate("""() => {
            const out = {};
            try {
                out.candleDataLen = (window.candleSeries && typeof window.candleSeries.data === "function") ? window.candleSeries.data().length : -1;
            } catch(e) { out.candleDataErr = e.message; }
            try {
                if (window.candleSeries && typeof window.candleSeries.data === "function") {
                    const arr = window.candleSeries.data();
                    out.candleFirst = arr.length > 0 ? arr[0] : null;
                    out.candleLast = arr.length > 0 ? arr[arr.length-1] : null;
                }
            } catch(e) { out.candleInspectErr = e.message; }
            try {
                out.introHTML = (document.getElementById("stockIntroContent")?.innerHTML || "").slice(0, 800);
            } catch(e) { out.introErr = e.message; }
            try {
                out.maTable = Array.from(document.querySelectorAll(".ma-table td.value")).map(td => td.textContent.trim());
            } catch(e) {}
            return out;
        }""")
        await page.screenshot(path=r"D:\project\helpers\debug\deep-after-20s.png", full_page=False)
        print("=== Chart state ===")
        for k, v in state.items():
            print(f"  {k}: {str(v)[:300]}")
        print("\n=== API calls (last 15) ===")
        for st, u, m in api_calls[-15:]:
            print(f"  {m} {st} {u[:120]}")
        print("\n=== Console (last 20) ===")
        for msg in console_msgs[-20:]:
            print(f"  {msg}")
        await browser.close()

asyncio.run(main())
