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
        # Force chart re-render via internal API
        info = await page.evaluate("""() => {
            const out = {};
            try {
                const cs = window.candleSeries;
                out.candleCount = cs ? cs.data().length : -1;
                // Try update() instead of setData() to trigger re-render
                const data = cs.data();
                if (data && data.length > 0) {
                    cs.update(data[data.length - 1]);
                    out.lastUpdate = data[data.length - 1].time;
                }
                // Try fitContent
                if (window.chart) {
                    window.chart.timeScale().fitContent();
                    out.fitContentCalled = true;
                }
            } catch(e) { out.err = e.message; }
            return out;
        }""")
        print(f"Pre-wait: {info}")
        await page.wait_for_timeout(5000)
        info2 = await page.evaluate("""() => {
            const out = {};
            const tv = document.querySelector('.tv-lightweight-charts');
            const canvases = tv ? Array.from(tv.querySelectorAll('canvas')) : [];
            const main = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
            if (main) {
                const ctx = main.getContext('2d');
                const data = ctx.getImageData(0, 0, main.width, main.height).data;
                const colors = new Set();
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i+3] > 0) colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
                }
                out.uniqueColors = colors.size;
            }
            return out;
        }""")
        print(f"After update+fitContent: {info2}")
        await page.screenshot(path=r"D:\project\helpers\debug\chart-v10.png", full_page=False)
        await browser.close()

asyncio.run(main())
