"""Take fresh screenshot with longer wait"""
import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page()
    page.goto("https://donttalk.vercel.app/stock?v=2", wait_until="domcontentloaded", timeout=30000)
    # Wait long enough for both API and chart to load
    page.wait_for_timeout(20000)
    page.screenshot(path="D:\\project\\helpers\\debug\\04-chart-after-fix-20s.png", full_page=False)
    print("Done - screenshot at 20s")
    browser.close()
