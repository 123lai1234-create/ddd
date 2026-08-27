from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.headless.chromium.launch() if False else p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = ctx.new_page()
    print("Loading prod music page...")
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(4)

    # 切到有 LRC 的歌
    page.evaluate("""() => {
      const items = document.querySelectorAll('.playlist-item');
      for (let i = 0; i < items.length; i++) {
        if (items[i].innerText.match(/愛的模樣|如果有一天|我願意/)) { items[i].click(); return; }
      }
    }""")
    time.sleep(3)
    page.screenshot(path="music-lyrics-ui.png", full_page=False)
    print("Saved music-lyrics-ui.png")
    browser.close()
