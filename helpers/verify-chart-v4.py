import asyncio, time
from playwright.async_api import async_playwright

BASE = "https://donttalk.vercel.app"
TS = int(time.time())
URL = f"{BASE}/stock-app/index.html?t=2330&v={TS}&_={TS}"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()
        await page.goto(URL, wait_until="load", timeout=60000)
        await page.wait_for_timeout(20000)
        # Force re-render
        await page.evaluate("""() => {
            try {
                if (window.chart && window.chart.timeScale) {
                    window.chart.timeScale().fitContent();
                    window.chart.applyOptions({});
                }
            } catch(e) { console.error('fitContent err:', e); }
        }""")
        await page.wait_for_timeout(3000)
        info = await page.evaluate("""() => {
            const out = {};
            try {
                const cs = window.candleSeries;
                out.candleCount = cs ? cs.data().length : -1;
                // Check price line visible position
                out.chartW = window.chart ? window.chart.width() : -1;
                out.chartH = window.chart ? window.chart.height() : -1;
                // Check first canvas pixel data (any non-zero?)
                const canvases = document.querySelectorAll('canvas');
                let totalAlpha = 0;
                for (const c of canvases) {
                    try {
                        const ctx = c.getContext('2d');
                        if (ctx) {
                            const data = ctx.getImageData(0, 0, Math.min(50, c.width), Math.min(50, c.height)).data;
                            for (let i = 3; i < data.length; i += 4) totalAlpha += data[i];
                        }
                    } catch(e) {}
                }
                out.totalAlpha = totalAlpha;
            } catch(e) { out.err = e.message; }
            return out;
        }""")
        print("=== Chart state v4 ===")
        for k, v in info.items():
            print(f"  {k}: {v}")
        await page.screenshot(path=r"D:\project\helpers\debug\chart-v4.png", full_page=False)
        await browser.close()

asyncio.run(main())
