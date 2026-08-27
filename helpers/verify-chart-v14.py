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
                const chart = window.chart;
                // List all series attached to chart
                out.seriesCount = chart ? Object.keys(chart).filter(k => !k.startsWith("_") && typeof chart[k] === "object").length : -1;
                out.hasCandle = !!window.candleSeries;
                out.hasVol = !!window.volumeSeries;
                out.hasMA5 = !!window.ma5Line;
                out.hasMA240 = !!window.ma240Line;
                // Try chart internal _seriesList
                if (chart && chart._private__chart) {
                    const ch = chart._private__chart;
                    out.chartInternal = Object.keys(ch).slice(0, 30);
                }
                // Try series count via internal
                if (chart) {
                    try {
                        const internalSeries = chart._private__chart && chart._private__chart._serieses;
                        if (internalSeries) {
                            out.internalSeriesCount = internalSeries.size;
                            out.internalSeriesList = Array.from(internalSeries.keys()).slice(0, 20);
                        }
                    } catch(e) {}
                }
                // Check chart visible range
                if (chart) {
                    out.width = chart.options && chart.options().width;
                    out.height = chart.options && chart.options().height;
                }
            } catch(e) { out.err = e.message; }
            return out;
        }""")
        print("=== Chart series ===")
        for k, v in info.items():
            print(f"  {k}: {v}")
        await browser.close()

asyncio.run(main())
