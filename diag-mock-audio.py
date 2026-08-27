"""
Bypass real audio: use a data: URI silent MP3 and force the player logic
to think it's playing. Then verify the sync code path works.
"""
from playwright.sync_api import sync_playwright
import time, json, sys, base64

sys.stdout.reconfigure(encoding='utf-8')

# Tiny 1-second silent MP3 (base64 encoded)
SILENT_MP3_B64 = "SUQzAwAAAAACdFRJVDIAAAAdAAADc2lsZW5jZS5tcDMAVENPTgAAAAYAAANNUDMAVFlFUgAAAAUAAAMyMDIzAFRBTEIAAABMAAAATEFNRTMuMTAwACAAAAAZGF0YQAAAAA="

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context().new_page()
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(2)

    print("=== Inject silent audio + force play ===")
    # Override the audio src to a data: URI, then click track
    page.evaluate(f"""() => {{
        const a = document.getElementById('audio-player');
        a.src = 'data:audio/mpeg;base64,{SILENT_MP3_B64}';
    }}""")
    time.sleep(0.5)

    # Click track 19
    page.evaluate("() => document.querySelectorAll('.playlist-item')[19]?.click()")
    time.sleep(2)

    # Force-set src AFTER click (since playTrack sets it)
    page.evaluate(f"""() => {{
        const a = document.getElementById('audio-player');
        a.src = 'data:audio/mpeg;base64,{SILENT_MP3_B64}';
        a.play().then(() => console.log('[mock] playing')).catch(e => console.warn('[mock] play err', e));
    }}""")

    # Manually advance currentTime and dispatch timeupdate
    print("\n=== Manually advance currentTime ===")
    for t_target in [1, 5, 15, 30, 60, 90, 120]:
        page.evaluate(f"""() => {{
            const a = document.getElementById('audio-player');
            a.currentTime = {t_target};
            a.dispatchEvent(new Event('timeupdate'));
        }}""")
        time.sleep(0.3)
        s = page.evaluate("""() => {
            const a = document.getElementById('audio-player');
            const active = document.querySelector('.lyric-line.active');
            const passed = document.querySelectorAll('.lyric-line.passed');
            return {
                t: a?.currentTime,
                activeText: active?.textContent,
                activeIdx: active?.dataset?.idx,
                activeTime: active?.dataset?.time,
                passedCount: passed.length,
            };
        }""")
        print(f"[t={t_target:3d}s] cur={s['t']:6.2f}  activeIdx={s['activeIdx']}  dataTime={s['activeTime']}  passed={s['passedCount']}  '{s['activeText']}'")

    page.screenshot(path='D:/project/diag-mock-sync.png', full_page=True)
    browser.close()
