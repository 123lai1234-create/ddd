from playwright.sync_api import sync_playwright
import time, json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = ctx.new_page()
    print("Loading music page (latest deploy)...")
    page.goto("https://donttalk-c2sxspc9n-donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(5)

    # 找有 LRC 的歌（07_愛的模樣）
    page.evaluate("""() => {
      const items = document.querySelectorAll('.playlist-item');
      for (let i = 0; i < items.length; i++) {
        if (items[i].innerText.match(/愛的模樣/)) { items[i].click(); return; }
      }
    }""")
    time.sleep(2)

    # 觸發播放
    try:
      page.evaluate("document.querySelector('audio').play()")
    except: pass
    time.sleep(2)

    info0 = page.evaluate("""() => {
      const lines = document.querySelectorAll('.lyric-line');
      const audio = document.querySelector('audio');
      return {
        currentTime: audio.currentTime,
        total: lines.length,
        withTime: Array.from(lines).filter(l => l.dataset.time != null).length,
        firstLine: lines[0] ? lines[0].textContent : null,
        title: document.getElementById('track-title').textContent
      };
    }""")
    print(f"T+0s: {json.dumps(info0, ensure_ascii=False)}")

    # 等 5 秒看高亮
    time.sleep(5)
    info1 = page.evaluate("""() => {
      const lines = document.querySelectorAll('.lyric-line');
      const audio = document.querySelector('audio');
      const active = document.querySelector('.lyric-line.active');
      return {
        currentTime: audio.currentTime,
        activeText: active ? active.textContent : null,
        activeTime: active && active.dataset.time ? parseFloat(active.dataset.time) : null,
        activeIdx: active ? Array.from(lines).indexOf(active) : -1,
        passedCount: document.querySelectorAll('.lyric-line.passed').length
      };
    }""")
    print(f"T+5s: {json.dumps(info1, ensure_ascii=False)}")

    # 再等 8 秒
    time.sleep(8)
    info2 = page.evaluate("""() => {
      const lines = document.querySelectorAll('.lyric-line');
      const audio = document.querySelector('audio');
      const active = document.querySelector('.lyric-line.active');
      return {
        currentTime: audio.currentTime,
        activeText: active ? active.textContent : null,
        activeIdx: active ? Array.from(lines).indexOf(active) : -1,
        passedCount: document.querySelectorAll('.lyric-line.passed').length
      };
    }""")
    print(f"T+13s: {json.dumps(info2, ensure_ascii=False)}")

    page.screenshot(path="music-lyrics-final.png", full_page=False)
    print("Saved music-lyrics-final.png")
    browser.close()
print("Done.")
