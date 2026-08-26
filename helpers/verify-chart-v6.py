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
            const cc = document.getElementById("chart-container");
            const out = {ccRect: null, children: []};
            if (cc) {
                const r = cc.getBoundingClientRect();
                out.ccRect = {w: r.width, h: r.height, top: r.top, left: r.left, zIndex: getComputedStyle(cc).zIndex};
                for (const child of cc.children) {
                    const cr = child.getBoundingClientRect();
                    const cs = getComputedStyle(child);
                    out.children.push({
                        tag: child.tagName,
                        id: child.id,
                        cls: child.className,
                        w: cr.width, h: cr.height,
                        top: cr.top, left: cr.left,
                        pos: cs.position, z: cs.zIndex,
                        display: cs.display, vis: cs.visibility, opacity: cs.opacity,
                    });
                }
            }
            return out;
        }""")
        print("=== Chart container DOM ===")
        if info.get("ccRect"):
            print(f"  container: {info['ccRect']}")
        for c in info.get("children", []):
            print(f"  {c}")
        # Screenshot only chart container
        chart_box = await page.locator("#chart-container").bounding_box()
        if chart_box:
            await page.screenshot(path=r"D:\project\helpers\debug\chart-only.png",
                                  clip=chart_box)
        await browser.close()

asyncio.run(main())
