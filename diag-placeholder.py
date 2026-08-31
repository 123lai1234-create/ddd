"""Verify placeholder works for track 3 (no LRC)"""
from playwright.sync_api import sync_playwright
import time, sys, json

sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context().new_page()

    console_logs = []
    page.on("console", lambda m: console_logs.append(f'[{m.type}] {m.text}'))

    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(3)

    # Click track 3 (再站起來 - no LRC)
    print("=== Click track 3 (no LRC) ===")
    page.evaluate("() => document.querySelectorAll('.playlist-item')[3]?.click()")
    time.sleep(2)

    info = page.evaluate("""() => {
        const ly = document.getElementById('lyrics');
        const lines = ly?.querySelectorAll('.lyric-line') || [];
        return {
            lineCount: lines.length,
            lines: Array.from(lines).slice(0, 8).map(l => l.textContent),
            firstTime: lines[0]?.dataset?.time,
            secondTime: lines[1]?.dataset?.time,
        };
    }""")
    print(f"Lyrics lines: {json.dumps(info, ensure_ascii=False, indent=2)}")

    # Force currentTime to verify sync (track 3 is 381s, 8 lines = 47.6s per line)
    print("\n=== Force currentTime=10s, 50s, 100s, 200s, 300s ===")
    for t in [10, 50, 100, 200, 300]:
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
        print(f"  t={t}s  -> {json.dumps(s, ensure_ascii=False)}")

    # Console logs
    print("\n=== Console (last 10) ===")
    for log in console_logs[-10:]:
        print(f"  {log[:150]}")

    browser.close()
