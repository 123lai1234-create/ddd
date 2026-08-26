import asyncio, time
from playwright.async_api import async_playwright

BASE = "https://donttalk.vercel.app"
TS = int(time.time())
URL = f"{BASE}/stock-app/index.html?t=2330&_={TS}"

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
                out.candleExists = !!cs;
                out.candleDataLen = cs && typeof cs.data === "function" ? cs.data().length : -1;
                if (cs) {
                    const opts = cs.options ? cs.options() : {};
                    out.candleOpts = JSON.stringify(opts, null, 2).slice(0, 500);
                }
            } catch(e) { out.candleErr = e.message; }
            try {
                const chart = window.chart;
                out.chartExists = !!chart;
                if (chart) {
                    const panes = chart.panes();
                    out.paneCount = panes.length;
                    out.paneHeights = panes.map(p => p.getHeight());
                    const ts = chart.timeScale();
                    out.timeRange = ts.getVisibleLogicalRange();
                }
            } catch(e) { out.chartErr = e.message; }
            try {
                const container = document.querySelector("#chart, [class*='chart']");
                if (container) {
                    const r = container.getBoundingClientRect();
                    out.containerRect = {w: r.width, h: r.height, top: r.top, left: r.left};
                }
            } catch(e) {}
            try {
                const ch = document.querySelectorAll("canvas");
                out.canvasCount = ch.length;
                out.canvasRects = Array.from(ch).slice(0, 5).map(c => {
                    const r = c.getBoundingClientRect();
                    return {w: r.width, h: r.height};
                });
            } catch(e) {}
            return out;
        }""")
        print("=== Chart debug ===")
        for k, v in info.items():
            print(f"  {k}: {str(v)[:500]}")
        await browser.close()

asyncio.run(main())
