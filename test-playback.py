from playwright.sync_api import sync_playwright
import time, json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = ctx.new_page()

    # 監聽音頻錯誤
    audio_errors = []
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {str(err)[:200]}"))

    print("Loading music page...")
    page.goto("https://donttalk-c2sxspc9n-donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(5)

    # 點歌
    page.evaluate("""() => {
      const items = document.querySelectorAll('.playlist-item');
      for (let i = 0; i < items.length; i++) {
        if (items[i].innerText.match(/愛的模樣/)) { items[i].click(); return; }
      }
    }""")
    time.sleep(2)

    # 用 user gesture 點 play 按鈕
    play_btn = page.query_selector("#play-btn")
    if play_btn:
        play_btn.click(force=True)
    time.sleep(3)

    info = page.evaluate("""() => {
      const audio = document.querySelector('audio');
      return {
        currentTime: audio.currentTime,
        duration: audio.duration,
        paused: audio.paused,
        readyState: audio.readyState,
        networkState: audio.networkState,
        error: audio.error ? audio.error.code : null,
        src: audio.currentSrc || audio.src
      };
    }""")
    print(f"After play click: {json.dumps(info, ensure_ascii=False)}")

    # Try to also do programmatic play (with muted to bypass autoplay)
    page.evaluate("""async () => {
      const audio = document.querySelector('audio');
      audio.muted = true;
      try { await audio.play(); } catch (e) { console.log('play err:', e); }
    }""")
    time.sleep(2)
    info2 = page.evaluate("""() => {
      const audio = document.querySelector('audio');
      return { currentTime: audio.currentTime, paused: audio.paused, readyState: audio.readyState };
    }""")
    print(f"After muted play(): {info2}")

    # Check lyrics sync
    time.sleep(5)
    sync_info = page.evaluate("""() => {
      const lines = document.querySelectorAll('.lyric-line');
      const active = document.querySelector('.lyric-line.active');
      const audio = document.querySelector('audio');
      return {
        currentTime: audio.currentTime,
        activeText: active ? active.textContent : null,
        activeIdx: active ? Array.from(lines).indexOf(active) : -1,
        passed: document.querySelectorAll('.lyric-line.passed').length,
        total: lines.length
      };
    }""")
    print(f"Sync status: {json.dumps(sync_info, ensure_ascii=False)}")

    page.screenshot(path="music-lyrics-final.png", full_page=False)
    browser.close()
print("Done.")
