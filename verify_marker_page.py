"""Playwright 開瀏覽器實打 marker_history 頁面 + console check"""
import sys
from playwright.sync_api import sync_playwright

url = "https://donttalk.vercel.app/stock/marker_history"
screenshot_path = "D:/project/marker_history_after_fix.png"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()

    console_msgs = []
    failed_reqs = []
    api_responses = []

    def on_console(msg):
        console_msgs.append({"type": msg.type, "text": msg.text})

    def on_request_failed(req):
        failed_reqs.append({"url": req.url, "method": req.method, "failure": str(req.failure)})

    def on_response(resp):
        if "/api/markers" in resp.url:
            api_responses.append({"status": resp.status, "url": resp.url.replace("https://donttalk.vercel.app", "")})

    page.on("console", on_console)
    page.on("requestfailed", on_request_failed)
    page.on("response", on_response)

    import time
    t0 = time.time()
    page.goto(url, wait_until="networkidle", timeout=30000)
    dt_ms = int((time.time() - t0) * 1000)
    print(f"page loaded in {dt_ms}ms\n")

    meta = page.locator("#meta").text_content()
    print(f"meta: {meta}")

    rows = page.locator("#tbody tr").evaluate_all(
        "(trs) => trs.slice(0, 5).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()))"
    )
    print(f"\nfirst {len(rows)} rows:")
    for r in rows:
        print(f"  {r}")

    total = page.locator("#tbody tr").count()
    print(f"\ntbody total rows: {total}")

    print(f"\napi responses ({len(api_responses)}):")
    for a in api_responses:
        print(f"  {a['status']} {a['url']}")

    errors = [m for m in console_msgs if m["type"] == "error"]
    print(f"\nconsole errors: {len(errors)}")
    for e in errors:
        print(f"  ✗ {e['text']}")

    print(f"\nfailed requests: {len(failed_reqs)}")
    for f in failed_reqs:
        print(f"  ✗ {f['method']} {f['url']} {f['failure']}")

    page.screenshot(path=screenshot_path, full_page=False)
    print(f"\nscreenshot saved: {screenshot_path}")

    browser.close()
