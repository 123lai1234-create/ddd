"""Take fresh screenshot to verify chart renders after fix"""
import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append(f"[{m.type}] {m.text[:200]}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append(f"[pageerror] {str(e)[:200]}"))

    # 加 ?v=2 cache buster
    page.goto("https://donttalk.vercel.app/stock?v=2", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(8000)

    page.screenshot(path="D:\\project\\helpers\\debug\\03-chart-after-fix.png", full_page=False)
    print("Screenshot saved: 03-chart-after-fix.png")
    print(f"Console errors: {len(errs)}")
    for e in set(errs)[:10]:
        print(f"  {e}")

    browser.close()
