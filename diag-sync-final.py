"""Final sync test with proper UTF-8 handling"""
from playwright.sync_api import sync_playwright
import time, json, sys

sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context().new_page()
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(2)

    print("=== Click track 19 (時光膠囊) ===")
    page.evaluate("() => document.querySelectorAll('.playlist-item')[19]?.click()")

    # Wait for audio to actually start
    print("\nWaiting for audio to load (max 90s)...")
    started = False
    for i in range(90):
        time.sleep(1)
        state = page.evaluate("""() => {
            const a = document.getElementById('audio-player');
            return { t: a?.currentTime, ready: a?.readyState, paused: a?.paused };
        }""")
        if state['t'] and state['t'] > 1:
            print(f"  Audio started at t={state['t']:.2f}s after {i+1}s")
            started = True
            break
        if i % 10 == 9:
            print(f"  [{i+1}s] t={state.get('t')}, ready={state.get('ready')}")

    if not started:
        print("  Audio never started in 90s - skipping sync test")
        page.screenshot(path='D:/project/diag-no-start.png', full_page=True)
        browser.close()
        sys.exit(1)

    # Now sample sync every 1s
    print("\n=== Sampling sync for 20s ===")
    for i in range(20):
        time.sleep(1)
        s = page.evaluate("""() => {
            const a = document.getElementById('audio-player');
            const active = document.querySelector('.lyric-line.active');
            const passed = document.querySelectorAll('.lyric-line.passed');
            return {
                t: a?.currentTime,
                activeText: active?.textContent,
                activeIdx: active?.dataset?.idx,
                activeTime: active?.dataset?.time,
                passedCount: passed.length,
            };
        }""")
        print(f"[{i+1:2d}s] t={s['t']:6.2f}  activeIdx={s['activeIdx']}  dataTime={s['activeTime']}  passed={s['passedCount']}  '{s['activeText']}'")

    page.screenshot(path='D:/project/diag-final-sync.png', full_page=True)
    browser.close()
