"""Test sync with the shortest LRC track (index 19, 13_時光膠囊)"""
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

    # Click track 19 (shortest LRC, 128s)
    print("=== Click track 19 (時光膠囊, 128s) ===")
    page.evaluate("() => document.querySelectorAll('.playlist-item')[19]?.click()")

    for s in [3, 8, 15, 25, 40, 55]:
        time.sleep(s - (locals().get('_prev', 0)))
        _prev = s
        state = page.evaluate("""() => {
            const a = document.getElementById('audio-player');
            const active = document.querySelector('.lyric-line.active');
            const passed = document.querySelectorAll('.lyric-line.passed');
            return {
                t: a?.currentTime?.toFixed(2),
                paused: a?.paused,
                dur: isNaN(a?.duration) ? 'NaN' : a?.duration?.toFixed(1),
                ready: a?.readyState,
                activeLine: active?.textContent,
                activeIdx: active?.dataset?.idx,
                passedCount: passed.length,
                totalLines: document.querySelectorAll('.lyric-line').length,
            };
        }""")
        print(f"[{s}s] t={state['t']:>6s}  active='{state['activeLine']}'  passed={state['passedCount']}/{state['totalLines']}")

    page.screenshot(path='D:/project/diag-sync-working.png', full_page=True)
    browser.close()
