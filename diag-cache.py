"""Hard refresh - bypass cache"""
from playwright.sync_api import sync_playwright
import time, sys
sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    context = browser.new_context()
    # Clear cache and bypass
    context.set_extra_http_headers({"Cache-Control": "no-cache, no-store"})
    page = context.new_page()
    page.goto("https://donttalk.vercel.app/music?nocache=" + str(int(time.time())), wait_until="domcontentloaded", timeout=30000)
    time.sleep(4)

    # Click track 25
    page.evaluate("() => document.querySelectorAll('.playlist-item')[25]?.click()")
    time.sleep(3)

    state = page.evaluate("""() => {
        const ly = document.getElementById('lyrics');
        return {
            lineCount: ly?.querySelectorAll('.lyric-line').length,
            firstText: ly?.querySelector('.lyric-line')?.textContent,
        };
    }""")
    print(f"After cache bypass: lineCount={state['lineCount']}, first={state['firstText'][:50]!r}")

    # Force currentTime
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
        };
    }""")
    print(f"At t=50s: {s}")

    browser.close()
