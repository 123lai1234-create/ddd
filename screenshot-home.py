from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = context.new_page()
    console_logs = []
    page.on("console", lambda msg: console_logs.append({"type": msg.type, "text": msg.text}))
    page_errors = []
    page.on("pageerror", lambda err: page_errors.append(str(err)))

    print("Loading home...")
    page.goto("https://donttalk-pcspemcr7-donttalk.vercel.app/", wait_until="domcontentloaded", timeout=30000)
    time.sleep(3)
    page.screenshot(path="home-after-fix.png", clip={"x": 1700, "y": 50, "width": 220, "height": 1020})

    svg_count = page.evaluate("document.querySelectorAll('svg#chatbot-avatar').length")
    img_aliyun = page.evaluate("Array.from(document.querySelectorAll('img')).filter(i => i.src.includes('aliyuncs')).length")
    has_filter = page.evaluate("typeof console.error === 'function' && console.error.toString().indexOf('isExtNoise') >= 0")

    print(f"SVG chatbot-avatar count: {svg_count}")
    print(f"Old aliyun <img> tags: {img_aliyun}")
    print(f"console.error filter installed: {has_filter}")
    print(f"Page errors: {len(page_errors)}")
    for e in page_errors[:5]:
        print(f"  ERR: {e[:150]}")

    # Try to simulate Immersive Translate's classList error to see if filter catches it
    page.evaluate("""
      var img = document.createElement('img');
      img.src = 'about:blank';
      document.body.appendChild(img);
      // Simulate the error from a fake extension URL
      var fakeErr = new Error("Cannot read properties of null (reading 'classList')");
      fakeErr.stack = "at py (content_main.js:5468:17175)\\n  at H (content_guard.js:1:1)";
      console.error(fakeErr);
    """)
    time.sleep(0.5)
    # Count how many console.error messages came through
    err_logs = [l for l in console_logs if l['type'] == 'error']
    print(f"Total console.error after test injection: {len(err_logs)} (filter should swallow the fake extension one)")
    for l in err_logs[-3:]:
        print(f"  [{l['type']}] {l['text'][:120]}")

    browser.close()
print("Done.")
