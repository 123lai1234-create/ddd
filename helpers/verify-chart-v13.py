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
        # Add a brand-new chart alongside the broken one, in a fresh container
        await page.evaluate("""() => {
            const old = document.getElementById("chart-container");
            const fresh = document.createElement("div");
            fresh.id = "chart-fresh";
            fresh.style.cssText = "position:fixed;top:0;left:0;width:1280px;height:400px;z-index:9999;background:#000";
            document.body.appendChild(fresh);
            const c = LightweightCharts.createChart(fresh, {
                width: 1280, height: 400,
                layout: { background: { type: "solid", color: "#0f0f23" }, textColor: "#8888aa" },
                grid: { vertLines: { color: "#1a1a3e" }, horzLines: { color: "#1a1a3e" } },
            });
            const cs = c.addCandlestickSeries({ upColor: "#ff1744", downColor: "#00c853" });
            fetch('/api/stock/2330?days=120&strategy=original').then(r => r.json()).then(d => {
                const candles = (d.candles || []).map(c => ({
                    time: c.time, open: +c.open, high: +c.high, low: +c.low, close: +c.close
                }));
                cs.setData(candles);
                c.timeScale().fitContent();
                window.__freshChart = c;
                window.__freshCandles = candles.length;
            });
        }""")
        await page.wait_for_timeout(8000)
        info = await page.evaluate("""() => {
            const fresh = document.getElementById("chart-fresh");
            const canvases = fresh ? Array.from(fresh.querySelectorAll('canvas')) : [];
            const main = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
            if (main) {
                const ctx = main.getContext('2d');
                const data = ctx.getImageData(0, 0, main.width, main.height).data;
                const colors = new Set();
                let nonZero = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i+3] > 0) {
                        colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
                        nonZero++;
                    }
                }
                return {uniqueColors: colors.size, nonZeroPixels: nonZero, totalPixels: data.length / 4, freshCandles: window.__freshCandles};
            }
            return {};
        }""")
        print(f"Fresh chart: {info}")
        await page.screenshot(path=r"D:\project\helpers\debug\chart-v13.png", full_page=False)
        await browser.close()

asyncio.run(main())
