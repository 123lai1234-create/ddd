"""Check what's actually rendered when clicking track 0"""
from playwright.sync_api import sync_playwright
import time, sys

sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context().new_page()
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(3)

    # Click track 0
    page.evaluate("() => document.querySelectorAll('.playlist-item')[0]?.click()")
    time.sleep(5)

    # Get the lyrics HTML
    html = page.evaluate("""() => {
        const ly = document.getElementById('lyrics');
        return {
            innerHTML: ly?.innerHTML?.slice(0, 2000),
            innerText: ly?.innerText?.slice(0, 200),
        };
    }""")
    print("=== Lyrics HTML ===")
    print(html['innerHTML'][:1500])
    print("\n=== Lyrics Text ===")
    print(html['innerText'])

    # Also check what tracks.json says about this track
    state = page.evaluate("""() => {
        return window.state ? {
            cur: state.currentIndex,
            playlist_size: state.playlist?.length,
        } : 'no window.state';
    }""")
    print(f"\nState: {state}")

    browser.close()
