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
        info = await page.evaluate("""() => {
            const out = {};
            const cs = window.candleSeries;
            const chart = window.chart;
            out.candleCount = cs ? cs.data().length : -1;
            // Re-setData with current data
            try {
                const data = cs.data();
                cs.setData([]);
                out.afterEmpty = cs.data().length;
                cs.setData(data);
                out.afterReSet = cs.data().length;
                chart.timeScale().fitContent();
            } catch(e) { out.err = e.message; }
            // Check chart private state
            try {
                out.chartState = chart._private__state || 'unknown';
            } catch(e) {}
            // Try to use a DIFFERENT new chart in same container
            try {
                const tv = document.querySelector('.tv-lightweight-charts');
                const w = tv.clientWidth, h = tv.clientHeight;
                const newChart = LightweightCharts.createChart(tv, {
                    width: w, height: h,
                    layout: { background: { type: "solid", color: "#0f0f23" }, textColor: "#8888aa" },
                });
                const newSeries = newChart.addCandlestickSeries({ upColor: "#ff1744", downColor: "#00c853" });
                newSeries.setData(cs.data());
                newChart.timeScale().fitContent();
                out.newChart = "created";
            } catch(e) { out.newChartErr = e.message; }
            return out;
        }""")
        print(f"Info: {info}")
        await page.wait_for_timeout(5000)
        info2 = await page.evaluate("""() => {
            const tvs = document.querySelectorAll('.tv-lightweight-charts');
            const out = {tvCount: tvs.length};
            tvs.forEach((tv, i) => {
                const canvases = Array.from(tv.querySelectorAll('canvas'));
                const main = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
                if (main) {
                    const ctx = main.getContext('2d');
                    const data = ctx.getImageData(0, 0, main.width, main.height).data;
                    const colors = new Set();
                    for (let j = 0; j < data.length; j += 4) {
                        if (data[j+3] > 0) colors.add(`${data[j]},${data[j+1]},${data[j+2]}`);
                    }
                    out[`tv${i}Colors`] = colors.size;
                }
            });
            return out;
        }""")
        print(f"After: {info2}")
        await browser.close()

asyncio.run(main())
