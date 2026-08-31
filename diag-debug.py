"""Debug: check what the rendered HTML actually looks like"""
from playwright.sync_api import sync_playwright
import time, sys, json
sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context().new_page()
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(4)

    # Click track 25 (内卷共和国)
    page.evaluate("() => document.querySelectorAll('.playlist-item')[25]?.click()")
    time.sleep(3)

    # Get actual HTML
    state = page.evaluate("""() => {
        const ly = document.getElementById('lyrics');
        return {
            innerHTML: ly?.innerHTML?.slice(0, 1000),
            lineCount: ly?.querySelectorAll('.lyric-line').length,
            firstLineText: ly?.querySelector('.lyric-line')?.textContent,
            firstLineHTML: ly?.querySelector('.lyric-line')?.outerHTML?.slice(0, 300),
        };
    }""")
    print(f"HTML: {state['innerHTML'][:600]}")
    print(f"\nlineCount: {state['lineCount']}")
    print(f"first line text: {state['firstLineText']!r}")
    print(f"first line HTML: {state['firstLineHTML']}")

    # Force currentTime to 50s
    page.evaluate("""() => {
        const a = document.getElementById('audio-player');
        a.currentTime = 50;
        a.dispatchEvent(new Event('timeupdate'));
    }""")
    time.sleep(0.5)
    s = page.evaluate("""() => {
        const active = document.querySelector('.lyric-line.active');
        return {
            text: active?.textContent,
            idx: active?.dataset?.idx,
            time: active?.dataset?.time,
        };
    }""")
    print(f"\nAt t=50s: {json.dumps(s, ensure_ascii=False)}")

    browser.close()
