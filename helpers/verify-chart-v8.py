import asyncio, time, base64
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
            const tv = document.querySelector('.tv-lightweight-charts');
            const canvases = tv ? Array.from(tv.querySelectorAll('canvas')) : [];
            return canvases.map((c, i) => {
                const dataUrl = c.toDataURL('image/png');
                return {
                    i,
                    w: c.width, h: c.height,
                    sw: c.style.width, sh: c.style.height,
                    dataUrlLen: dataUrl.length,
                    dataUrlHead: dataUrl.substring(0, 100)
                };
            });
        }""")
        # Save each canvas as PNG
        for c in info:
            full = await page.evaluate("""(i) => {
                const tv = document.querySelector('.tv-lightweight-charts');
                const c = tv.querySelectorAll('canvas')[i];
                return c.toDataURL('image/png');
            }""", c["i"])
            # Strip data:image/png;base64,
            b64 = full.split(",", 1)[1]
            with open(rf"D:\project\helpers\debug\canvas-{c['i']}.png", "wb") as f:
                f.write(base64.b64decode(b64))
            print(f"  canvas[{c['i']}] {c['w']}x{c['h']} style={c['sw']}x{c['sh']} dataUrlLen={c['dataUrlLen']}")
        await browser.close()

asyncio.run(main())
