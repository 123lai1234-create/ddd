"""Capture exact browser request URL for LRC"""
from playwright.sync_api import sync_playwright
import time, sys

sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context().new_page()

    # Capture all music-related requests
    reqs = []
    def on_req(r):
        if 'lrc' in r.url.lower() or 'lyric' in r.url.lower() or 'music' in r.url.lower():
            reqs.append(('REQ', r.method, r.url))
    def on_res(r):
        if 'lrc' in r.url.lower() or 'lyric' in r.url.lower() or 'music' in r.url.lower():
            reqs.append(('RES', r.status, r.url))

    page.on('request', on_req)
    page.on('response', on_res)

    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(2)

    # Click track 19 (時光膠囊 with LRC)
    page.evaluate("() => document.querySelectorAll('.playlist-item')[19]?.click()")
    time.sleep(5)

    print("=== LRC-related requests ===")
    for kind, status, url in reqs:
        print(f'  {kind:4s} {status!s:5s} {url}')

    # Also check what lyricsUrl is in the playlist
    urls = page.evaluate("""() => {
        const items = window.state?.playlist || [];
        return items.filter(t => t.lyricsUrl).map(t => ({
            title: t.title,
            url: t.url,
            lrc: t.lyricsUrl,
        }));
    }""")
    print(f"\n=== LRC URLs in playlist ===")
    for u in urls:
        print(f'  {u["title"]:30s}  mp3={u["url"]!r}  lrc={u["lrc"]!r}')

    browser.close()
