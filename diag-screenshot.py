"""Take a screenshot of the current music page in production to see the UI"""
from playwright.sync_api import sync_playwright
import time, sys

sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context(viewport={'width': 1280, 'height': 800}).new_page()
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(3)

    # Click a track with LRC
    page.evaluate("() => document.querySelectorAll('.playlist-item')[1]?.click()")
    time.sleep(5)

    # Force the audio to play by setting src to data URI silent
    page.evaluate("""() => {
        const a = document.getElementById('audio-player');
        // Manually set currentTime to simulate playback
        Object.defineProperty(a, 'currentTime', { value: 15, writable: true, configurable: true });
        a.dispatchEvent(new Event('timeupdate'));
    }""")
    time.sleep(2)

    # Take screenshot
    page.screenshot(path='D:/project/diag-current-ui.png', full_page=True)

    # Check active line
    state = page.evaluate("""() => {
        const active = document.querySelector('.lyric-line.active');
        const ly = document.getElementById('lyrics');
        const lc = document.getElementById('lyrics-container');
        return {
            activeText: active?.textContent,
            activeIdx: active?.dataset?.idx,
            lineCount: ly?.querySelectorAll('.lyric-line').length,
            containerHeight: lc?.offsetHeight,
            containerScrollTop: lc?.scrollTop,
        };
    }""")
    print(f"State: {state}")

    browser.close()
