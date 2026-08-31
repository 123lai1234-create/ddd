"""E2E test: 進 production music 頁，click 一首有 LRC 的歌，看歌詞 sync 是否真的 work"""
from playwright.sync_api import sync_playwright
import time, sys, json

sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=[
            "--autoplay-policy=no-user-gesture-required",
            "--no-sandbox",
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
        ],
    )
    page = browser.new_context().new_page()

    # Capture errors / network
    console_logs = []
    page.on("console", lambda m: console_logs.append(f"[{m.type}] {m.text}"))
    page.on("pageerror", lambda e: console_logs.append(f"[ERR] {e}"))

    requests = []
    page.on("request", lambda r: requests.append(r.url) if '.lrc' in r.url or 'tracks.json' in r.url or 'music-player' in r.url else None)

    print("=== Loading music page ===")
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(3)

    # Check playlist
    info = page.evaluate("""() => {
        const items = document.querySelectorAll('.playlist-item');
        return {
            count: items.length,
            first: items[0]?.querySelector('.playlist-item-title')?.textContent,
        };
    }""")
    print(f"Playlist: {info['count']} items, first: {info['first']}")

    # Check LRC preload
    print("\n=== Network requests for LRC / tracks.json ===")
    for r in requests[:30]:
        print(f"  {r}")

    # Find a track with LRC and click it
    print("\n=== Find track with LRC ===")
    track_info = page.evaluate("""() => {
        // Find a track whose data shows it has lyrics
        const titles = Array.from(document.querySelectorAll('.playlist-item-title'));
        return titles.slice(0, 10).map(t => t.textContent);
    }""")
    for i, t in enumerate(track_info):
        print(f"  [{i}] {t}")

    # Click first track (assume has LRC)
    print("\n=== Click track 0 ===")
    page.evaluate("() => document.querySelectorAll('.playlist-item')[0]?.click()")
    time.sleep(2)

    # Check lyrics container state
    state = page.evaluate("""() => {
        const ly = document.getElementById('lyrics');
        const a = document.getElementById('audio-player');
        return {
            lyricsText: ly?.innerText?.slice(0, 100),
            lineCount: ly?.querySelectorAll('.lyric-line').length,
            audioSrc: a?.src,
            audioPaused: a?.paused,
            audioCurrent: a?.currentTime,
            audioReady: a?.readyState,
        };
    }""")
    print(f"State: {json.dumps(state, ensure_ascii=False)}")

    # Wait for LRC to load (preloadAllLyrics + LRC fetch)
    print("\n=== Wait 8s for LRC + audio start ===")
    time.sleep(8)
    state2 = page.evaluate("""() => {
        const ly = document.getElementById('lyrics');
        const a = document.getElementById('audio-player');
        const active = document.querySelector('.lyric-line.active');
        return {
            lineCount: ly?.querySelectorAll('.lyric-line').length,
            firstLineTime: ly?.querySelector('.lyric-line')?.dataset?.time,
            audioCurrent: a?.currentTime,
            audioPaused: a?.paused,
            audioReady: a?.readyState,
            activeText: active?.textContent,
            activeIdx: active?.dataset?.idx,
        };
    }""")
    print(f"State 2: {json.dumps(state2, ensure_ascii=False)}")

    # Print console
    print("\n=== Console logs ===")
    for log in console_logs[-20:]:
        print(f"  {log[:200]}")

    # Screenshot
    page.screenshot(path='D:/project/diag-prod-current.png', full_page=True)

    browser.close()
