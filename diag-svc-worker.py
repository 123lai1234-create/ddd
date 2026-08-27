"""Check service worker, also do raw fetch from page context"""
from playwright.sync_api import sync_playwright
import time, sys

sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    )
    page = browser.new_context().new_page()
    page.goto("https://donttalk.vercel.app/music", wait_until="domcontentloaded", timeout=30000)
    time.sleep(2)

    # Check service workers
    sw = page.evaluate("""async () => {
        if (!('serviceWorker' in navigator)) return 'no SW API';
        const regs = await navigator.serviceWorker.getRegistrations();
        return regs.map(r => ({ scope: r.scope, active: r.active?.scriptURL }));
    }""")
    print(f'Service workers: {sw}')

    # Click track 19 to trigger LRC fetch
    page.evaluate("() => document.querySelectorAll('.playlist-item')[19]?.click()")
    time.sleep(3)

    # Now do a raw fetch from the page (bypassing any potential interception)
    print("\n=== Raw fetch from page context ===")
    for url in [
        '/music/13_時光膠囊.lrc',
        '/music/tracks.json',
        '/music/03_不服輸.lrc',
    ]:
        t = time.time()
        try:
            r = page.evaluate(f"""async () => {{
                const r = await fetch('{url}', {{ cache: 'no-store' }});
                return {{ status: r.status, body: (await r.text()).slice(0, 200) }};
            }}""")
            print(f'  {time.time()-t:.1f}s  {r["status"]}  {url}  body={r["body"][:60]!r}')
        except Exception as e:
            print(f'  ERR  {url}  {e}')

    browser.close()
