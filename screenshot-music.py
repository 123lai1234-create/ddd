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

    failed_requests = []
    page.on("requestfailed", lambda req: failed_requests.append({"url": req.url, "failure": req.failure}))

    print("Loading music page (new deploy)...")
    page.goto("https://donttalk-pcspemcr7-donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(4)
    page.screenshot(path="music-after-fix.png", full_page=False)

    # zoom in on bottom-right (search avatar)
    page.screenshot(path="music-avatar-zoom.png", clip={"x": 1700, "y": 950, "width": 200, "height": 130})

    # count SVG presence
    svg_count = page.evaluate("document.querySelectorAll('svg#search-avatar').length")
    img_aliyun = page.evaluate("Array.from(document.querySelectorAll('img')).filter(i => i.src.includes('aliyuncs')).length")

    print(f"SVG search-avatar count: {svg_count}")
    print(f"Old aliyun <img> tags: {img_aliyun}")
    print(f"Page errors: {len(page_errors)}")
    for e in page_errors:
        print(f"  ERR: {e[:150]}")
    print(f"Failed requests: {len(failed_requests)}")
    for r in failed_requests:
        print(f"  FAILED: {r['url'][:100]} - {r['failure']}")
    print(f"Console logs: {len(console_logs)}")
    for log in console_logs[:10]:
        print(f"  [{log['type']}] {log['text'][:120]}")

    browser.close()
print("Done.")
