"""Force audio.play() and timeupdate to see if sync works"""
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
    time.sleep(3)

    # Click track 0 (兄弟本色 - has LRC at 01_兄弟本色.lrc)
    print("=== Click track 0 ===")
    page.evaluate("() => document.querySelectorAll('.playlist-item')[0]?.click()")
    time.sleep(3)

    # Check what classes the lyrics have
    info = page.evaluate("""() => {
        const ly = document.getElementById('lyrics');
        const container = document.getElementById('lyrics-container');
        return {
            lyricsClass: ly?.className,
            containerClass: container?.className,
            lineCount: ly?.querySelectorAll('.lyric-line').length,
            activeCount: ly?.querySelectorAll('.lyric-line.active').length,
            passedCount: ly?.querySelectorAll('.lyric-line.passed').length,
            firstLineHTML: ly?.querySelector('.lyric-line')?.outerHTML?.slice(0, 200),
            activeHTML: ly?.querySelector('.lyric-line.active')?.outerHTML?.slice(0, 200),
        };
    }""")
    print(f"Lyrics info: {json.dumps(info, ensure_ascii=False)}")

    # Now manually advance audio.currentTime to see if active class moves
    print("\n=== Manually advance audio.currentTime ===")
    for t in [1, 5, 15, 20, 30, 50, 100, 130]:
        page.evaluate(f"""() => {{
            const a = document.getElementById('audio-player');
            a.currentTime = {t};
            a.dispatchEvent(new Event('timeupdate'));
        }}""")
        time.sleep(0.5)
        s = page.evaluate("""() => {
            const active = document.querySelector('.lyric-line.active');
            const passed = document.querySelectorAll('.lyric-line.passed').length;
            const total = document.querySelectorAll('.lyric-line').length;
            return {
                activeText: active?.textContent?.slice(0, 30),
                activeIdx: active?.dataset?.idx,
                activeTime: active?.dataset?.time,
                passed: passed,
                total: total,
            };
        }""")
        print(f"  t={t:>3}s  idx={s['activeIdx']}  tData={s['activeTime']}  passed={s['passed']}/{s['total']}  '{s['activeText']}'")

    page.screenshot(path='D:/project/diag-sync-final.png', full_page=True)
    browser.close()
