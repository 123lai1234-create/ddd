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

    print("Loading music page...")
    page.goto("https://donttalk-p7h3bf9q8-donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(5)

    # Playlist size
    song_count = page.evaluate("document.querySelectorAll('.playlist-item').length")
    print(f"Songs in playlist: {song_count}")

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
            error: a.error ? a.error.code : null
          };
        }""")
        print(f"After click first song:")
        print(json.dumps(audio_info, indent=2, ensure_ascii=False))

        track_info = page.evaluate("""() => ({
          title: document.getElementById('track-title').textContent,
          artist: document.getElementById('track-artist').textContent,
          timeTotal: document.getElementById('time-total').textContent
        })""")
        print(f"Track info: {track_info}")

        # Try to play
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
        print(f"After play(): {after_play}")

    # Check if any track has a real cover (not emoji)
    cover_info = page.evaluate("""() => {
      const items = Array.from(document.querySelectorAll('.playlist-item')).slice(0, 5);
      return items.map(i => {
        const c = i.querySelector('.playlist-item-cover');
        return {
          html: c ? c.innerHTML.slice(0, 200) : null
        };
      });
    }""")
    print(f"First 5 cover html:")
    for c in cover_info:
        print(f"  {c}")

    # Screenshot
    page.screenshot(path="music-final-test.png", full_page=False)
    print("Saved music-final-test.png")

    # Console
    music_logs = [l for l in console_logs if 'music' in l['text'].lower() or l['type'] == 'error']
    print(f"\nMusic-related logs ({len(music_logs)}):")
    for l in music_logs[:8]:
        print(f"  [{l['type']}] {l['text'][:200]}")

    browser.close()
print("Done.")
