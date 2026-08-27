"""Wait 60s to see if LRC eventually loads"""
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context().new_page()
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(2)

    print("=== Click track 1 ===")
    page.evaluate("() => document.querySelectorAll('.playlist-item')[1]?.click()")

    for s in [1, 3, 5, 10, 20, 40, 60]:
        time.sleep(s - (locals().get('_prev', 0)))
        _prev = s
        state = page.evaluate("""() => {
            const a = document.getElementById('audio-player');
            const ly = document.getElementById('lyrics');
            return {
                t: a?.currentTime?.toFixed(2),
                paused: a?.paused,
                dur: isNaN(a?.duration) ? 'NaN' : a?.duration?.toFixed(1),
                ready: a?.readyState,
                net: a?.networkState,
                err: a?.error?.code,
                lyricN: ly?.querySelectorAll('.lyric-line').length,
                lyricText: ly?.innerText?.slice(0, 40),
            };
        }""")
        print(f"[{s}s] {state}")

    browser.close()
