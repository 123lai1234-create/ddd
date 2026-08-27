"""Verify which URLs are 404'ing on the music page"""
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    page = browser.new_context().new_page()

    failed = []
    page.on("response", lambda r: failed.append((r.status, r.url)) if r.status >= 400 else None)

    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded")
    time.sleep(3)
    page.evaluate("""() => {
        const items = document.querySelectorAll('.playlist-item');
        if (items[1]) items[1].click();
    }""")
    time.sleep(5)

    print("--- Failed requests ---")
    for status, url in failed:
        print(f"{status}  {url}")

    browser.close()
