"""
Debug - find exact line via setData wrapper
"""
from playwright.sync_api import sync_playwright
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

errors = []
console_logs = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900})
    page = ctx.new_page()
    page.on('pageerror', lambda exc: errors.append(f"PAGEERROR: {exc}"))
    page.on('console', lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
    page.goto('https://donttalk.vercel.app/stock', wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(2000)
    iframe = None
    for f in page.frames:
        if 'stock-app' in f.url:
            iframe = f
            break
    if not iframe:
        print("no iframe"); browser.close(); sys.exit(1)
    # Patch the loadIndexChart function itself by wrapping inner calls
    iframe.evaluate("""() => {
        // Try wrapping _fixChartTimes and others
        const targets = ['_fixChartTimes', '_fixTime', '_fixTime', 'setData', 'setMarkers'];
        // Hook into Promise.prototype.then to catch errors at any .then
        const origThen = Promise.prototype.then;
        // Better: wrap candleSeries.setData
        const origShow = window.showToast;
        window.showToast = function(msg, type) {
            console.log('TOAST: ' + msg);
            return origShow.apply(this, arguments);
        };
        // Hook fetch globally
        const origFetch = window.fetch;
        window.fetch = function(...args) {
            const url = args[0];
            return origFetch.apply(this, args).then(
                r => { console.log('FETCH_OK: ' + url); return r; },
                e => { console.log('FETCH_FAIL: ' + url + ' - ' + e.message); throw e; }
            );
        };
    }""")
    iframe.evaluate("""() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('加權'));
        if (btn) btn.click();
    }""")
    page.wait_for_timeout(8000)
    # Now look at the source HTML to find the position_history, etc fetches
    # and trace the issue
    state = iframe.evaluate("""() => {
        return {
            mode: typeof currentMode !== 'undefined' ? currentMode : 'undef',
            indexTicker: typeof currentIndexTicker !== 'undefined' ? currentIndexTicker : 'undef',
            summaryHTML: (document.getElementById('indexSummaryPanel') || {}).innerHTML?.slice(0, 200),
            gapsHTML: (document.getElementById('indexGapList') || {}).innerHTML?.slice(0, 200),
            dipHTML: (document.getElementById('indexDipAlertContent') || {}).innerHTML?.slice(0, 200),
        };
    }""")
    print("STATE:", state)
    browser.close()

print("=== CONSOLE ===")
for line in console_logs:
    if 'FETCH' in line or 'TOAST' in line or 'map' in line.lower() or '載入' in line:
        print(line)
