from playwright.sync_api import sync_playwright
import time, json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = context.new_page()

    console_logs = []
    page.on("console", lambda msg: console_logs.append({"type": msg.type, "text": msg.text}))

    page_errors = []
    page.on("pageerror", lambda err: page_errors.append(str(err)))

    requests = []
    page.on("request", lambda req: requests.append({"url": req.url, "method": req.method, "type": req.resource_type}))

    responses = []
    page.on("response", lambda res: responses.append({"url": res.url, "status": res.status, "type": res.request.resource_type}))

    print("Loading music page...")
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(4)

    # Check song list
    song_count = page.evaluate("document.querySelectorAll('.playlist-item').length")
    print(f"Songs in playlist: {song_count}")

    # Try clicking first song
    if song_count > 0:
        page.evaluate("document.querySelector('.playlist-item').click()")
        time.sleep(2)
        # Check audio element
        audio_info = page.evaluate("""() => {
          const a = document.querySelector('audio');
          if (!a) return {exists: false};
          return {
            exists: true,
            src: a.currentSrc || a.src,
            paused: a.paused,
            readyState: a.readyState,
            networkState: a.networkState,
            duration: a.duration,
            error: a.error ? a.error.code : null
          };
        }""")
        print(f"Audio element: {json.dumps(audio_info, indent=2, ensure_ascii=False)}")

        # Try clicking play button
        play_btn = page.query_selector("#play-btn, .play-btn, button[onclick*='play'], button:has(.play-icon)")
        if play_btn:
            play_btn.click()
            time.sleep(3)
            audio_info2 = page.evaluate("""() => {
              const a = document.querySelector('audio');
              if (!a) return {exists: false};
              return {
                paused: a.paused,
                currentTime: a.currentTime,
                readyState: a.readyState,
                error: a.error ? a.error.code : null
              };
            }""")
            print(f"After play click: {json.dumps(audio_info2, indent=2, ensure_ascii=False)}")

    # Network requests for audio
    audio_reqs = [r for r in requests if r['type'] in ('media', 'fetch', 'xhr') and ('.mp3' in r['url'] or '/api' in r['url'] or 'audio' in r['url'].lower())]
    print(f"\nAudio-related requests ({len(audio_reqs)}):")
    for r in audio_reqs[:15]:
        print(f"  [{r['type']}] {r['url'][:120]}")

    # Audio responses
    audio_resps = [r for r in responses if r['type'] in ('media',) or '.mp3' in r['url'] or '/api' in r['url']]
    print(f"\nAudio-related responses ({len(audio_resps)}):")
    for r in audio_resps[:15]:
        print(f"  [{r['status']}] [{r['type']}] {r['url'][:120]}")

    # Console errors
    print(f"\nPage errors ({len(page_errors)}):")
    for e in page_errors:
        print(f"  ERR: {e[:300]}")

    # Console errors
    err_logs = [l for l in console_logs if l['type'] == 'error']
    print(f"\nConsole errors ({len(err_logs)}):")
    for l in err_logs[:15]:
        print(f"  [{l['type']}] {l['text'][:200]}")

    browser.close()
print("Done.")
