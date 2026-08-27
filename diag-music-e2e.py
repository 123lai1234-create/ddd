"""
E2E test: verify LRC synced lyrics actually work in production.

Approach: use Playwright with --autoplay-policy=no-user-gesture-required
so audio.play() works without click. Then wait, check currentTime advances,
and verify lyrics get .active class.
"""
import sys, time, json
from playwright.sync_api import sync_playwright

PROD = "https://donttalk.vercel.app/music"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--autoplay-policy=no-user-gesture-required",
                "--no-sandbox",
                "--disable-features=AudioServiceOutOfProcess",
            ]
        )
        context = browser.new_context()
        page = context.new_page()

        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_logs.append(f"[error] {err}"))

        print("→ Loading page...")
        page.goto(PROD, wait_until="domcontentloaded", timeout=30000)
        time.sleep(5)  # wait for tracks.json + playlist render

        # Check that tracks.json loaded with LRC urls
        print("\n→ Checking playlist state in JS...")
        result = page.evaluate("""() => {
            const items = document.querySelectorAll('.playlist-item');
            const firstFew = Array.from(items).slice(0, 5).map(el => ({
                title: el.querySelector('.playlist-item-title')?.textContent,
                idx: el.dataset.index,
            }));
            return { count: items.length, sample: firstFew };
        }""")
        print(f"   playlist items: {result['count']}")
        for s in result['sample']:
            print(f"   [{s['idx']}] {s['title']}")

        # Find a track with LRC (e.g., index 1 = 03_不服輸(優化版))
        # Click the playlist item
        print("\n→ Clicking track at index 1 (should have LRC)...")
        page.evaluate("""() => {
            const item = document.querySelectorAll('.playlist-item')[1];
            if (item) item.click();
        }""")
        time.sleep(2)

        # Check audio state
        print("\n→ Checking audio element...")
        audio_info = page.evaluate("""() => {
            const a = document.getElementById('audio-player');
            return {
                src: a?.src,
                paused: a?.paused,
                currentTime: a?.currentTime,
                duration: a?.duration,
                readyState: a?.readyState,
                error: a?.error?.message,
            };
        }""")
        print(f"   audio: {audio_info}")

        # Check lyrics rendered
        print("\n→ Checking lyrics container...")
        lyrics_info = page.evaluate("""() => {
            const el = document.getElementById('lyrics');
            const lines = el?.querySelectorAll('.lyric-line') || [];
            const dataTimes = Array.from(lines).slice(0, 5).map(l => l.dataset.time);
            return {
                innerText: el?.innerText?.slice(0, 100),
                lineCount: lines.length,
                dataTimes: dataTimes,
            };
        }""")
        print(f"   lyrics: {lyrics_info}")

        # Wait for playback to advance
        print("\n→ Waiting 8s for playback to advance...")
        time.sleep(8)

        # Check active line
        active_info = page.evaluate("""() => {
            const active = document.querySelector('.lyric-line.active');
            const passed = document.querySelectorAll('.lyric-line.passed');
            const a = document.getElementById('audio-player');
            return {
                currentTime: a?.currentTime,
                activeLine: active?.textContent,
                activeIdx: active?.dataset?.idx,
                passedCount: passed.length,
            };
        }""")
        print(f"   playback: {active_info}")

        # Screenshot
        page.screenshot(path='D:/project/diag-lyrics-active.png', full_page=True)
        print("\n→ Screenshot saved: D:/project/diag-lyrics-active.png")

        # Print console logs
        print("\n→ Console logs:")
        for log in console_logs[-30:]:
            print(f"   {log}")

        browser.close()

if __name__ == "__main__":
    main()
