import asyncio, time
from playwright.async_api import async_playwright

BASE = "https://donttalk.vercel.app"
TS = int(time.time())
URL = f"{BASE}/stock-app/index.html?t=2330&v={TS}&_={TS}"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--use-gl=swiftshader", "--enable-webgl"])
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()
        await page.goto(URL, wait_until="load", timeout=60000)
        await page.wait_for_timeout(20000)
        info = await page.evaluate("""() => {
            const out = {};
            // Find main chart canvas (the one inside tv-lightweight-charts that's largest)
            const tv = document.querySelector('.tv-lightweight-charts');
            const canvases = tv ? Array.from(tv.querySelectorAll('canvas')) : [];
            out.tvCanvasCount = canvases.length;
            out.tvCanvasDims = canvases.map(c => ({w: c.width, h: c.height, sw: c.style.width, sh: c.style.height}));
            // Sample main content canvas (largest by area)
            const main = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
            if (main) {
                const ctx = main.getContext('2d');
                const data = ctx.getImageData(0, 0, main.width, main.height).data;
                // Count unique non-bg colors
                const colors = new Set();
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
                    if (a > 0) colors.add(`${r},${g},${b}`);
                }
                out.uniqueColors = colors.size;
                out.colorSample = Array.from(colors).slice(0, 10);
            }
            return out;
        }""")
        print("=== Main canvas pixel analysis ===")
        for k, v in info.items():
            print(f"  {k}: {v}")
        await browser.close()

asyncio.run(main())
