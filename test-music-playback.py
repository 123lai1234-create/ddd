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

    failed = []
    page.on("requestfailed", lambda req: failed.append({"url": req.url, "failure": req.failure}))

    print("Loading music page (new deploy)...")
    page.goto("https://donttalk-9vokv7xx5-donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(5)  # let tracks.json fetch

    # Check playlist size
    song_count = page.evaluate("document.querySelectorAll('.playlist-item').length")
    print(f"Songs in playlist: {song_count}")

    # Check if a real track exists
    has_real_url = page.evaluate("""() => {
      const items = document.querySelectorAll('.playlist-item');
      for (const item of items) {
        const a = document.querySelector('audio');
      }
      // try to access state
      return typeof window.__musicState !== 'undefined' ? window.__musicState : 'no_state';
    }""")

    # Click first song
    if song_count > 0:
        page.evaluate("document.querySelectorAll('.playlist-item')[0].click()")
        time.sleep(2)
        audio_info = page.evaluate("""() => {
          const a = document.querySelector('audio');
          return {
            src: a.currentSrc || a.src,
            paused: a.paused,
            readyState: a.readyState,
            networkState: a.networkState,
            duration: a.duration,
            error: a.error ? a.error.code : null,
            currentTime: a.currentTime
          };
        }""")
        print(f"After click first song:")
        print(json.dumps(audio_info, indent=2, ensure_ascii=False))

        # Check track info display
        track_info = page.evaluate("""() => ({
          title: document.getElementById('track-title').textContent,
          artist: document.getElementById('track-artist').textContent,
          timeTotal: document.getElementById('time-total').textContent
        })""")
        print(f"Track info: {json.dumps(track_info, ensure_ascii=False)}")

        # Wait a bit and try to play
        time.sleep(1)
        try:
            page.evaluate("document.querySelector('audio').play()")
        except Exception as e:
            print(f"play() error: {e}")
        time.sleep(3)
        after_play = page.evaluate("""() => {
          const a = document.querySelector('audio');
          return {
            paused: a.paused,
            currentTime: a.currentTime,
            duration: a.duration,
            readyState: a.readyState
          };
        }""")
        print(f"After play(): {json.dumps(after_play, indent=2, ensure_ascii=False)}")

    # Console errors
    err_logs = [l for l in console_logs if l['type'] == 'error']
    print(f"\nConsole errors ({len(err_logs)}):")
    for l in err_logs[:10]:
        print(f"  [{l['type']}] {l['text'][:150]}")
    warn_logs = [l for l in console_logs if l['type'] == 'warning' and 'music' in l['text']]
    print(f"\nMusic warnings ({len(warn_logs)}):")
    for l in warn_logs[:5]:
        print(f"  [{l['type']}] {l['text'][:150]}")

    print(f"\nPage errors ({len(page_errors)}):")
    for e in page_errors[:5]:
        print(f"  ERR: {e[:150]}")

    # Screenshot
    page.screenshot(path="music-with-tracks.png", full_page=False)
    print("Saved music-with-tracks.png")

    browser.close()
print("Done.")
