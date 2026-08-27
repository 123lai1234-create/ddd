"""
Real sync test: use a real MP3 file from the project. Run a local HTTP server
to serve it on localhost, so the audio actually plays in headless Chrome.
"""
from playwright.sync_api import sync_playwright
import time, sys, glob, threading, http.server, socketserver, os

sys.stdout.reconfigure(encoding='utf-8')

# Pick the smallest MP3 to make tests fast
mp3_files = sorted(glob.glob('astro/public/music/*.mp3'), key=lambda f: os.path.getsize(f))
print(f"MP3 candidates: {[os.path.basename(f) for f in mp3_files[:5]]}")

# Start a local server to serve the music dir
PORT = 18888
os.chdir('astro/public')
handler = http.server.SimpleHTTPRequestHandler
httpd = socketserver.TCPServer(("", PORT), handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
print(f"Local server: http://localhost:{PORT}/music/")

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context().new_page()
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(2)

    # Intercept music requests to use local server
    def route_handler(route):
        url = route.request.url
        if '/music/' in url and 'donttalk' in url:
            # Replace with local
            new_url = url.replace('https://donttalk.vercel.app/music/', f'http://localhost:{PORT}/music/')
            return route.continue_(url=new_url)
        route.continue_()

    page.route("**/*", route_handler)

    # Click track 19
    page.evaluate("() => document.querySelectorAll('.playlist-item')[19]?.click()")

    # Wait for audio to start
    print("\nWaiting for audio to start...")
    for i in range(30):
        time.sleep(1)
        t = page.evaluate("() => document.getElementById('audio-player').currentTime")
        if t and t > 1:
            print(f"  Audio started at t={t:.2f}s after {i+1}s")
            break
        if i % 5 == 4:
            print(f"  [{i+1}s] t={t}")

    # Sample sync
    print("\n=== Sampling sync every 1s ===")
    for i in range(30):
        time.sleep(1)
        s = page.evaluate("""() => {
            const a = document.getElementById('audio-player');
            const active = document.querySelector('.lyric-line.active');
            const passed = document.querySelectorAll('.lyric-line.passed');
            const total = document.querySelectorAll('.lyric-line').length;
            return {
                t: a?.currentTime,
                activeText: active?.textContent,
                activeIdx: active?.dataset?.idx,
                activeTime: active?.dataset?.time,
                passedCount: passed.length,
                total,
            };
        }""")
        print(f"[{i:2d}s] t={s['t']:6.2f}  idx={s['activeIdx']}  tData={s['activeTime']}  passed={s['passedCount']}/{s['total']}  '{s['activeText']}'")
        if s['t'] and s['t'] > 25:
            break

    page.screenshot(path='D:/project/diag-real-sync.png', full_page=True)
    browser.close()
    httpd.shutdown()
