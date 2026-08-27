"""Deep diagnostic: track ALL network requests, check what's happening with LRC"""
from playwright.sync_api import sync_playwright
import time, json

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=[
            "--autoplay-policy=no-user-gesture-required",
            "--no-sandbox",
        ]
    )
    page = browser.new_context().new_page()

    all_reqs = []
    page.on("request", lambda r: all_reqs.append(("REQ", r.method, r.url)))
    page.on("response", lambda r: all_reqs.append(("RES", r.status, r.url)))
    page.on("console", lambda m: all_reqs.append(("LOG", m.type, m.text)))
    page.on("pageerror", lambda e: all_reqs.append(("ERR", "", str(e))))

    print("=== Load page ===")
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(3)

    # Snapshot before click
    print("\n=== BEFORE click ===")
    state = page.evaluate("""() => {
        const a = document.getElementById('audio-player');
        return {
            audioSrc: a?.src,
            playlistCount: document.querySelectorAll('.playlist-item').length,
        };
    }""")
    print(json.dumps(state, ensure_ascii=False))

    print("\n=== Click track 1 ===")
    page.evaluate("""() => {
        const items = document.querySelectorAll('.playlist-item');
        if (items[1]) items[1].click();
    }""")

    # Check after 1s
    time.sleep(1)
    s1 = page.evaluate("""() => {
        const a = document.getElementById('audio-player');
        const ly = document.getElementById('lyrics');
        return {
            audioPaused: a?.paused,
            audioCur: a?.currentTime,
            audioReady: a?.readyState,
            audioDur: a?.duration,
            lyricsText: ly?.innerText,
            lyricCount: ly?.querySelectorAll('.lyric-line').length,
            firstDataTime: ly?.querySelector('.lyric-line')?.dataset?.time,
        };
    }""")
    print(f"\n1s after click: {json.dumps(s1, ensure_ascii=False)}")

    time.sleep(4)
    s2 = page.evaluate("""() => {
        const a = document.getElementById('audio-player');
        const ly = document.getElementById('lyrics');
        return {
            audioPaused: a?.paused,
            audioCur: a?.currentTime,
            audioReady: a?.readyState,
            audioDur: a?.duration,
            lyricsText: ly?.innerText?.slice(0, 80),
            lyricCount: ly?.querySelectorAll('.lyric-line').length,
            firstLine: ly?.querySelector('.lyric-line')?.textContent,
            firstDataTime: ly?.querySelector('.lyric-line')?.dataset?.time,
        };
    }""")
    print(f"\n5s after click: {json.dumps(s2, ensure_ascii=False)}")

    # Print all music-related network activity
    print("\n=== Network: music/* and scripts/music* ===")
    for kind, status, url in all_reqs:
        if 'music' in url and ('mp3' in url or 'lrc' in url or 'json' in url or 'player' in url):
            print(f"{kind:4s} {status!s:5s} {url}")

    print("\n=== Console logs (last 20) ===")
    for kind, status, url in all_reqs[-30:]:
        if kind == 'LOG' or kind == 'ERR':
            print(f"{kind} {status} {url}")

    browser.close()
