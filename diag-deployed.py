"""Verify auto-LRC sync works on production"""
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

    # Find a track with auto-LRC
    print("=== Check tracks.json has LRC for new tracks ===")
    info = page.evaluate("""() => {
        const items = document.querySelectorAll('.playlist-item');
        return {
            count: items.length,
            titles: Array.from(items).slice(25, 40).map(t => t.querySelector('.playlist-item-title')?.textContent),
        };
    }""")
    print(f"tracks: {info['count']}, sample (25-39): {info['titles']}")

    # Click track 25 (first AI Demo - 内卷共和国)
    print("\n=== Click track 25 (内卷共和国 - auto-LRC) ===")
    page.evaluate("() => document.querySelectorAll('.playlist-item')[25]?.click()")
    time.sleep(3)

    state = page.evaluate("""() => {
        const ly = document.getElementById('lyrics');
        const lines = ly?.querySelectorAll('.lyric-line') || [];
        return {
            lineCount: lines.length,
            firstLine: lines[0]?.textContent,
            firstTime: lines[0]?.dataset?.time,
            secondLine: lines[1]?.textContent,
        };
    }""")
    print(f"Initial state: {json.dumps(state, ensure_ascii=False)}")

    # Force currentTime to test sync
    print("\n=== Force currentTime to test sync ===")
    for t in [10, 40, 80, 120, 160]:
        page.evaluate(f"""() => {{
            const a = document.getElementById('audio-player');
            a.currentTime = {t};
            a.dispatchEvent(new Event('timeupdate'));
        }}""")
        time.sleep(0.5)
        s = page.evaluate("""() => {
            const active = document.querySelector('.lyric-line.active');
            return {
                text: active?.textContent,
                idx: active?.dataset?.idx,
                time: active?.dataset?.time,
            };
        }""")
        print(f"  t={t}s -> {json.dumps(s, ensure_ascii=False)}")

    browser.close()
