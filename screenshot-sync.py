"""Screenshot production with active lyric line"""
from playwright.sync_api import sync_playwright
import time, sys

sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context(viewport={'width': 1280, 'height': 900}).new_page()
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(3)

    # Click track 0
    page.evaluate("() => document.querySelectorAll('.playlist-item')[0]?.click()")
    time.sleep(3)

    # Force currentTime to 30s to see mid-song lyrics
    page.evaluate("""() => {
        const a = document.getElementById('audio-player');
        a.currentTime = 30;
        a.dispatchEvent(new Event('timeupdate'));
    }""")
    time.sleep(1)

    # Get the active line + screenshot
    state = page.evaluate("""() => {
        const active = document.querySelector('.lyric-line.active');
        const ly = document.getElementById('lyrics');
        if (!ly) return null;
        // Get computed style of active line
        const cs = active ? window.getComputedStyle(active) : null;
        return {
            activeText: active?.textContent,
            activeIdx: active?.dataset?.idx,
            color: cs?.color,
            opacity: cs?.opacity,
            fontWeight: cs?.fontWeight,
            transform: cs?.transform,
        };
    }""")
    print('Active state at t=30s:')
    import json
    print(json.dumps(state, ensure_ascii=False, indent=2))

    page.screenshot(path='D:/project/sync-active-30s.png', full_page=True)
    print('\nScreenshot: D:/project/sync-active-30s.png')

    # Also force t=50s
    page.evaluate("""() => {
        const a = document.getElementById('audio-player');
        a.currentTime = 50;
        a.dispatchEvent(new Event('timeupdate'));
    }""")
    time.sleep(1)
    state2 = page.evaluate("""() => {
        const active = document.querySelector('.lyric-line.active');
        return {
            activeText: active?.textContent,
            activeIdx: active?.dataset?.idx,
        };
    }""")
    print(f'\nActive state at t=50s: {json.dumps(state2, ensure_ascii=False)}')
    page.screenshot(path='D:/project/sync-active-50s.png', full_page=True)

    browser.close()
