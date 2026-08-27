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

    print("Loading stock-app...")
    page.goto("https://donttalk.vercel.app/stock-app", wait_until="domcontentloaded", timeout=30000)

    time.sleep(5)
    try:
        page.wait_for_selector("#chart-container canvas", timeout=15000)
    except Exception as e:
        print(f"  Canvas wait failed: {e}")
    time.sleep(3)

    page.screenshot(path=r"D:\project\stock-2330.png", full_page=False)
    print("Screenshot 1 saved: stock-2330.png")

    # Click 2454
    try:
        page.click(".stock-item[data-code='2454']", timeout=5000)
        time.sleep(3)
        page.screenshot(path=r"D:\project\stock-2454.png", full_page=False)
        print("Screenshot 2 saved: stock-2454.png")
    except Exception as e:
        print(f"  Click 2454 failed: {e}")

    # Dashboard
    page.goto("https://donttalk.vercel.app/stock-app/dashboard", wait_until="domcontentloaded", timeout=30000)
    time.sleep(5)
    page.screenshot(path=r"D:\project\stock-dashboard.png", full_page=False)
    print("Screenshot 3 saved: stock-dashboard.png")

    # signal-filter
    page.goto("https://donttalk.vercel.app/stock-app/signal-filter", wait_until="domcontentloaded", timeout=30000)
    time.sleep(5)
    page.screenshot(path=r"D:\project\stock-signal-filter.png", full_page=False)
    print("Screenshot 4 saved: stock-signal-filter.png")

    # sold-too-early
    page.goto("https://donttalk.vercel.app/stock-app/sold-too-early", wait_until="domcontentloaded", timeout=30000)
    time.sleep(10)
    page.screenshot(path=r"D:\project\stock-sold-too-early.png", full_page=False)
    print("Screenshot 5 saved: stock-sold-too-early.png")

    print(f"\n=== Console logs: {len(console_logs)} ===")
    for log in console_logs:
        print(f"  [{log['type']}] {log['text'][:200]}")
    print(f"\n=== Page errors: {len(page_errors)} ===")
    for e in page_errors:
        print(f"  {e[:200]}")

    browser.close()
