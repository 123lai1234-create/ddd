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
            // Remove old chart, create brand new one in same container
            if (window.chart) { window.chart.remove(); }
            const c = document.getElementById("chart-container");
            // Clear children (lightweight-charts DOM)
            c.innerHTML = '<div id="chartLegend" style="display:none"></div><div id="posRatioLegend" style="display:none"></div><div id="loadingOverlay" class="loading-overlay" style="display:none"></div><canvas id="vpCanvas" style="position:absolute;top:0;left:0;z-index:10;display:none"></canvas>';
            const data = window.candleSeries ? window.candleSeries.data() : null;
            const w = c.clientWidth, h = c.clientHeight;
            const newChart = LightweightCharts.createChart(c, {
                width: w, height: h,
                layout: { background: { type: "solid", color: "#0f0f23" }, textColor: "#8888aa" },
                grid: { vertLines: { color: "#1a1a3e" }, horzLines: { color: "#1a1a3e" } },
            });
            const newSeries = newChart.addCandlestickSeries({ upColor: "#ff1744", downColor: "#00c853" });
            if (data && data.length) {
                newSeries.setData(data);
                newChart.timeScale().fitContent();
            }
            return {newChart: true, w, h, dataLen: data ? data.length : 0};
        }""")
        print(f"New chart: {info}")
        await page.wait_for_timeout(5000)
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
        print(f"After new chart: {info2}")
        await page.screenshot(path=r"D:\project\helpers\debug\chart-v18.png", full_page=False)
        await browser.close()

asyncio.run(main())
