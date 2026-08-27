"""
Check if lyrics are loaded at all
"""
from playwright.sync_api import sync_playwright
import time, sys

sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context().new_page()

    # Capture console for debugging
    page.on("console", lambda m: print(f"[CONSOLE.{m.type}] {m.text}"))

    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(2)

    # Click track 19 (時光膠囊 with LRC)
    page.evaluate("() => document.querySelectorAll('.playlist-item')[19]?.click()")
    time.sleep(2)

    # Check lyrics state
    state = page.evaluate("""() => {
        const ly = document.getElementById('lyrics');
        return {
            innerHTML: ly?.innerHTML?.slice(0, 300),
            innerText: ly?.innerText,
            childCount: ly?.children?.length,
            firstChildClass: ly?.children[0]?.className,
        };
    }""")
    print(f"\nLYRICS STATE:\n{state}")

    # Also fetch LRC directly to see what content the LRC has
    lrc = page.evaluate("""async () => {
        const r = await fetch('/music/13_%E6%99%82%E5%85%89%E8%86%98%E8%86%9B.lrc');
        return { status: r.status, body: await r.text() };
    }""")
    print(f"\nLRC FETCH: status={lrc['status']}")
    print(f"LRC CONTENT (first 500 chars):\n{lrc['body'][:500]}")

    browser.close()
