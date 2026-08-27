"""Sample every 1s to see if lyrics actually sync"""
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

    print("=== Click track 19 ===")
    page.evaluate("() => document.querySelectorAll('.playlist-item')[19]?.click()")

    # Wait for audio ready
    for i in range(80):
        time.sleep(1)
        state = page.evaluate("""() => {
            const a = document.getElementById('audio-player');
            const active = document.querySelector('.lyric-line.active');
            return {
                t: a?.currentTime?.toFixed(2),
                paused: a?.paused,
                ready: a?.readyState,
                activeText: active?.textContent?.slice(0, 20),
                activeIdx: active?.dataset?.idx,
                timeData: active?.dataset?.time,
            };
        }""")
        # Only print when currentTime changes or every 5s
        if i % 5 == 0 or state['t'] != '0.00':
            print(f"[{i+1:3d}s] t={state['t']:>7s}  ready={state['ready']}  activeIdx={state['activeIdx']}  tData={state['timeData']}  '{state['activeText']}'")
        if state['t'] != '0.00' and float(state['t']) > 5:
            break

    page.screenshot(path='D:/project/diag-final-sync.png', full_page=True)
    browser.close()
