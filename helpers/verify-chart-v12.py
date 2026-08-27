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
        # Re-init chart with fresh state (no extra series, no autoscaleInfoProvider)
        await page.evaluate("""() => {
            try {
                if (window.chart) {
                    window.chart.remove();
                }
                const tv = document.querySelector('.tv-lightweight-charts');
                const w = tv.clientWidth, h = tv.clientHeight;
                const c = document.getElementById("chart-container");
                window.chart = LightweightCharts.createChart(c, {
                    width: w, height: h,
                    layout: { background: { type: "solid", color: "#0f0f23" }, textColor: "#8888aa" },
                    grid: { vertLines: { color: "#1a1a3e" }, horzLines: { color: "#1a1a3e" } },
                });
                const cs = window.chart.addCandlestickSeries({
                    upColor: "#ff1744", downColor: "#00c853",
                    borderUpColor: "#ff1744", borderDownColor: "#00c853",
                    wickUpColor: "#ff1744", wickDownColor: "#00c853"
                });
                // Re-fetch and re-set
                fetch('/api/stock/2330?days=120&strategy=original').then(r => r.json()).then(d => {
                    const candles = (d.candles || []).map(c => ({
                        time: c.time, open: +c.open, high: +c.high, low: +c.low, close: +c.close
                    }));
                    cs.setData(candles);
                    window.chart.timeScale().fitContent();
                });
            } catch(e) { console.error('reinit err:', e); }
        }""")
        await page.wait_for_timeout(8000)
        info = await page.evaluate("""() => {
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
                return {uniqueColors: colors.size, candleCount: window.candleSeries ? window.candleSeries.data().length : -1};
            }
            return {};
        }""")
        print(f"After fresh reinit: {info}")
        await page.screenshot(path=r"D:\project\helpers\debug\chart-v12.png", full_page=False)
        await browser.close()

asyncio.run(main())
