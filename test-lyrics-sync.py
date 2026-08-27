from playwright.sync_api import sync_playwright
import time, json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = context.new_page()

    console_logs = []
    page.on("console", lambda msg: console_logs.append({"type": msg.type, "text": msg.text}))

    print("Loading music page...")
    page.goto("https://donttalk-l5z460mpc-donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(5)

    # 找有 LRC 歌詞的歌（07_愛的模樣 / 11_如果有一天 等）
    # 切到有 LRC 的歌，順序：第 7 首（index 6）
    # 找到第一個有 lyricsTimed 的歌
    target_idx = page.evaluate("""() => {
      const items = document.querySelectorAll('.playlist-item');
      for (let i = 0; i < items.length; i++) {
        const t = items[i].innerText;
        if (t.match(/愛的模樣|如果有一天|我願意|老家的巷子|城市的夜/)) {
          return i;
        }
      }
      return 0;
    }""")
    print(f"Target track index: {target_idx}")

    # Click that track
    page.evaluate(f"document.querySelectorAll('.playlist-item')[{target_idx}].click()")
    time.sleep(2)

    # 觸發播放
    try:
        page.evaluate("document.querySelector('audio').play()")
    except Exception as e:
        pass
    time.sleep(2)

    # 查 .lyric-line 數量
    lyric_count = page.evaluate("document.querySelectorAll('.lyric-line').length")
    print(f"Lyric lines: {lyric_count}")

    # 看看有沒有 data-time 屬性（LRC 模式）
    has_data_time = page.evaluate("""() => {
      const lines = document.querySelectorAll('.lyric-line');
      let withTime = 0;
      for (const l of lines) if (l.dataset.time != null) withTime++;
      return withTime;
    }""")
    print(f"Lines with data-time (LRC): {has_data_time}")

    # 過 3 秒後看高亮行
    time.sleep(3)
    info = page.evaluate("""() => {
      const lines = document.querySelectorAll('.lyric-line');
      const active = document.querySelector('.lyric-line.active');
      const passed = document.querySelectorAll('.lyric-line.passed').length;
      return {
        currentTime: document.querySelector('audio').currentTime,
        activeText: active ? active.textContent : null,
        activeTime: active ? parseFloat(active.dataset.time) : null,
        activeIdx: active ? Array.from(lines).indexOf(active) : -1,
        passedCount: passed,
        total: lines.length
      };
    }""")
    print(f"After 3s: {json.dumps(info, ensure_ascii=False)}")

    # 再過 3 秒
    time.sleep(3)
    info2 = page.evaluate("""() => {
      const lines = document.querySelectorAll('.lyric-line');
      const active = document.querySelector('.lyric-line.active');
      return {
        currentTime: document.querySelector('audio').currentTime,
        activeText: active ? active.textContent : null,
        activeTime: active ? parseFloat(active.dataset.time) : null,
        activeIdx: active ? Array.from(lines).indexOf(active) : -1,
        passedCount: document.querySelectorAll('.lyric-line.passed').length
      };
    }""")
    print(f"After 6s: {json.dumps(info2, ensure_ascii=False)}")

    # 截圖當前狀態
    page.screenshot(path="lyrics-sync-test.png", full_page=False)

    # 切到無 LRC 的歌
    print("Switching to track without LRC...")
    page.evaluate(f"""() => {{
      const items = document.querySelectorAll('.playlist-item');
      // 找第 2 首（應該是 不服輸(優化版) — 也有 LRC）或第 1 首（兄弟本色 — 沒 LRC）
      for (let i = 0; i < items.length; i++) {{
        const t = items[i].innerText;
        if (t.match(/兄弟本色|再站起來|水泥森林/)) {{
          items[i].click();
          return;
        }}
      }}
    }}""")
    time.sleep(2)
    fallback_info = page.evaluate("""() => {
      const lines = document.querySelectorAll('.lyric-line');
      const withTime = Array.from(lines).filter(l => l.dataset.time != null).length;
      return {
        total: lines.length,
        withTime: withTime,
        title: document.getElementById('track-title').textContent
      };
    }""")
    print(f"Fallback (no LRC): {json.dumps(fallback_info, ensure_ascii=False)}")

    browser.close()
print("Done.")
