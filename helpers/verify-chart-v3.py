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
        await page.wait_for_timeout(15000)
        info = await page.evaluate("""() => {
            const out = {};
            try {
                const cs = window.candleSeries;
                if (cs) {
                    const arr = cs.data();
                    out.candleCount = arr.length;
                    if (arr.length > 0) {
                        out.firstTime = arr[0].time;
                        out.lastTime = arr[arr.length-1].time;
                        out.firstOHLC = [arr[0].open, arr[0].high, arr[0].low, arr[0].close];
                        out.lastOHLC = [arr[arr.length-1].open, arr[arr.length-1].high, arr[arr.length-1].low, arr[arr.length-1].close];
                    }
                }
            } catch(e) { out.candleErr = e.message; }
            try {
                const chart = window.chart;
                if (chart) {
                    const ts = chart.timeScale();
                    out.timeRange = ts.getVisibleLogicalRange();
                    out.timeRangeTime = ts.getVisibleRange();
                    const ps = chart.priceScale("right");
                    if (ps) {
                        out.priceMargins = ps.getMargins ? ps.getMargins() : null;
                    }
                    out.priceAutoScale = ps.getAutoScale ? ps.getAutoScale() : null;
                }
            } catch(e) { out.scaleErr = e.message; }
            try {
                out.ma240Line = window.ma240Line ? "exists" : "missing";
                if (window.ma240Line && typeof window.ma240Line.data === "function") {
                    out.ma240Data = window.ma240Line.data().length;
                }
            } catch(e) {}
            return out;
        }""")
        print("=== Chart state v3 ===")
        for k, v in info.items():
            print(f"  {k}: {v}")
        await browser.close()

asyncio.run(main())
