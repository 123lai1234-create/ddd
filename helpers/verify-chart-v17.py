import asyncio, time
from playwright.async_api import async_playwright

BASE = "https://donttalk.vercel.app"
TS = int(time.time())
URL = f"{BASE}/stock-app/index.html?t=2330&v={TS}&_={TS}"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=["--no-sandbox"])
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()
        await page.goto(URL, wait_until="load", timeout=60000)
        await page.wait_for_timeout(15000)
        info = await page.evaluate("""() => {
            if (!window.chart || !window.candleSeries) return {err: 'no chart'};
            const cs = window.candleSeries;
            const ts = window.chart.timeScale();
            const data = cs.data();
            // Force fitContent and then immediately force logical range
            ts.fitContent();
            return new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        try {
                            // Set logical range to cover all candles
                            ts.setVisibleLogicalRange({from: 0, to: data.length - 1 + 5});
                            setTimeout(() => {
                                resolve({
                                    afterLogical: ts.getVisibleLogicalRange(),
                                    afterTime: ts.getVisibleRange(),
                                    dataLen: data.length,
                                });
                            }, 1000);
                        } catch(e) { resolve({err: e.message}); }
                    });
                });
            });
        }""")
        print(f"After setVisibleLogicalRange: {info}")
        await page.wait_for_timeout(3000)
        info2 = await page.evaluate("""() => {
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
                return {uniqueColors: colors.size};
            }
            return {};
        }""")
        print(f"Canvas: {info2}")
        await page.screenshot(path=r"D:\project\helpers\debug\chart-v17.png", full_page=False)
        await browser.close()

asyncio.run(main())
