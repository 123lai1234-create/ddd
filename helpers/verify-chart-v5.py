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
        # Check canvas pixel data
        info = await page.evaluate("""() => {
            const out = {};
            try {
                out.candleCount = window.candleSeries ? window.candleSeries.data().length : -1;
                const canvases = Array.from(document.querySelectorAll('#chart-container canvas'));
                out.canvasCount = canvases.length;
                out.canvasDims = canvases.map(c => ({w: c.width, h: c.height, sw: c.style.width, sh: c.style.height}));
                let totalAlpha = 0;
                for (const c of canvases) {
                    try {
                        const ctx = c.getContext('2d');
                        const data = ctx.getImageData(0, 0, c.width, c.height).data;
                        for (let i = 3; i < data.length; i += 4) totalAlpha += data[i];
                    } catch(e) { out.canvasErr = e.message; }
                }
                out.totalAlpha = totalAlpha;
            } catch(e) { out.err = e.message; }
            return out;
        }""")
        print("=== Chart state v5 ===")
        for k, v in info.items():
            print(f"  {k}: {v}")
        await page.screenshot(path=r"D:\project\helpers\debug\chart-v5.png", full_page=False)
        await browser.close()

asyncio.run(main())
